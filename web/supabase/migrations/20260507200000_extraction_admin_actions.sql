-- =====================================================
-- Fase 3 - Painel admin: ações operacionais
--
-- RPCs disponíveis apenas para usuários com role 'owner' ou 'admin'
-- (verificação via public.is_admin(auth.uid())).
--
-- Atende:
--   - retry de uma URL específica da DLQ
--   - deletar uma entrada específica da DLQ
--   - limpar DLQ por filtro (engine + error_type, ambos opcionais)
--   - re-enrichment forçado de uma engine (volta partial/completed/failed
--     para 'discovered' e zera attempts)
--   - listar vagas próximas dos 90 dias (para ação manual antes do purge)
-- =====================================================

-- Guard helper: levanta se o caller não é admin/owner.
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._require_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._require_admin() TO authenticated;


-- ---------------- admin_retry_dlq_url ----------------
-- Move uma URL da DLQ de volta para extraction_jobs como 'discovered',
-- zerando attempts. A URL volta a ser tentada no próximo passe de
-- reenrichment do scraper. Retorna 1 se moveu, 0 se não havia entrada.
CREATE OR REPLACE FUNCTION public.admin_retry_dlq_url(p_job_url TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.extraction_dlq%ROWTYPE;
  affected  INTEGER := 0;
BEGIN
  PERFORM public._require_admin();

  SELECT * INTO v_row
  FROM public.extraction_dlq
  WHERE job_url = p_job_url
  ORDER BY failed_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  INSERT INTO public.extraction_jobs AS j (
    job_url, domain, engine, state, attempts,
    parser_version, last_error_type, last_error_msg,
    discovered_at, last_attempt_at
  )
  VALUES (
    v_row.job_url, v_row.domain, v_row.engine, 'discovered', 0,
    v_row.parser_version, NULL, NULL,
    COALESCE(v_row.discovered_at, NOW()), NULL
  )
  ON CONFLICT (job_url) DO UPDATE SET
    state           = 'discovered',
    attempts        = 0,
    last_error_type = NULL,
    last_error_msg  = NULL;

  DELETE FROM public.extraction_dlq WHERE job_url = p_job_url;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

REVOKE ALL ON FUNCTION public.admin_retry_dlq_url(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_retry_dlq_url(TEXT) TO authenticated;


-- ---------------- admin_delete_dlq_entry ----------------
-- Apaga permanentemente todas as entradas da DLQ para uma URL.
-- Não toca em extraction_jobs (a URL pode permanecer 'failed' lá).
CREATE OR REPLACE FUNCTION public.admin_delete_dlq_entry(p_job_url TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  PERFORM public._require_admin();
  DELETE FROM public.extraction_dlq WHERE job_url = p_job_url;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_dlq_entry(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_dlq_entry(TEXT) TO authenticated;


-- ---------------- admin_clear_dlq ----------------
-- Apaga DLQ por filtro. Ambos parâmetros opcionais (NULL = ignora filtro).
-- Retorna o número de linhas afetadas.
CREATE OR REPLACE FUNCTION public.admin_clear_dlq(
  p_engine     TEXT DEFAULT NULL,
  p_error_type TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  PERFORM public._require_admin();

  DELETE FROM public.extraction_dlq
  WHERE (p_engine     IS NULL OR engine          = p_engine)
    AND (p_error_type IS NULL OR last_error_type = p_error_type);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

REVOKE ALL ON FUNCTION public.admin_clear_dlq(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_dlq(TEXT, TEXT) TO authenticated;


-- ---------------- admin_reenrich_engine ----------------
-- Marca todas as URLs de uma engine (em estados não-running) como
-- 'discovered', zerando attempts. Útil quando o parser foi atualizado
-- e queremos forçar reprocessamento sem esperar o auto-reenrichment.
-- Não mexe em URLs em 'running' para não atrapalhar coletas em andamento.
CREATE OR REPLACE FUNCTION public.admin_reenrich_engine(p_engine TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  PERFORM public._require_admin();

  IF p_engine IS NULL OR length(trim(p_engine)) = 0 THEN
    RAISE EXCEPTION 'engine is required';
  END IF;

  UPDATE public.extraction_jobs
     SET state           = 'discovered',
         attempts        = 0,
         last_error_type = NULL,
         last_error_msg  = NULL
   WHERE engine = p_engine
     AND state IN ('partial','failed','blocked','completed');

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

REVOKE ALL ON FUNCTION public.admin_reenrich_engine(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reenrich_engine(TEXT) TO authenticated;


-- =====================================================
-- Vagas próximas dos 90 dias (near-purge)
--
-- Lista vagas com publication_date entre (hoje - p_max_age_days) e
-- (hoje - p_min_age_days). Ordenadas pelas mais antigas primeiro.
-- Default: idade entre 80 e 90 dias = "estão prestes a sumir do JSON".
--
-- Como a nova política de purge mantém vagas no banco indefinidamente,
-- esta função permite ao admin agir antes do JSON deixar de exibi-las.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_jobs_near_purge(
  p_min_age_days INTEGER DEFAULT 80,
  p_max_age_days INTEGER DEFAULT 90,
  p_engine       TEXT    DEFAULT NULL,
  p_max_rows     INTEGER DEFAULT 200
)
RETURNS TABLE (
  id               UUID,
  job_title        TEXT,
  job_url          TEXT,
  source           TEXT,
  publication_date DATE,
  age_days         INTEGER,
  location_raw     TEXT,
  state_code       TEXT,
  country_code     TEXT,
  hiring_regime    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  PERFORM public._require_admin();

  RETURN QUERY
  SELECT
    j.id,
    j.job_title,
    j.job_url,
    j.source,
    j.publication_date,
    (CURRENT_DATE - j.publication_date)::INTEGER AS age_days,
    j.location_raw,
    j.state_code,
    j.country_code,
    j.hiring_regime
  FROM public.jobs j
  WHERE j.publication_date IS NOT NULL
    AND j.publication_date <= CURRENT_DATE - (p_min_age_days || ' days')::INTERVAL
    AND j.publication_date >= CURRENT_DATE - (p_max_age_days || ' days')::INTERVAL
    AND (p_engine IS NULL OR j.source = p_engine)
  ORDER BY j.publication_date ASC, j.id ASC
  LIMIT p_max_rows;
END $$;

REVOKE ALL ON FUNCTION public.get_jobs_near_purge(INTEGER, INTEGER, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_jobs_near_purge(INTEGER, INTEGER, TEXT, INTEGER) TO authenticated;

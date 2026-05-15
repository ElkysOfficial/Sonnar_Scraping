-- =====================================================
-- Fase 3 da auditoria: checkpoint persistente, idempotência e DLQ.
--
-- Tabelas:
--   public.extraction_jobs   estado por URL descoberta
--   public.extraction_dlq    dead-letter queue (URLs que falharam N vezes)
--
-- Estados (extraction_jobs.state):
--   discovered  -> URL achada no listing, ainda não foi buscada
--   running     -> detail-fetch em andamento
--   partial     -> seed gravado mas detail falhou (best-effort)
--   completed   -> dado final persistido em todos os sinks
--   failed      -> última tentativa falhou (será reintroduzida)
--   blocked     -> domínio em quarentena (circuit aberto)
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'extraction_state') THEN
    CREATE TYPE public.extraction_state AS ENUM (
      'discovered','running','partial','completed','failed','blocked'
    );
  END IF;
END $$;


-- ---------------- extraction_jobs ----------------
CREATE TABLE IF NOT EXISTS public.extraction_jobs (
  job_url         TEXT PRIMARY KEY,
  domain          TEXT NOT NULL,
  engine          TEXT NOT NULL,
  state           public.extraction_state NOT NULL DEFAULT 'discovered',
  attempts        INTEGER NOT NULL DEFAULT 0,
  parser_version  TEXT,
  payload_hash    TEXT,
  last_error_type TEXT,
  last_error_msg  TEXT,
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_state          ON public.extraction_jobs (state);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_domain_state   ON public.extraction_jobs (domain, state);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_engine_state   ON public.extraction_jobs (engine, state);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_last_attempt   ON public.extraction_jobs (last_attempt_at DESC);

ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.extraction_jobs FROM anon, authenticated;

DROP POLICY IF EXISTS "admins read extraction_jobs" ON public.extraction_jobs;
CREATE POLICY "admins read extraction_jobs" ON public.extraction_jobs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('owner','admin')
  ));

COMMENT ON TABLE public.extraction_jobs IS
  'Estado de extração por URL. Permite retomada após queda e idempotência.';


-- ---------------- extraction_dlq ----------------
CREATE TABLE IF NOT EXISTS public.extraction_dlq (
  id              BIGSERIAL PRIMARY KEY,
  job_url         TEXT NOT NULL,
  domain          TEXT NOT NULL,
  engine          TEXT NOT NULL,
  attempts        INTEGER NOT NULL,
  last_error_type TEXT,
  last_error_msg  TEXT,
  parser_version  TEXT,
  discovered_at   TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_dlq_failed_at ON public.extraction_dlq (failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_dlq_engine    ON public.extraction_dlq (engine, failed_at DESC);

ALTER TABLE public.extraction_dlq ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.extraction_dlq FROM anon, authenticated;

DROP POLICY IF EXISTS "admins read extraction_dlq" ON public.extraction_dlq;
CREATE POLICY "admins read extraction_dlq" ON public.extraction_dlq
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('owner','admin')
  ));


-- =====================================================
-- Reenrichment automático: quando o parser_version muda no código,
-- o scraper marca as URLs antigas como 'discovered' para reprocessar.
-- Esta função é chamada pelo Python no startup (1 chamada por engine).
-- =====================================================
CREATE OR REPLACE FUNCTION public.requeue_stale_partial(
  p_engine          TEXT,
  p_parser_version  TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.extraction_jobs
     SET state = 'discovered',
         attempts = 0,
         last_error_type = NULL,
         last_error_msg  = NULL
   WHERE engine = p_engine
     AND state IN ('partial','failed')
     AND (parser_version IS NULL OR parser_version <> p_parser_version);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

REVOKE ALL ON FUNCTION public.requeue_stale_partial(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requeue_stale_partial(TEXT, TEXT) TO service_role;


-- URLs pendentes para o reenrichment pass (state=discovered que NÃO vem
-- do listing atual). Limit configurável.
CREATE OR REPLACE FUNCTION public.pick_pending_urls(
  p_engine    TEXT,
  p_limit     INTEGER DEFAULT 100
)
RETURNS TABLE (job_url TEXT, attempts INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT job_url, attempts
  FROM public.extraction_jobs
  WHERE engine = p_engine
    AND state = 'discovered'
  ORDER BY discovered_at ASC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.pick_pending_urls(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_pending_urls(TEXT, INTEGER) TO service_role;


-- =====================================================
-- RPCs para o dashboard
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_extraction_queue_stats()
RETURNS TABLE (
  state       TEXT,
  engine      TEXT,
  total       BIGINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT state::TEXT, engine, COUNT(*)::BIGINT
  FROM public.extraction_jobs
  GROUP BY state, engine
  ORDER BY 1, 2;
$$;


CREATE OR REPLACE FUNCTION public.get_extraction_dlq(window_minutes INTEGER DEFAULT 1440,
                                                     max_rows INTEGER DEFAULT 100)
RETURNS TABLE (
  job_url         TEXT,
  domain          TEXT,
  engine          TEXT,
  attempts        INTEGER,
  last_error_type TEXT,
  last_error_msg  TEXT,
  parser_version  TEXT,
  failed_at       TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT job_url, domain, engine, attempts, last_error_type,
         last_error_msg, parser_version, failed_at
  FROM public.extraction_dlq
  WHERE failed_at >= NOW() - (window_minutes || ' minutes')::INTERVAL
  ORDER BY failed_at DESC
  LIMIT max_rows;
$$;


CREATE OR REPLACE FUNCTION public.get_extraction_queue_summary()
RETURNS TABLE (
  discovered  BIGINT,
  running     BIGINT,
  partial     BIGINT,
  completed   BIGINT,
  failed      BIGINT,
  blocked     BIGINT,
  dlq_total   BIGINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN state='discovered' THEN 1 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN state='running'    THEN 1 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN state='partial'    THEN 1 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN state='completed'  THEN 1 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN state='failed'     THEN 1 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN state='blocked'    THEN 1 END), 0)::BIGINT,
    (SELECT COUNT(*) FROM public.extraction_dlq)::BIGINT
  FROM public.extraction_jobs;
$$;


REVOKE ALL ON FUNCTION public.get_extraction_queue_stats()                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_extraction_dlq(INTEGER, INTEGER)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_extraction_queue_summary()               FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_extraction_queue_stats()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_extraction_dlq(INTEGER, INTEGER)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_extraction_queue_summary()            TO authenticated;

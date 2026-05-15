-- =====================================================
-- Tabela public.jobs: vagas extraidas pelo data_collection.
--
-- Fluxo:
--   data_collection (Python, service-role)  →  upsert em public.jobs
--   landing-page    (anon)                  →  RPCs de agregacao publicas
--
-- A tabela bruta nunca eh exposta ao anon. Os totais e contagens
-- por UF/pais sao servidos por funcoes SECURITY DEFINER que
-- contornam a RLS de forma controlada.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_url          TEXT NOT NULL UNIQUE,
  job_title        TEXT NOT NULL,
  company          TEXT,
  location_raw     TEXT,
  state_code       TEXT,                                  -- 'SP', 'RJ'... apenas Brasil
  country_code     TEXT,                                  -- ISO-3166 alpha-2
  work_type        TEXT,
  hiring_regime    TEXT,
  salary_raw       TEXT,
  salary_min       INTEGER,
  salary_max       INTEGER,
  salary_currency  TEXT DEFAULT 'BRL',
  publication_date DATE,
  source           TEXT,                                  -- engine: 'linkedin', 'gupy'...
  scraped_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_scraped_at  ON public.jobs (scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_state_code  ON public.jobs (state_code)   WHERE state_code   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_country     ON public.jobs (country_code) WHERE country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_source      ON public.jobs (source);

-- updated_at automatico
DROP TRIGGER IF EXISTS trg_jobs_updated_at ON public.jobs;
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE  public.jobs              IS 'Vagas extraidas pelo data_collection. Upsert por job_url. Anon nao tem acesso direto.';
COMMENT ON COLUMN public.jobs.state_code   IS 'UF (SP, RJ...). NULL quando country_code != BR ou nao identificado.';
COMMENT ON COLUMN public.jobs.country_code IS 'ISO-3166 alpha-2 (BR, US, PT...). NULL quando nao identificado.';
COMMENT ON COLUMN public.jobs.source       IS 'Nome da engine que coletou (linkedin, gupy, indeed...).';

-- =====================================================
-- RLS: a tabela bruta eh privada. Apenas service_role
-- consegue ler/escrever. RPCs publicas servem agregados.
-- =====================================================
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Sem policies para anon/authenticated → nada de SELECT direto.
-- service_role bypassa RLS por padrao.

REVOKE ALL ON public.jobs FROM anon, authenticated;

-- Admins podem ler/atualizar via dashboard
DROP POLICY IF EXISTS "admins can read jobs"   ON public.jobs;
CREATE POLICY "admins can read jobs"
  ON public.jobs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('owner', 'admin')
  ));

-- =====================================================
-- RPCs publicas de agregacao (SECURITY DEFINER).
-- Acessiveis ao anon e authenticated; bypassam RLS de forma
-- controlada para retornar apenas contagens, jamais linhas brutas.
-- =====================================================

-- Estatisticas globais (totais e janela semanal)
CREATE OR REPLACE FUNCTION public.get_jobs_stats()
RETURNS TABLE (
  total_count     BIGINT,
  last_week_count BIGINT,
  last_scraped_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COUNT(*)::BIGINT                                                     AS total_count,
    COUNT(*) FILTER (WHERE scraped_at >= NOW() - INTERVAL '7 days')::BIGINT AS last_week_count,
    MAX(scraped_at)                                                      AS last_scraped_at
  FROM public.jobs;
$$;

-- Vagas por UF (apenas Brasil)
CREATE OR REPLACE FUNCTION public.get_jobs_by_uf()
RETURNS TABLE (
  state_code TEXT,
  count      BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT state_code, COUNT(*)::BIGINT
  FROM public.jobs
  WHERE state_code IS NOT NULL
    AND (country_code = 'BR' OR country_code IS NULL)
  GROUP BY state_code;
$$;

-- Vagas por pais
CREATE OR REPLACE FUNCTION public.get_jobs_by_country()
RETURNS TABLE (
  country_code TEXT,
  count        BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT country_code, COUNT(*)::BIGINT
  FROM public.jobs
  WHERE country_code IS NOT NULL
  GROUP BY country_code;
$$;

REVOKE ALL ON FUNCTION public.get_jobs_stats()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_jobs_by_uf()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_jobs_by_country() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_jobs_stats()      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_jobs_by_uf()      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_jobs_by_country() TO anon, authenticated;

COMMENT ON FUNCTION public.get_jobs_stats()      IS 'Totais publicos: total geral, vagas dos ultimos 7 dias, ultima coleta.';
COMMENT ON FUNCTION public.get_jobs_by_uf()      IS 'Contagem de vagas por UF (apenas Brasil). Para o mapa do Brasil.';
COMMENT ON FUNCTION public.get_jobs_by_country() IS 'Contagem de vagas por pais (ISO-3166 alpha-2). Para o mapa mundial.';

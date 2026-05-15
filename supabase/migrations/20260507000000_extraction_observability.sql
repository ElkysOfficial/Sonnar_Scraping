-- =====================================================
-- Observabilidade da engine de extração (data_collection).
--
-- Tabelas:
--   public.extraction_metrics  serie temporal (counter/gauge/timer)
--   public.extraction_events   eventos discretos (429, circuit open, parser error)
--   public.domain_circuits     estado atual do circuit breaker por domínio
--
-- Escrita: data_collection (service-role) faz POST direto via PostgREST.
-- Leitura: dashboard admin via RPCs SECURITY DEFINER (papel admin/owner).
-- =====================================================

-- ---------------- extraction_metrics ----------------
CREATE TABLE IF NOT EXISTS public.extraction_metrics (
  id           BIGSERIAL PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  host         TEXT,
  domain       TEXT,
  metric_type  TEXT NOT NULL,            -- 'counter' | 'gauge'
  metric_key   TEXT NOT NULL,            -- ex: 'status.429', 'latency.p95_ms'
  value        DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_extraction_metrics_ts        ON public.extraction_metrics (ts DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_metrics_domain_ts ON public.extraction_metrics (domain, ts DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_metrics_key_ts    ON public.extraction_metrics (metric_key, ts DESC);

ALTER TABLE public.extraction_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.extraction_metrics FROM anon, authenticated;

DROP POLICY IF EXISTS "admins read metrics" ON public.extraction_metrics;
CREATE POLICY "admins read metrics" ON public.extraction_metrics
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('owner','admin')
  ));

COMMENT ON TABLE public.extraction_metrics IS
  'Série temporal de métricas da engine de extração. Inserts em batch a cada flush (~30s).';


-- ---------------- extraction_events ----------------
CREATE TABLE IF NOT EXISTS public.extraction_events (
  id      BIGSERIAL PRIMARY KEY,
  ts      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  host    TEXT,
  kind    TEXT NOT NULL,           -- 'circuit.open', 'parser.error', 'engine.error', etc.
  domain  TEXT,
  data    JSONB
);

CREATE INDEX IF NOT EXISTS idx_extraction_events_ts        ON public.extraction_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_events_kind_ts   ON public.extraction_events (kind, ts DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_events_domain_ts ON public.extraction_events (domain, ts DESC);

ALTER TABLE public.extraction_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.extraction_events FROM anon, authenticated;

DROP POLICY IF EXISTS "admins read events" ON public.extraction_events;
CREATE POLICY "admins read events" ON public.extraction_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('owner','admin')
  ));


-- ---------------- domain_circuits ----------------
CREATE TABLE IF NOT EXISTS public.domain_circuits (
  domain          TEXT PRIMARY KEY,
  state           TEXT NOT NULL,        -- 'closed' | 'open' | 'half_open'
  open_until_s    DOUBLE PRECISION DEFAULT 0,
  error_rate      DOUBLE PRECISION DEFAULT 0,
  failures_5m     INTEGER DEFAULT 0,
  successes_5m    INTEGER DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.domain_circuits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.domain_circuits FROM anon, authenticated;

DROP POLICY IF EXISTS "admins read circuits" ON public.domain_circuits;
CREATE POLICY "admins read circuits" ON public.domain_circuits
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('owner','admin')
  ));


-- =====================================================
-- RPCs para o dashboard admin
-- =====================================================

-- Resumo agregado por domínio na janela informada (default 1h).
CREATE OR REPLACE FUNCTION public.get_scraper_summary(window_minutes INTEGER DEFAULT 60)
RETURNS TABLE (
  domain        TEXT,
  req_total     BIGINT,
  status_429    BIGINT,
  status_5xx    BIGINT,
  status_2xx    BIGINT,
  retries       BIGINT,
  exhausted     BIGINT,
  latency_p50   DOUBLE PRECISION,
  latency_p95   DOUBLE PRECISION,
  effective_rate DOUBLE PRECISION
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH win AS (
    SELECT * FROM public.extraction_metrics
    WHERE ts >= NOW() - (window_minutes || ' minutes')::INTERVAL
      AND domain IS NOT NULL
  )
  SELECT
    domain,
    COALESCE(SUM(CASE WHEN metric_key='req.total'      AND metric_type='counter' THEN value END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metric_key='status.429'     AND metric_type='counter' THEN value END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metric_key='status.5xx'     AND metric_type='counter' THEN value END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metric_key='status.2xx'     AND metric_type='counter' THEN value END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metric_key='retry.attempt'  AND metric_type='counter' THEN value END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metric_key='retry.exhausted' AND metric_type='counter' THEN value END), 0)::BIGINT,
    AVG(CASE WHEN metric_key='latency.p50_ms' THEN value END),
    AVG(CASE WHEN metric_key='latency.p95_ms' THEN value END),
    AVG(CASE WHEN metric_key='rate.effective' THEN value END)
  FROM win
  GROUP BY domain
  ORDER BY 2 DESC;
$$;


-- Série temporal (1 ponto por janela de N minutos) para gráfico do dashboard.
CREATE OR REPLACE FUNCTION public.get_scraper_timeseries(
  window_minutes INTEGER DEFAULT 60,
  bucket_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
  bucket_ts   TIMESTAMPTZ,
  domain      TEXT,
  metric_key  TEXT,
  value       DOUBLE PRECISION
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    date_bin((bucket_minutes || ' minutes')::INTERVAL, ts, TIMESTAMPTZ '2000-01-01') AS bucket_ts,
    domain,
    metric_key,
    SUM(CASE WHEN metric_type='counter' THEN value ELSE 0 END)
      + AVG(CASE WHEN metric_type='gauge' THEN value END) FILTER (WHERE metric_type='gauge')
      AS value
  FROM public.extraction_metrics
  WHERE ts >= NOW() - (window_minutes || ' minutes')::INTERVAL
    AND domain IS NOT NULL
    AND metric_key IN (
      'req.total','status.429','status.403','status.5xx','status.2xx',
      'retry.attempt','retry.exhausted',
      'latency.p50_ms','latency.p95_ms','rate.effective'
    )
  GROUP BY 1, 2, 3
  ORDER BY 1 ASC;
$$;


-- Estado atual dos circuit breakers
CREATE OR REPLACE FUNCTION public.get_scraper_circuits()
RETURNS TABLE (
  domain        TEXT,
  state         TEXT,
  open_until_s  DOUBLE PRECISION,
  error_rate    DOUBLE PRECISION,
  failures_5m   INTEGER,
  successes_5m  INTEGER,
  updated_at    TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT domain, state, open_until_s, error_rate,
         failures_5m, successes_5m, updated_at
  FROM public.domain_circuits
  ORDER BY (state <> 'closed') DESC, error_rate DESC, domain ASC;
$$;


-- Eventos recentes (últimos 200)
CREATE OR REPLACE FUNCTION public.get_scraper_events(
  window_minutes INTEGER DEFAULT 1440,
  max_rows INTEGER DEFAULT 200
)
RETURNS TABLE (
  ts      TIMESTAMPTZ,
  kind    TEXT,
  domain  TEXT,
  data    JSONB
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT ts, kind, domain, data
  FROM public.extraction_events
  WHERE ts >= NOW() - (window_minutes || ' minutes')::INTERVAL
  ORDER BY ts DESC
  LIMIT max_rows;
$$;


-- Resumo de saúde global (cards superiores do dashboard)
CREATE OR REPLACE FUNCTION public.get_scraper_health(window_minutes INTEGER DEFAULT 60)
RETURNS TABLE (
  total_requests        BIGINT,
  total_errors          BIGINT,
  error_rate            DOUBLE PRECISION,
  open_circuits         INTEGER,
  total_429             BIGINT,
  total_5xx             BIGINT,
  total_retries         BIGINT,
  jobs_persisted_ok     BIGINT,
  jobs_persisted_error  BIGINT,
  last_event_at         TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  WITH m AS (
    SELECT * FROM public.extraction_metrics
    WHERE ts >= NOW() - (window_minutes || ' minutes')::INTERVAL
  )
  SELECT
    COALESCE(SUM(CASE WHEN metric_key='req.total'        AND metric_type='counter' THEN value END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metric_key IN ('status.429','status.5xx') AND metric_type='counter' THEN value END), 0)::BIGINT,
    CASE
      WHEN COALESCE(SUM(CASE WHEN metric_key='req.total' AND metric_type='counter' THEN value END), 0) = 0 THEN 0
      ELSE COALESCE(SUM(CASE WHEN metric_key IN ('status.429','status.5xx') AND metric_type='counter' THEN value END), 0)::DOUBLE PRECISION
        / SUM(CASE WHEN metric_key='req.total' AND metric_type='counter' THEN value END)
    END,
    (SELECT COUNT(*) FROM public.domain_circuits WHERE state <> 'closed')::INTEGER,
    COALESCE(SUM(CASE WHEN metric_key='status.429'      AND metric_type='counter' THEN value END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metric_key='status.5xx'      AND metric_type='counter' THEN value END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metric_key='retry.attempt'   AND metric_type='counter' THEN value END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metric_key='persist.ok'      AND metric_type='counter' THEN value END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metric_key='persist.error'   AND metric_type='counter' THEN value END), 0)::BIGINT,
    (SELECT MAX(ts) FROM public.extraction_events)
  FROM m;
$$;


REVOKE ALL ON FUNCTION public.get_scraper_summary(INTEGER)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_scraper_timeseries(INTEGER, INTEGER)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_scraper_circuits()                         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_scraper_events(INTEGER, INTEGER)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_scraper_health(INTEGER)                    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_scraper_summary(INTEGER)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scraper_timeseries(INTEGER, INTEGER)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scraper_circuits()                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scraper_events(INTEGER, INTEGER)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scraper_health(INTEGER)                 TO authenticated;

COMMENT ON FUNCTION public.get_scraper_summary(INTEGER)
  IS 'Resumo por domínio na janela em minutos (default 60). Apenas admins via RLS no SELECT subjacente das tabelas.';
COMMENT ON FUNCTION public.get_scraper_timeseries(INTEGER, INTEGER)
  IS 'Série temporal por domínio/metric_key, agregada em buckets (default 5 min) na janela informada (default 60 min).';

-- =====================================================
-- Drill-down por engine
--
-- O schema de observabilidade indexa por DOMAIN. Engine → domains é
-- mapeado pelo frontend (ENGINE_DOMAINS) e passado como TEXT[].
--
-- RPCs:
--   get_engine_events            timeline filtrada (eventos discretos)
--   get_engine_timeseries        latência/req em buckets, restrito ao engine
--   get_engine_dlq_breakdown     top tipos de erro na DLQ por engine
--   get_engine_circuit_history   transições de circuit nos domínios
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_engine_events(
  p_domains       TEXT[],
  p_window_minutes INTEGER DEFAULT 1440,
  p_max_rows      INTEGER DEFAULT 200
)
RETURNS TABLE (
  ts     TIMESTAMPTZ,
  kind   TEXT,
  domain TEXT,
  data   JSONB
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT ts, kind, domain, data
  FROM public.extraction_events
  WHERE ts >= NOW() - (p_window_minutes || ' minutes')::INTERVAL
    AND (
      p_domains IS NULL
      OR array_length(p_domains, 1) IS NULL
      OR domain = ANY (p_domains)
    )
  ORDER BY ts DESC
  LIMIT p_max_rows;
$$;


CREATE OR REPLACE FUNCTION public.get_engine_timeseries(
  p_domains        TEXT[],
  p_window_minutes INTEGER DEFAULT 360,
  p_bucket_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
  bucket_ts   TIMESTAMPTZ,
  domain      TEXT,
  metric_key  TEXT,
  value       DOUBLE PRECISION
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT
    date_bin((p_bucket_minutes || ' minutes')::INTERVAL, ts, TIMESTAMPTZ '2000-01-01') AS bucket_ts,
    domain,
    metric_key,
    SUM(CASE WHEN metric_type='counter' THEN value ELSE 0 END)
      + AVG(CASE WHEN metric_type='gauge' THEN value END) FILTER (WHERE metric_type='gauge')
      AS value
  FROM public.extraction_metrics
  WHERE ts >= NOW() - (p_window_minutes || ' minutes')::INTERVAL
    AND (
      p_domains IS NULL
      OR array_length(p_domains, 1) IS NULL
      OR domain = ANY (p_domains)
    )
    AND metric_key IN (
      'req.total','status.429','status.5xx','status.2xx',
      'retry.attempt','latency.p50_ms','latency.p95_ms'
    )
  GROUP BY 1, 2, 3
  ORDER BY 1 ASC;
$$;


CREATE OR REPLACE FUNCTION public.get_engine_dlq_breakdown(
  p_engine         TEXT,
  p_window_minutes INTEGER DEFAULT 10080  -- 7 dias
)
RETURNS TABLE (
  last_error_type TEXT,
  total           BIGINT,
  last_seen       TIMESTAMPTZ,
  sample_url      TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT
    COALESCE(last_error_type, 'unknown') AS last_error_type,
    COUNT(*)::BIGINT                     AS total,
    MAX(failed_at)                       AS last_seen,
    (ARRAY_AGG(job_url ORDER BY failed_at DESC))[1] AS sample_url
  FROM public.extraction_dlq
  WHERE engine = p_engine
    AND failed_at >= NOW() - (p_window_minutes || ' minutes')::INTERVAL
  GROUP BY COALESCE(last_error_type, 'unknown')
  ORDER BY total DESC, last_seen DESC;
$$;


CREATE OR REPLACE FUNCTION public.get_engine_circuit_history(
  p_domains        TEXT[],
  p_window_minutes INTEGER DEFAULT 1440,
  p_max_rows       INTEGER DEFAULT 100
)
RETURNS TABLE (
  ts     TIMESTAMPTZ,
  kind   TEXT,
  domain TEXT,
  data   JSONB
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT ts, kind, domain, data
  FROM public.extraction_events
  WHERE ts >= NOW() - (p_window_minutes || ' minutes')::INTERVAL
    AND kind LIKE 'circuit.%'
    AND (
      p_domains IS NULL
      OR array_length(p_domains, 1) IS NULL
      OR domain = ANY (p_domains)
    )
  ORDER BY ts DESC
  LIMIT p_max_rows;
$$;


REVOKE ALL ON FUNCTION public.get_engine_events(TEXT[], INTEGER, INTEGER)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_engine_timeseries(TEXT[], INTEGER, INTEGER)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_engine_dlq_breakdown(TEXT, INTEGER)                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_engine_circuit_history(TEXT[], INTEGER, INTEGER)   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_engine_events(TEXT[], INTEGER, INTEGER)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_engine_timeseries(TEXT[], INTEGER, INTEGER)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_engine_dlq_breakdown(TEXT, INTEGER)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_engine_circuit_history(TEXT[], INTEGER, INTEGER) TO authenticated;

-- =====================================================
-- DATA RETENTION POLICIES
-- =====================================================
-- This migration creates functions and cron jobs
-- to automatically clean up old data
-- =====================================================

-- =====================================================
-- FUNCTION: cleanup_old_jobs
-- Delete jobs older than retention period that have
-- been sent to all channels
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_old_jobs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM jobs
        WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
            AND status_discord = TRUE
            AND status_whatsapp = TRUE
            AND status_telegram = TRUE
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RAISE NOTICE 'Deleted % old jobs (older than % days)', deleted_count, retention_days;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: cleanup_old_delivery_history
-- Delete delivery history older than retention period
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_old_delivery_history(retention_days INTEGER DEFAULT 60)
RETURNS INTEGER AS $$
DECLARE
    deleted_vip INTEGER;
    deleted_group INTEGER;
BEGIN
    -- Clean VIP delivery history
    WITH deleted AS (
        DELETE FROM vip_delivery_history
        WHERE sent_at < NOW() - (retention_days || ' days')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_vip FROM deleted;

    -- Clean group delivery history
    WITH deleted AS (
        DELETE FROM group_delivery_history
        WHERE sent_at < NOW() - (retention_days || ' days')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_group FROM deleted;

    RAISE NOTICE 'Deleted % VIP history and % group history records (older than % days)',
        deleted_vip, deleted_group, retention_days;

    RETURN deleted_vip + deleted_group;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: cleanup_expired_cache
-- Delete expired enrichment cache entries
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM enrichment_cache
        WHERE expires_at < NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RAISE NOTICE 'Deleted % expired cache entries', deleted_count;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: cleanup_expired_mutes
-- Delete expired user mutes
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_expired_mutes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM user_mutes
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RAISE NOTICE 'Deleted % expired mutes', deleted_count;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: cleanup_old_scraper_stats
-- Delete scraper stats older than retention period
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_old_scraper_stats(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM scraper_stats
        WHERE scraped_at < NOW() - (retention_days || ' days')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RAISE NOTICE 'Deleted % old scraper stats (older than % days)', deleted_count, retention_days;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: cleanup_old_pending_subscribers
-- Delete pending VIP requests older than retention period
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_old_pending_subscribers(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM vip_pending_subscribers
        WHERE requested_at < NOW() - (retention_days || ' days')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RAISE NOTICE 'Deleted % old pending subscriptions (older than % days)', deleted_count, retention_days;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: run_all_cleanup
-- Master function to run all cleanup tasks
-- =====================================================
CREATE OR REPLACE FUNCTION run_all_cleanup()
RETURNS TABLE(
    task TEXT,
    deleted_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'old_jobs'::TEXT, cleanup_old_jobs(90);

    RETURN QUERY
    SELECT 'delivery_history'::TEXT, cleanup_old_delivery_history(60);

    RETURN QUERY
    SELECT 'expired_cache'::TEXT, cleanup_expired_cache();

    RETURN QUERY
    SELECT 'expired_mutes'::TEXT, cleanup_expired_mutes();

    RETURN QUERY
    SELECT 'scraper_stats'::TEXT, cleanup_old_scraper_stats(30);

    RETURN QUERY
    SELECT 'pending_subscribers'::TEXT, cleanup_old_pending_subscribers(30);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TABLE: cleanup_log
-- Track cleanup job execution history
-- =====================================================
CREATE TABLE IF NOT EXISTS cleanup_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task TEXT NOT NULL,
    deleted_count INTEGER DEFAULT 0,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cleanup_log_executed_at ON cleanup_log(executed_at DESC);

-- =====================================================
-- FUNCTION: run_cleanup_with_logging
-- Run cleanup and log results
-- =====================================================
CREATE OR REPLACE FUNCTION run_cleanup_with_logging()
RETURNS VOID AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    result RECORD;
BEGIN
    FOR result IN SELECT * FROM run_all_cleanup() LOOP
        start_time := clock_timestamp();

        INSERT INTO cleanup_log (task, deleted_count, executed_at, duration_ms)
        VALUES (
            result.task,
            result.deleted_count,
            NOW(),
            EXTRACT(MILLISECONDS FROM clock_timestamp() - start_time)::INTEGER
        );
    END LOOP;

    RAISE NOTICE 'Cleanup completed and logged at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- CRON JOBS (requires pg_cron extension)
-- Schedule automatic cleanup tasks
-- =====================================================

-- Run daily cleanup at 3:00 AM UTC
-- Note: pg_cron must be enabled in Supabase dashboard
-- Settings > Database > Extensions > pg_cron

-- Uncomment these after enabling pg_cron:

-- SELECT cron.schedule(
--     'daily-cleanup',
--     '0 3 * * *', -- Every day at 3:00 AM UTC
--     $$SELECT run_cleanup_with_logging()$$
-- );

-- Clean old cleanup logs (keep 90 days of logs)
-- SELECT cron.schedule(
--     'cleanup-logs',
--     '0 4 * * 0', -- Every Sunday at 4:00 AM UTC
--     $$DELETE FROM cleanup_log WHERE executed_at < NOW() - INTERVAL '90 days'$$
-- );

-- =====================================================
-- RETENTION POLICY TABLE
-- Store configurable retention settings
-- =====================================================
CREATE TABLE IF NOT EXISTS retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name TEXT UNIQUE NOT NULL,
    retention_days INTEGER NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default retention policies
INSERT INTO retention_policies (policy_name, retention_days, description) VALUES
    ('jobs', 90, 'Keep jobs for 90 days after being sent to all channels'),
    ('delivery_history', 60, 'Keep delivery history for 60 days'),
    ('enrichment_cache', 30, 'Keep enrichment cache for 30 days'),
    ('scraper_stats', 30, 'Keep scraper statistics for 30 days'),
    ('pending_subscribers', 30, 'Keep pending VIP requests for 30 days'),
    ('cleanup_logs', 90, 'Keep cleanup execution logs for 90 days')
ON CONFLICT (policy_name) DO NOTHING;

-- Create trigger for retention_policies updated_at
CREATE TRIGGER update_retention_policies_updated_at
    BEFORE UPDATE ON retention_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTION: run_cleanup_with_policies
-- Run cleanup using configurable retention policies
-- =====================================================
CREATE OR REPLACE FUNCTION run_cleanup_with_policies()
RETURNS TABLE(
    task TEXT,
    deleted_count INTEGER,
    retention_days INTEGER
) AS $$
DECLARE
    policy RECORD;
    count_deleted INTEGER;
BEGIN
    -- Jobs cleanup
    SELECT retention_days INTO policy FROM retention_policies
    WHERE policy_name = 'jobs' AND active = TRUE;
    IF FOUND THEN
        count_deleted := cleanup_old_jobs(policy.retention_days);
        RETURN QUERY SELECT 'old_jobs'::TEXT, count_deleted, policy.retention_days;
    END IF;

    -- Delivery history cleanup
    SELECT retention_days INTO policy FROM retention_policies
    WHERE policy_name = 'delivery_history' AND active = TRUE;
    IF FOUND THEN
        count_deleted := cleanup_old_delivery_history(policy.retention_days);
        RETURN QUERY SELECT 'delivery_history'::TEXT, count_deleted, policy.retention_days;
    END IF;

    -- Cache cleanup (uses expiration, not days)
    count_deleted := cleanup_expired_cache();
    RETURN QUERY SELECT 'expired_cache'::TEXT, count_deleted, 0;

    -- Mutes cleanup
    count_deleted := cleanup_expired_mutes();
    RETURN QUERY SELECT 'expired_mutes'::TEXT, count_deleted, 0;

    -- Scraper stats cleanup
    SELECT retention_days INTO policy FROM retention_policies
    WHERE policy_name = 'scraper_stats' AND active = TRUE;
    IF FOUND THEN
        count_deleted := cleanup_old_scraper_stats(policy.retention_days);
        RETURN QUERY SELECT 'scraper_stats'::TEXT, count_deleted, policy.retention_days;
    END IF;

    -- Pending subscribers cleanup
    SELECT retention_days INTO policy FROM retention_policies
    WHERE policy_name = 'pending_subscribers' AND active = TRUE;
    IF FOUND THEN
        count_deleted := cleanup_old_pending_subscribers(policy.retention_days);
        RETURN QUERY SELECT 'pending_subscribers'::TEXT, count_deleted, policy.retention_days;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE retention_policies IS 'Configurable retention periods for data cleanup';
COMMENT ON TABLE cleanup_log IS 'Execution history of cleanup jobs';

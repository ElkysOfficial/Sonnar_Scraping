-- =====================================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================
-- This migration enables RLS on all tables for security.
-- The application uses the service_role key (server-side),
-- so policies are scoped to service_role only.
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_pending_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_delivery_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_delivery_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_responders ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE sender_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleanup_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLICIES FOR SERVICE ROLE (Backend Access)
-- =====================================================
-- Service role bypasses RLS by default, but we keep
-- explicit policies scoped to service_role for clarity.

-- Jobs table policies
DROP POLICY IF EXISTS "Service role full access to jobs" ON jobs;
CREATE POLICY "Service role full access to jobs"
    ON jobs FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- VIP subscribers policies
DROP POLICY IF EXISTS "Service role full access to vip_subscribers" ON vip_subscribers;
CREATE POLICY "Service role full access to vip_subscribers"
    ON vip_subscribers FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- VIP pending subscribers policies
DROP POLICY IF EXISTS "Service role full access to vip_pending_subscribers" ON vip_pending_subscribers;
CREATE POLICY "Service role full access to vip_pending_subscribers"
    ON vip_pending_subscribers FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- VIP delivery history policies
DROP POLICY IF EXISTS "Service role full access to vip_delivery_history" ON vip_delivery_history;
CREATE POLICY "Service role full access to vip_delivery_history"
    ON vip_delivery_history FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Group delivery history policies
DROP POLICY IF EXISTS "Service role full access to group_delivery_history" ON group_delivery_history;
CREATE POLICY "Service role full access to group_delivery_history"
    ON group_delivery_history FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Auto responders policies
DROP POLICY IF EXISTS "Service role full access to auto_responders" ON auto_responders;
CREATE POLICY "Service role full access to auto_responders"
    ON auto_responders FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Group features policies
DROP POLICY IF EXISTS "Service role full access to group_features" ON group_features;
CREATE POLICY "Service role full access to group_features"
    ON group_features FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Sender state policies
DROP POLICY IF EXISTS "Service role full access to sender_state" ON sender_state;
CREATE POLICY "Service role full access to sender_state"
    ON sender_state FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- User mutes policies
DROP POLICY IF EXISTS "Service role full access to user_mutes" ON user_mutes;
CREATE POLICY "Service role full access to user_mutes"
    ON user_mutes FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Enrichment cache policies
DROP POLICY IF EXISTS "Service role full access to enrichment_cache" ON enrichment_cache;
CREATE POLICY "Service role full access to enrichment_cache"
    ON enrichment_cache FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Scraper stats policies
DROP POLICY IF EXISTS "Service role full access to scraper_stats" ON scraper_stats;
CREATE POLICY "Service role full access to scraper_stats"
    ON scraper_stats FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Cleanup log policies
DROP POLICY IF EXISTS "Service role full access to cleanup_log" ON cleanup_log;
CREATE POLICY "Service role full access to cleanup_log"
    ON cleanup_log FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Retention policies policies
DROP POLICY IF EXISTS "Service role full access to retention_policies" ON retention_policies;
CREATE POLICY "Service role full access to retention_policies"
    ON retention_policies FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);


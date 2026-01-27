-- =====================================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================
-- This migration enables RLS on all tables for security.
-- The application uses service_role key which bypasses RLS,
-- but RLS is enabled as a security best practice.
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
-- Service role bypasses RLS by default, but we create
-- policies for authenticated users if needed in the future.

-- Jobs table policies
CREATE POLICY "Service role full access to jobs"
    ON jobs FOR ALL
    USING (true)
    WITH CHECK (true);

-- VIP subscribers policies
CREATE POLICY "Service role full access to vip_subscribers"
    ON vip_subscribers FOR ALL
    USING (true)
    WITH CHECK (true);

-- VIP pending subscribers policies
CREATE POLICY "Service role full access to vip_pending_subscribers"
    ON vip_pending_subscribers FOR ALL
    USING (true)
    WITH CHECK (true);

-- VIP delivery history policies
CREATE POLICY "Service role full access to vip_delivery_history"
    ON vip_delivery_history FOR ALL
    USING (true)
    WITH CHECK (true);

-- Group delivery history policies
CREATE POLICY "Service role full access to group_delivery_history"
    ON group_delivery_history FOR ALL
    USING (true)
    WITH CHECK (true);

-- Auto responders policies
CREATE POLICY "Service role full access to auto_responders"
    ON auto_responders FOR ALL
    USING (true)
    WITH CHECK (true);

-- Group features policies
CREATE POLICY "Service role full access to group_features"
    ON group_features FOR ALL
    USING (true)
    WITH CHECK (true);

-- Sender state policies
CREATE POLICY "Service role full access to sender_state"
    ON sender_state FOR ALL
    USING (true)
    WITH CHECK (true);

-- User mutes policies
CREATE POLICY "Service role full access to user_mutes"
    ON user_mutes FOR ALL
    USING (true)
    WITH CHECK (true);

-- Enrichment cache policies
CREATE POLICY "Service role full access to enrichment_cache"
    ON enrichment_cache FOR ALL
    USING (true)
    WITH CHECK (true);

-- Scraper stats policies
CREATE POLICY "Service role full access to scraper_stats"
    ON scraper_stats FOR ALL
    USING (true)
    WITH CHECK (true);

-- Cleanup log policies
CREATE POLICY "Service role full access to cleanup_log"
    ON cleanup_log FOR ALL
    USING (true)
    WITH CHECK (true);

-- Retention policies policies
CREATE POLICY "Service role full access to retention_policies"
    ON retention_policies FOR ALL
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON POLICY "Service role full access to jobs" ON jobs IS 'Allows backend services with service_role key full access';
COMMENT ON POLICY "Service role full access to vip_subscribers" ON vip_subscribers IS 'Allows backend services with service_role key full access';

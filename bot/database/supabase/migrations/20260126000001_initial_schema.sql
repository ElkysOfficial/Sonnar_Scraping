-- =====================================================
-- SONAR DATABASE SCHEMA - SUPABASE MIGRATION
-- =====================================================
-- This migration creates all tables needed to replace
-- JSON file storage with proper database persistence
-- =====================================================

-- Note: gen_random_uuid() is built-in to PostgreSQL 13+, no extension needed

-- =====================================================
-- TABLE: jobs
-- Primary job vacancies storage (replaces job_data.json)
-- =====================================================
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_title TEXT NOT NULL,
    job_url TEXT UNIQUE NOT NULL,
    company TEXT,
    location TEXT,
    work_type TEXT,
    hiring_regime TEXT,
    salary TEXT,
    publication_date TEXT,
    source TEXT,

    -- Distribution status per channel
    status_discord BOOLEAN DEFAULT FALSE,
    status_whatsapp BOOLEAN DEFAULT FALSE,
    status_telegram BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_jobs_job_url ON jobs(job_url);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_pending_discord ON jobs(status_discord, created_at DESC) WHERE status_discord = FALSE;
CREATE INDEX IF NOT EXISTS idx_jobs_pending_whatsapp ON jobs(status_whatsapp, created_at DESC) WHERE status_whatsapp = FALSE;
CREATE INDEX IF NOT EXISTS idx_jobs_pending_telegram ON jobs(status_telegram, created_at DESC) WHERE status_telegram = FALSE;

-- =====================================================
-- TABLE: vip_subscribers
-- VIP users with job filtering preferences
-- (replaces vip-subscribers.json)
-- =====================================================
CREATE TABLE IF NOT EXISTS vip_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name TEXT NOT NULL,
    lid TEXT UNIQUE NOT NULL, -- WhatsApp LID
    phone TEXT,
    stacks JSONB DEFAULT '[]'::jsonb,
    filters JSONB DEFAULT '{}'::jsonb,
    active BOOLEAN DEFAULT TRUE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vip_subscribers_lid ON vip_subscribers(lid);
CREATE INDEX IF NOT EXISTS idx_vip_subscribers_active ON vip_subscribers(active) WHERE active = TRUE;

-- =====================================================
-- TABLE: vip_pending_subscribers
-- Users awaiting VIP activation
-- (replaces vip-pending-subscribers.json)
-- =====================================================
CREATE TABLE IF NOT EXISTS vip_pending_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name TEXT NOT NULL,
    lid TEXT UNIQUE NOT NULL,
    phone TEXT,
    stacks JSONB DEFAULT '[]'::jsonb,
    filters JSONB DEFAULT '{}'::jsonb,
    requested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vip_pending_lid ON vip_pending_subscribers(lid);

-- =====================================================
-- TABLE: vip_delivery_history
-- Track which VIP users received which jobs
-- (replaces vip-history.json)
-- =====================================================
CREATE TABLE IF NOT EXISTS vip_delivery_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_subscriber_id UUID NOT NULL REFERENCES vip_subscribers(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    sent_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(vip_subscriber_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_vip_delivery_subscriber ON vip_delivery_history(vip_subscriber_id);
CREATE INDEX IF NOT EXISTS idx_vip_delivery_job ON vip_delivery_history(job_id);
CREATE INDEX IF NOT EXISTS idx_vip_delivery_sent_at ON vip_delivery_history(sent_at DESC);

-- =====================================================
-- TABLE: group_delivery_history
-- Track job deliveries to WhatsApp groups
-- (replaces sent_history.json)
-- =====================================================
CREATE TABLE IF NOT EXISTS group_delivery_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(job_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_group_delivery_group ON group_delivery_history(group_id);
CREATE INDEX IF NOT EXISTS idx_group_delivery_job ON group_delivery_history(job_id);
CREATE INDEX IF NOT EXISTS idx_group_delivery_sent_at ON group_delivery_history(sent_at DESC);

-- =====================================================
-- TABLE: auto_responders
-- Automated response triggers
-- (replaces auto-responder.json)
-- =====================================================
CREATE TABLE IF NOT EXISTS auto_responders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT, -- NULL for global responders
    match_pattern TEXT NOT NULL,
    answer TEXT NOT NULL,
    case_sensitive BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_responders_group ON auto_responders(group_id);
CREATE INDEX IF NOT EXISTS idx_auto_responders_active ON auto_responders(active) WHERE active = TRUE;

-- =====================================================
-- TABLE: group_features
-- Group-specific feature toggles
-- (replaces anti-link-groups.json, welcome-groups.json, etc)
-- =====================================================
CREATE TABLE IF NOT EXISTS group_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT NOT NULL,
    feature TEXT NOT NULL, -- 'anti_link', 'anti_audio', 'welcome', 'exit', 'auto_sticker', 'prefix', 'only_admins', 'inactive', 'auto_responder'
    enabled BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(group_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_group_features_group ON group_features(group_id);
CREATE INDEX IF NOT EXISTS idx_group_features_feature ON group_features(feature);
CREATE INDEX IF NOT EXISTS idx_group_features_enabled ON group_features(enabled) WHERE enabled = TRUE;

-- =====================================================
-- TABLE: sender_state
-- Track batch send timing per sender type
-- (replaces job-sender-state.json, card-sender-state.json, etc)
-- =====================================================
CREATE TABLE IF NOT EXISTS sender_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_type TEXT UNIQUE NOT NULL, -- 'job', 'card', 'vip_promo'
    last_sent_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABLE: user_mutes
-- Track muted users per group
-- (replaces muted.json)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_mutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    muted_by TEXT,
    reason TEXT,
    muted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- NULL = permanent

    UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mutes_group ON user_mutes(group_id);
CREATE INDEX IF NOT EXISTS idx_user_mutes_user ON user_mutes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mutes_expires ON user_mutes(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- TABLE: enrichment_cache
-- Cache for Google/Glassdoor enrichment data
-- (replaces google_cache.json)
-- =====================================================
CREATE TABLE IF NOT EXISTS enrichment_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_type TEXT NOT NULL, -- 'company_location', 'salary_estimate'
    cache_key TEXT NOT NULL, -- company name or "company|role"
    cache_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',

    UNIQUE(cache_type, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_enrichment_cache_key ON enrichment_cache(cache_type, cache_key);
CREATE INDEX IF NOT EXISTS idx_enrichment_cache_expires ON enrichment_cache(expires_at);

-- =====================================================
-- TABLE: scraper_stats
-- Track scraper performance metrics
-- =====================================================
CREATE TABLE IF NOT EXISTS scraper_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL, -- engine name
    jobs_found INTEGER DEFAULT 0,
    jobs_new INTEGER DEFAULT 0,
    jobs_enriched INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    duration_ms INTEGER,
    scraped_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraper_stats_source ON scraper_stats(source);
CREATE INDEX IF NOT EXISTS idx_scraper_stats_scraped_at ON scraper_stats(scraped_at DESC);

-- =====================================================
-- FUNCTION: update_updated_at_column
-- Auto-update updated_at timestamp on row changes
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vip_subscribers_updated_at
    BEFORE UPDATE ON vip_subscribers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auto_responders_updated_at
    BEFORE UPDATE ON auto_responders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_features_updated_at
    BEFORE UPDATE ON group_features
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sender_state_updated_at
    BEFORE UPDATE ON sender_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE jobs IS 'Primary job vacancies storage - replaces job_data.json';
COMMENT ON TABLE vip_subscribers IS 'VIP users with job filtering preferences';
COMMENT ON TABLE vip_delivery_history IS 'Tracks which VIP users received which jobs';
COMMENT ON TABLE group_delivery_history IS 'Tracks job deliveries to WhatsApp groups';
COMMENT ON TABLE auto_responders IS 'Automated response triggers for messages';
COMMENT ON TABLE group_features IS 'Feature toggles per WhatsApp group';
COMMENT ON TABLE sender_state IS 'Tracks batch send timing per sender type';
COMMENT ON TABLE user_mutes IS 'Muted users per group';
COMMENT ON TABLE enrichment_cache IS 'Cache for Google/Glassdoor enrichment data';
COMMENT ON TABLE scraper_stats IS 'Scraper performance metrics';

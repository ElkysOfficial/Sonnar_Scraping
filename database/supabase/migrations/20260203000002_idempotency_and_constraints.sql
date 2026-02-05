-- =====================================================
-- IDEMPOTENCY, CONSTRAINTS & AUDIT FIELDS
-- =====================================================
-- Adds idempotency table for Stripe webhooks,
-- unique constraints, and WhatsApp audit fields.
-- =====================================================

-- =====================================================
-- STEP 1: Create stripe_events table (idempotency)
-- =====================================================
-- Stores processed Stripe event IDs to prevent
-- duplicate processing on webhook retries.

CREATE TABLE IF NOT EXISTS stripe_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,           -- Stripe event.id (evt_xxx)
    event_type TEXT NOT NULL,                -- checkout.session.completed, etc
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    payload JSONB,                           -- Optional: store full event for audit
    result TEXT,                             -- 'success', 'skipped', 'error'
    error_message TEXT                       -- If result='error'
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_event_id ON stripe_events(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at ON stripe_events(processed_at DESC);

COMMENT ON TABLE stripe_events IS 'Idempotency table for Stripe webhook events';

-- =====================================================
-- STEP 2: Add unique constraint on email
-- =====================================================
-- Prevent duplicate pending subscribers with same email

-- First, clean up any existing duplicates (keep the most recent)
DELETE FROM vip_pending_subscribers a
USING vip_pending_subscribers b
WHERE a.email = b.email
  AND a.email IS NOT NULL
  AND a.requested_at < b.requested_at;

-- Add unique constraint
ALTER TABLE vip_pending_subscribers
    DROP CONSTRAINT IF EXISTS vip_pending_subscribers_email_key;
ALTER TABLE vip_pending_subscribers
    ADD CONSTRAINT vip_pending_subscribers_email_key UNIQUE (email);

-- Also add unique on vip_subscribers email
DELETE FROM vip_subscribers a
USING vip_subscribers b
WHERE a.email = b.email
  AND a.email IS NOT NULL
  AND a.subscribed_at < b.subscribed_at;

ALTER TABLE vip_subscribers
    DROP CONSTRAINT IF EXISTS vip_subscribers_email_key;
ALTER TABLE vip_subscribers
    ADD CONSTRAINT vip_subscribers_email_key UNIQUE (email);

-- =====================================================
-- STEP 3: Add WhatsApp release audit fields
-- =====================================================
-- Track when and by whom WhatsApp was released

ALTER TABLE vip_subscribers
    ADD COLUMN IF NOT EXISTS whatsapp_released_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_released_by TEXT;

COMMENT ON COLUMN vip_subscribers.whatsapp_released_at IS 'Timestamp when WhatsApp LID was linked';
COMMENT ON COLUMN vip_subscribers.whatsapp_released_by IS 'Admin who linked the WhatsApp LID';

-- =====================================================
-- STEP 4: Add stripe_subscription_id to track subscription
-- =====================================================
ALTER TABLE vip_subscribers
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

ALTER TABLE vip_pending_subscribers
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_vip_subscribers_stripe_sub
    ON vip_subscribers(stripe_subscription_id);

-- =====================================================
-- STEP 5: RLS policies for stripe_events
-- =====================================================
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to stripe_events" ON stripe_events;
CREATE POLICY "Service role full access to stripe_events"
    ON stripe_events FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- STEP 6: Function to check event idempotency
-- =====================================================
CREATE OR REPLACE FUNCTION check_stripe_event_processed(p_event_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM stripe_events WHERE event_id = p_event_id
    );
END;
$$;

-- =====================================================
-- STEP 7: Function to record processed event
-- =====================================================
CREATE OR REPLACE FUNCTION record_stripe_event(
    p_event_id TEXT,
    p_event_type TEXT,
    p_payload JSONB DEFAULT NULL,
    p_result TEXT DEFAULT 'success',
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO stripe_events (event_id, event_type, payload, result, error_message)
    VALUES (p_event_id, p_event_type, p_payload, p_result, p_error_message)
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

-- =====================================================
-- STEP 8: Add expected prices for validation
-- =====================================================
-- Store expected Stripe price IDs for anti-tamper validation
CREATE TABLE IF NOT EXISTS stripe_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan TEXT UNIQUE NOT NULL,       -- 'pro', 'plus'
    price_id TEXT NOT NULL,          -- Stripe price ID (price_xxx)
    amount_cents INTEGER NOT NULL,   -- Expected amount in cents
    currency TEXT DEFAULT 'brl',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stripe_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to stripe_prices" ON stripe_prices;
CREATE POLICY "Service role full access to stripe_prices"
    ON stripe_prices FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Insert default prices (update these with your actual Stripe price IDs)
INSERT INTO stripe_prices (plan, price_id, amount_cents, currency) VALUES
    ('pro', 'price_YOUR_PRO_PRICE_ID', 500, 'brl'),
    ('plus', 'price_YOUR_PLUS_PRICE_ID', 1000, 'brl')
ON CONFLICT (plan) DO UPDATE SET
    price_id = EXCLUDED.price_id,
    amount_cents = EXCLUDED.amount_cents,
    updated_at = NOW();

COMMENT ON TABLE stripe_prices IS 'Expected Stripe prices for anti-tamper validation';

-- =====================================================
-- STEP 9: Add trigger for updated_at on stripe_prices
-- =====================================================
CREATE TRIGGER update_stripe_prices_updated_at
    BEFORE UPDATE ON stripe_prices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

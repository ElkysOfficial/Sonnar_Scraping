-- =====================================================
-- Migration: Stripe Integration for VIP Subscribers
-- =====================================================

-- 1. Create stripe_events table for idempotency
CREATE TABLE IF NOT EXISTS public.stripe_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT now(),
    payload JSONB,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_event_id ON public.stripe_events(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON public.stripe_events(event_type);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access stripe_events
CREATE POLICY "Service role only for stripe_events"
ON public.stripe_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. Add new columns to vip_pending_subscribers
ALTER TABLE public.vip_pending_subscribers
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'pro',
ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
ADD COLUMN IF NOT EXISTS amount_paid INTEGER,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'brl';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_stripe_session 
ON public.vip_pending_subscribers(stripe_session_id) 
WHERE stripe_session_id IS NOT NULL;

-- 3. Add new columns to vip_subscribers
ALTER TABLE public.vip_subscribers
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'pro',
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_released_at TIMESTAMPTZ;

-- 4. Add policy for anon to insert pending subscribers
CREATE POLICY "Anon can insert pending"
ON public.vip_pending_subscribers
FOR INSERT
TO anon
WITH CHECK (true);
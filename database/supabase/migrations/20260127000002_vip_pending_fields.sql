-- =====================================================
-- VIP PENDING SUBSCRIBERS EXTRA FIELDS
-- =====================================================
-- Adds workflow fields for VIP pending approvals.
-- =====================================================

ALTER TABLE vip_pending_subscribers
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS payment_proof JSONB,
    ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS decided_by TEXT,
    ADD COLUMN IF NOT EXISTS reject_reason TEXT;


-- =====================================================
-- stripe_events - log/idempotência dos webhooks Stripe.
-- Cada evento (event.id) é processado no máximo uma vez.
-- Acessada apenas pela edge function via service_role.
-- =====================================================

CREATE TABLE public.stripe_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     TEXT NOT NULL UNIQUE,
  event_type   TEXT NOT NULL,
  payload      JSONB,
  error        TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stripe_events_event_type ON public.stripe_events(event_type);
CREATE INDEX idx_stripe_events_processed_at ON public.stripe_events(processed_at DESC);

COMMENT ON TABLE public.stripe_events IS
  'Log idempotente de webhooks Stripe. service_role-only.';

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stripe_events_service_role_all"
  ON public.stripe_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "stripe_events_select_admin"
  ON public.stripe_events FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

GRANT SELECT ON public.stripe_events TO authenticated;

-- =====================================================
-- Agendamento de mudanca de plano em subscribers (Fluxo A - portal web).
--
-- Permite que o assinante:
--  1) Faca upgrade Pro -> Plus IMEDIATO (com proracao via Stripe).
--  2) Faca downgrade Plus -> Pro ou Plus/Pro -> Free agendado pro
--     fim do ciclo atual (mantem o que foi pago, sem reembolso).
--
-- Tres colunas dao conta:
--  scheduled_plan       : destino do downgrade ('free' ou 'pro').
--                         Upgrade nao agenda - efetiva na hora.
--  scheduled_change_at  : timestamp em que o downgrade vira efetivo
--                         (cospia de current_period_end).
--  stripe_schedule_id   : id do subscription_schedule no Stripe.
--                         Preenchido SO em Plus -> Pro (precisa trocar
--                         o price, nao da pra usar cancel_at_period_end).
--                         Em Plus/Pro -> Free a coluna fica NULL e a
--                         efetivacao vem por cancel_at_period_end.
-- =====================================================

ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS scheduled_plan      TEXT
    CHECK (scheduled_plan IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS scheduled_change_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_schedule_id  TEXT;

-- Invariante: se um campo de agendamento esta preenchido, os outros
-- relacionados tambem precisam estar consistentes. Bloqueia estados
-- como "tem schedule_id mas sem scheduled_plan".
ALTER TABLE public.subscribers
  DROP CONSTRAINT IF EXISTS subscribers_scheduled_consistency;
ALTER TABLE public.subscribers
  ADD CONSTRAINT subscribers_scheduled_consistency CHECK (
    (scheduled_plan IS NULL AND scheduled_change_at IS NULL AND stripe_schedule_id IS NULL)
    OR
    (scheduled_plan IS NOT NULL AND scheduled_change_at IS NOT NULL)
  );

-- Lookup do webhook por schedule do Stripe (eventos subscription_schedule.*).
CREATE INDEX IF NOT EXISTS idx_subscribers_schedule_id
  ON public.subscribers(stripe_schedule_id)
  WHERE stripe_schedule_id IS NOT NULL;

COMMENT ON COLUMN public.subscribers.scheduled_plan IS
  'Plano destino de um downgrade agendado. NULL quando nao ha agendamento.';
COMMENT ON COLUMN public.subscribers.scheduled_change_at IS
  'Quando o downgrade agendado vira efetivo (== current_period_end no momento do agendamento).';
COMMENT ON COLUMN public.subscribers.stripe_schedule_id IS
  'ID do subscription_schedule no Stripe. So usado em Plus -> Pro.';

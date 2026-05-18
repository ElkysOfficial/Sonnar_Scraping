-- =====================================================
-- VIP recorrente (Fluxo B): o pagamento via cartao passa a ser uma
-- assinatura recorrente do Stripe, ativada e mantida automaticamente
-- pelo stripe-webhook. O PIX continua manual e avulso, agora com
-- validade explicita de 30 dias (expires_at).
-- =====================================================

ALTER TABLE public.vip_subscribers
  ADD COLUMN IF NOT EXISTS payment_method         TEXT
    CHECK (payment_method IN ('card', 'pix')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at             TIMESTAMPTZ;

-- Amplia o status para cobrir o ciclo de vida de uma assinatura recorrente.
-- pending  : aguardando pagamento (cartao) ou aprovacao (PIX)
-- active   : pagamento confirmado / dentro do periodo pago
-- rejected : comprovante PIX recusado pelo owner
-- past_due : cobranca recorrente do cartao falhou
-- canceled : assinatura do cartao encerrada no Stripe
-- expired  : VIP PIX cujo prazo de 30 dias venceu
ALTER TABLE public.vip_subscribers
  DROP CONSTRAINT IF EXISTS vip_subscribers_status_check;
ALTER TABLE public.vip_subscribers
  ADD CONSTRAINT vip_subscribers_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'past_due', 'canceled', 'expired'));

-- Lookup do webhook por assinatura do Stripe.
CREATE INDEX IF NOT EXISTS idx_vip_subscribers_stripe_sub
  ON public.vip_subscribers(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Varredura periodica de VIPs PIX vencidos.
CREATE INDEX IF NOT EXISTS idx_vip_subscribers_expires_at
  ON public.vip_subscribers(expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN public.vip_subscribers.payment_method IS
  'Forma de pagamento: card (assinatura recorrente Stripe) ou pix (manual, avulso).';
COMMENT ON COLUMN public.vip_subscribers.stripe_customer_id IS
  'ID do customer no Stripe (cartao). Reaproveitado entre assinaturas do mesmo lead.';
COMMENT ON COLUMN public.vip_subscribers.stripe_subscription_id IS
  'ID da assinatura recorrente no Stripe (cartao). NULL para PIX.';
COMMENT ON COLUMN public.vip_subscribers.current_period_end IS
  'Fim do periodo pago atual da assinatura Stripe (cartao). Mantido pelo webhook.';
COMMENT ON COLUMN public.vip_subscribers.expires_at IS
  'Validade do VIP PIX (manual): 30 dias a partir da aprovacao. NULL para cartao.';

-- =====================================================
-- Fluxo B (assinante captado pelo WhatsApp) passa a gerar tambem uma
-- conta no portal. Para isso o vip_subscribers precisa guardar o e-mail
-- (usado no convite) e registrar quando a conta do portal foi criada.
-- =====================================================

ALTER TABLE public.vip_subscribers
  ADD COLUMN IF NOT EXISTS email            TEXT,
  ADD COLUMN IF NOT EXISTS portal_linked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.vip_subscribers.email IS
  'E-mail do assinante (Fluxo B). Usado para o convite de acesso ao portal.';
COMMENT ON COLUMN public.vip_subscribers.portal_linked_at IS
  'Quando a conta do portal (auth.users + subscribers) foi criada para este assinante.';

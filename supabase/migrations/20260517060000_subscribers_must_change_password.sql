-- =====================================================
-- Assinante captado pelo WhatsApp (Fluxo B) recebe a conta do portal com
-- senha temporaria. No primeiro acesso o portal obriga a troca de senha.
-- =====================================================

ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subscribers.must_change_password IS
  'true = a senha atual eh temporaria; o portal forca a troca no proximo login.';

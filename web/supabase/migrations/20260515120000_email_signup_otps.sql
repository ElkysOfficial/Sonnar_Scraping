-- =====================================================
-- Sonnar - OTP de confirmação de email (8 dígitos custom)
-- =====================================================
-- Tabela 1:1 com auth.users que armazena o hash do código,
-- expiração, tentativas e timestamp do último envio (rate-limit).
--
-- Acesso restrito a service_role (RLS ON sem policies). Toda escrita
-- ocorre nas edge functions signup-with-otp / verify-signup-otp /
-- resend-signup-otp. O hash usa SHA-256 + OTP_PEPPER (secret no Edge).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.email_signup_otps (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash    TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  used_at      TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT attempts_non_negative CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_email_signup_otps_expires_at
  ON public.email_signup_otps(expires_at);

COMMENT ON TABLE  public.email_signup_otps IS
  'Códigos OTP de 8 dígitos para confirmação de email no cadastro. Acesso só via service_role.';
COMMENT ON COLUMN public.email_signup_otps.code_hash IS
  'SHA-256(pepper || code). Pepper vive no secret OTP_PEPPER das Edge Functions.';
COMMENT ON COLUMN public.email_signup_otps.last_sent_at IS
  'Timestamp do último envio. Edge function resend-signup-otp aplica cooldown de 60s.';

ALTER TABLE public.email_signup_otps ENABLE ROW LEVEL SECURITY;
-- Sem policies: service_role faz bypass de RLS por padrão; clientes
-- autenticados/anônimos não conseguem ler nem escrever.

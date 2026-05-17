-- =====================================================
-- Area de atuacao do assinante (multi-selecao).
--
-- Problema: o match VIP era dominado por stacks. DevOps, Backend e Redes
-- compartilham stack (AWS, Docker, Linux...), entao um perfil de Redes
-- batia em vaga de "Desenvolvedor Backend". Faltava uma trava de AREA.
--
-- Valores canonicos: backend, frontend, fullstack, mobile, devops, infra,
-- dados, qa, seguranca, suporte.
-- =====================================================

ALTER TABLE public.subscriber_profiles
  ADD COLUMN IF NOT EXISTS areas TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.subscriber_profiles.areas IS
  'Areas de atuacao desejadas (multi). Valores canonicos: backend, frontend, fullstack, mobile, devops, infra, dados, qa, seguranca, suporte.';

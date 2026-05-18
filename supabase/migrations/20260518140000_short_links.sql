-- =====================================================
-- Encurtador de URL próprio: sonnarjobs.com.br/v/<code> -> target_url.
--
-- Substitui os encurtadores gratuitos (instáveis) por um serviço interno,
-- no domínio do projeto. A escrita é feita pela edge function shorten-url
-- e a resolução do clique pela resolve-short-link, ambas com service_role
-- (a tabela fica fechada por RLS, sem policies para anon/authenticated).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.short_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,             -- código curto (base62)
  target_url     TEXT NOT NULL,                    -- URL de destino
  clicks         INTEGER NOT NULL DEFAULT 0,       -- contador de acessos
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_access_at TIMESTAMPTZ
);

-- Um destino gera sempre o mesmo código (idempotência / dedupe).
CREATE UNIQUE INDEX IF NOT EXISTS idx_short_links_target_url
  ON public.short_links(target_url);

-- Tabela acessada apenas pelas edge functions (service_role). RLS ligado
-- sem policies = bloqueia anon e authenticated por padrão.
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.short_links IS
  'Encurtador de URL proprio (sonnarjobs.com.br/v/<code>). Escrito por '
  || 'shorten-url e resolvido por resolve-short-link.';

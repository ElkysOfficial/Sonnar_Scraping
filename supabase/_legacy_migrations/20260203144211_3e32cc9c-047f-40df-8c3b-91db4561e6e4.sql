-- 1. Criar enum de roles
CREATE TYPE public.app_role AS ENUM ('owner', 'admin');

-- 2. Tabela de roles
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE (user_id, role)
);

-- 3. Tabela de senhas temporárias
CREATE TABLE public.user_passwords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_id UUID REFERENCES public.vip_subscribers(id) ON DELETE CASCADE,
    temp_password_hash TEXT NOT NULL,
    must_change BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);

-- 4. Novos campos em vip_subscribers
ALTER TABLE public.vip_subscribers
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS last_preferences_change TIMESTAMPTZ;

-- 5. Função para verificar role (evita recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 6. Função auxiliar para verificar se é owner ou admin
CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'admin')
  )
$$;

-- 7. RLS policies para user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Admins e owners podem ver roles
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.is_admin_or_owner(auth.uid()));

-- Apenas service_role pode inserir/atualizar/deletar roles
CREATE POLICY "Service role manages user_roles"
ON public.user_roles FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 8. RLS policies para user_passwords
ALTER TABLE public.user_passwords ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver suas próprias senhas
CREATE POLICY "Users view own passwords"
ON public.user_passwords FOR SELECT TO authenticated
USING (subscriber_id IN (
  SELECT id FROM public.vip_subscribers 
  WHERE auth_user_id = auth.uid()
));

-- Service role gerencia senhas
CREATE POLICY "Service role manages passwords"
ON public.user_passwords FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 9. Index para performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_passwords_subscriber_id ON public.user_passwords(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_vip_subscribers_auth_user_id ON public.vip_subscribers(auth_user_id);
-- =====================================================
-- Sonnar — Schema Inicial
-- Estratégia:
--   - 1 tabela por preocupação (auth, assinatura, perfil de busca, papéis de staff)
--   - Cliente nunca insere via REST: trigger lê raw_user_meta_data de auth.signUp
--   - Free entra `active`. Pro/Plus entram `pending` até webhook do Stripe confirmar.
--   - RLS garante que cada subscriber só vê/edita o próprio. Admins veem tudo.
-- =====================================================

-- =========================
-- 1. ENUMS
-- =========================
CREATE TYPE public.plan_tier AS ENUM ('free', 'pro', 'plus');
CREATE TYPE public.subscription_status AS ENUM ('pending', 'active', 'past_due', 'canceled');
CREATE TYPE public.seniority_level AS ENUM ('junior', 'pleno', 'senior', 'staff_lead');
CREATE TYPE public.app_role AS ENUM ('owner', 'admin');

-- =========================
-- 2. TABELAS
-- =========================

-- 2.1 subscribers — 1 linha por usuário (1:1 com auth.users)
CREATE TABLE public.subscribers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  email                    TEXT NOT NULL,
  plan                     public.plan_tier NOT NULL DEFAULT 'free',
  status                   public.subscription_status NOT NULL DEFAULT 'active',
  stripe_customer_id       TEXT,
  stripe_subscription_id   TEXT,
  current_period_end       TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscribers_user_id ON public.subscribers(user_id);
CREATE INDEX idx_subscribers_email   ON public.subscribers(email);
CREATE INDEX idx_subscribers_plan    ON public.subscribers(plan);
CREATE UNIQUE INDEX idx_subscribers_stripe_subscription
  ON public.subscribers(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON TABLE  public.subscribers IS 'Assinatura por usuário. Cada auth.users tem no máximo 1 subscriber.';
COMMENT ON COLUMN public.subscribers.status IS 'pending = aguardando pagamento; active = elegível para receber vagas; past_due/canceled = inativo.';

-- 2.2 subscriber_profiles — perfil de busca (Pro/Plus). Free NÃO tem.
CREATE TABLE public.subscriber_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id   UUID NOT NULL UNIQUE REFERENCES public.subscribers(id) ON DELETE CASCADE,
  whatsapp        TEXT NOT NULL,
  stack           TEXT[] NOT NULL DEFAULT '{}',
  seniority       public.seniority_level NOT NULL,
  work_models     TEXT[] NOT NULL DEFAULT '{}',
  min_salary      INTEGER,                              -- em reais/mês; NULL = sem mínimo
  location        TEXT,                                 -- só se work_models inclui hybrid/onsite
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT min_salary_non_negative
    CHECK (min_salary IS NULL OR min_salary >= 0),

  CONSTRAINT work_models_valid
    CHECK (
      work_models <@ ARRAY['remote', 'hybrid', 'onsite']::TEXT[]
      AND COALESCE(array_length(work_models, 1), 0) >= 1
    ),

  CONSTRAINT stack_not_empty
    CHECK (COALESCE(array_length(stack, 1), 0) >= 1)
);

CREATE INDEX idx_profiles_subscriber_id ON public.subscriber_profiles(subscriber_id);
CREATE INDEX idx_profiles_seniority     ON public.subscriber_profiles(seniority);
CREATE INDEX idx_profiles_stack         ON public.subscriber_profiles USING GIN (stack);
CREATE INDEX idx_profiles_work_models   ON public.subscriber_profiles USING GIN (work_models);

COMMENT ON TABLE  public.subscriber_profiles IS 'Perfil de matching para usuários Pro/Plus. Existe somente após preencher o passo 2 do cadastro.';
COMMENT ON COLUMN public.subscriber_profiles.location IS 'Cidade/estado. Obrigatório se work_models inclui hybrid ou onsite (validado no frontend).';

-- 2.3 user_roles — apenas staff (owner/admin). Cliente comum NÃO vai aqui.
CREATE TABLE public.user_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.app_role NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

COMMENT ON TABLE public.user_roles IS 'Roles administrativos. Cliente comum não tem entrada aqui.';

-- =========================
-- 3. TRIGGER updated_at
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subscribers_updated
  BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.subscriber_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- 4. TRIGGER de auto-criação no signup
-- Lê raw_user_meta_data do auth.signUp({ options: { data: {...} } })
-- e cria subscriber + (opcional) subscriber_profile.
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta          JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_subscriber_id UUID;
  v_profile       JSONB := v_meta -> 'profile';
  v_plan          public.plan_tier := COALESCE((v_meta ->> 'plan')::public.plan_tier, 'free');
BEGIN
  -- subscribers — passo 1 do cadastro
  INSERT INTO public.subscribers (user_id, name, email, plan, status)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(v_meta ->> 'name', ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    v_plan,
    CASE
      WHEN v_plan = 'free' THEN 'active'::public.subscription_status
      ELSE 'pending'::public.subscription_status
    END
  )
  RETURNING id INTO v_subscriber_id;

  -- subscriber_profiles — passo 2, presente apenas em Pro/Plus
  IF v_profile IS NOT NULL AND v_plan <> 'free' THEN
    INSERT INTO public.subscriber_profiles (
      subscriber_id, whatsapp, stack, seniority, work_models, min_salary, location
    )
    VALUES (
      v_subscriber_id,
      v_profile ->> 'whatsapp',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_profile -> 'stack', '[]'::jsonb))),
      (v_profile ->> 'seniority')::public.seniority_level,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_profile -> 'work_models', '[]'::jsonb))),
      NULLIF(v_profile ->> 'min_salary', '')::INTEGER,
      NULLIF(v_profile ->> 'location', '')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- 5. HELPER is_admin()
-- =========================
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin')
  );
$$;

-- =========================
-- 6. RLS
-- =========================
ALTER TABLE public.subscribers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriber_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles           ENABLE ROW LEVEL SECURITY;

-- ---- subscribers ----
-- usuário lê/atualiza só o próprio; admins veem tudo
CREATE POLICY "subscribers_select_own_or_admin"
  ON public.subscribers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "subscribers_update_own"
  ON public.subscribers FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "subscribers_admin_all"
  ON public.subscribers FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "subscribers_service_role_all"
  ON public.subscribers FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- INSERT só via trigger SECURITY DEFINER (handle_new_user) ou service_role.
-- Cliente nunca insere direto.

-- ---- subscriber_profiles ----
CREATE POLICY "profiles_select_own_or_admin"
  ON public.subscriber_profiles FOR SELECT TO authenticated
  USING (
    subscriber_id IN (SELECT id FROM public.subscribers WHERE user_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "profiles_insert_own"
  ON public.subscriber_profiles FOR INSERT TO authenticated
  WITH CHECK (
    subscriber_id IN (SELECT id FROM public.subscribers WHERE user_id = auth.uid())
  );

CREATE POLICY "profiles_update_own"
  ON public.subscriber_profiles FOR UPDATE TO authenticated
  USING (
    subscriber_id IN (SELECT id FROM public.subscribers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    subscriber_id IN (SELECT id FROM public.subscribers WHERE user_id = auth.uid())
  );

CREATE POLICY "profiles_service_role_all"
  ON public.subscriber_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---- user_roles ----
CREATE POLICY "roles_select_self_or_admin"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "roles_service_role_all"
  ON public.user_roles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================
-- 7. GRANTS — RLS é a fonte da verdade, mas grants explícitos evitam surpresas.
-- =========================
GRANT SELECT, UPDATE         ON public.subscribers          TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subscriber_profiles  TO authenticated;
GRANT SELECT                 ON public.user_roles           TO authenticated;

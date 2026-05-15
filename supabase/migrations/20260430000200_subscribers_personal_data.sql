-- =====================================================
-- Adiciona campos de identificacao pessoal a subscribers.
-- Coletados no step "Dados pessoais" do cadastro.
--   - surname    sobrenome
--   - birth_date data de nascimento
--   - phone      telefone (E.164 sem +)
-- Todos nullable pra nao quebrar registros existentes.
-- =====================================================

ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS surname    TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS phone      TEXT;

COMMENT ON COLUMN public.subscribers.surname    IS 'Sobrenome - coletado em "dados pessoais".';
COMMENT ON COLUMN public.subscribers.birth_date IS 'Data de nascimento - coletada em "dados pessoais".';
COMMENT ON COLUMN public.subscribers.phone      IS 'Telefone E.164 sem +. Para Pro/Plus eh espelhado em subscriber_profiles.whatsapp.';

-- Indice para buscas administrativas por telefone
CREATE INDEX IF NOT EXISTS idx_subscribers_phone ON public.subscribers(phone) WHERE phone IS NOT NULL;

-- =====================================================
-- Atualiza o trigger handle_new_user para popular os 3 campos
-- a partir do raw_user_meta_data passado em auth.signUp.
-- Mantem fallback do whatsapp do profile (Pro/Plus) usando phone do subscriber
-- caso o frontend nao envie profile.whatsapp explicitamente.
-- =====================================================
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
  v_phone         TEXT := NULLIF(v_meta ->> 'phone', '');
BEGIN
  INSERT INTO public.subscribers (
    user_id, name, surname, birth_date, phone, email, plan, status
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(v_meta ->> 'name', ''), split_part(NEW.email, '@', 1)),
    NULLIF(v_meta ->> 'surname', ''),
    NULLIF(v_meta ->> 'birth_date', '')::DATE,
    v_phone,
    NEW.email,
    v_plan,
    CASE
      WHEN v_plan = 'free' THEN 'active'::public.subscription_status
      ELSE 'pending'::public.subscription_status
    END
  )
  RETURNING id INTO v_subscriber_id;

  -- Pro/Plus: cria perfil de matching. whatsapp default = phone do subscriber.
  IF v_profile IS NOT NULL AND v_plan <> 'free' THEN
    INSERT INTO public.subscriber_profiles (
      subscriber_id, whatsapp, stack, seniority, work_models, min_salary, location
    )
    VALUES (
      v_subscriber_id,
      COALESCE(NULLIF(v_profile ->> 'whatsapp', ''), v_phone),
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

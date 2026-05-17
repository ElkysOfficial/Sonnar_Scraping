-- =====================================================
-- handle_new_user passa a gravar `areas` no subscriber_profiles criado
-- no signup (vem de raw_user_meta_data.profile.areas, enviado pelo cadastro).
-- Sem isso, a area escolhida no cadastro era descartada silenciosamente.
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
BEGIN
  -- subscribers - passo 1 do cadastro
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

  -- subscriber_profiles - passo 2, presente apenas em Pro/Plus
  IF v_profile IS NOT NULL AND v_plan <> 'free' THEN
    INSERT INTO public.subscriber_profiles (
      subscriber_id, whatsapp, areas, stack, seniority, work_models, min_salary, location
    )
    VALUES (
      v_subscriber_id,
      v_profile ->> 'whatsapp',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_profile -> 'areas', '[]'::jsonb))),
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

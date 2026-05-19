-- Blinda handle_new_user contra perfis de shape diferente.
--
-- O trigger insere em subscriber_profiles a partir do metadata do usuario.
-- Ele foi escrito para o Fluxo A (cadastro do portal), mas o Fluxo B (VIP do
-- WhatsApp) envia o perfil com OUTRO shape:
--   - seniority como array (["pleno"]) em vez de string
--   - chaves no plural: stacks / workMode / locations
--   - sem a chave whatsapp
-- subscriber_profiles.whatsapp e subscriber_profiles.seniority sao NOT NULL,
-- entao o INSERT estourava e abortava a criacao do usuario em auth.users —
-- fazendo o invite-whatsapp-subscriber retornar 500 e o assinante VIP nunca
-- receber o e-mail de acesso ao portal.
--
-- Correcao: a criacao da conta NUNCA pode falhar por causa do perfil.
--   - seniority aceita string ou array; cai para 'pleno' se ausente/invalido
--   - whatsapp cai para '' (NOT NULL)
--   - aceita os apelidos stacks/workMode/locations do Fluxo B
--   - o INSERT do perfil roda em bloco protegido: se falhar, grava ao menos
--     a linha base e segue — a conta e criada de qualquer forma.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meta          JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_subscriber_id UUID;
  v_profile       JSONB := v_meta -> 'profile';
  v_plan          public.plan_tier := COALESCE((v_meta ->> 'plan')::public.plan_tier, 'free');
  v_seniority_txt TEXT;
  v_seniority     public.seniority_level;
BEGIN
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

  IF v_profile IS NOT NULL AND v_plan <> 'free' THEN
    -- A criacao da conta nao pode falhar por causa do perfil — bloco protegido.
    BEGIN
      -- seniority: aceita string ("pleno") ou array (["pleno"]).
      v_seniority_txt := CASE
        WHEN jsonb_typeof(v_profile -> 'seniority') = 'array'
          THEN v_profile -> 'seniority' ->> 0
        ELSE v_profile ->> 'seniority'
      END;
      IF v_seniority_txt IS NULL
         OR v_seniority_txt NOT IN (
           SELECT unnest(enum_range(NULL::public.seniority_level))::text
         ) THEN
        v_seniority := 'pleno';  -- coluna NOT NULL: fallback neutro
      ELSE
        v_seniority := v_seniority_txt::public.seniority_level;
      END IF;

      INSERT INTO public.subscriber_profiles (
        subscriber_id, whatsapp, areas, stack, seniority, work_models, min_salary, location
      )
      VALUES (
        v_subscriber_id,
        COALESCE(v_profile ->> 'whatsapp', ''),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_profile -> 'areas', '[]'::jsonb))),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_profile -> 'stack', v_profile -> 'stacks', '[]'::jsonb))),
        v_seniority,
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_profile -> 'work_models', v_profile -> 'workMode', '[]'::jsonb))),
        NULLIF(v_profile ->> 'min_salary', '')::INTEGER,
        COALESCE(NULLIF(v_profile ->> 'location', ''), v_profile -> 'locations' ->> 0)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: perfil ignorado para % (%): %', NEW.id, SQLSTATE, SQLERRM;
      -- Garante a linha base do perfil (o wa_lid e vinculado depois).
      BEGIN
        INSERT INTO public.subscriber_profiles (subscriber_id, whatsapp, seniority)
        VALUES (v_subscriber_id, '', 'pleno');
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

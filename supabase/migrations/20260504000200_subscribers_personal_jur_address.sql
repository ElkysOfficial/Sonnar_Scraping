-- =====================================================
-- Adiciona dados pessoa-juridica (CPF/CNPJ + razao social) e endereco
-- completo (CEP + logradouro) a public.subscribers.
--
-- Estrategia:
--   - Coluna person_type ('pf' | 'pj') decide qual identificador eh obrigatorio
--   - PF: cpf NOT NULL,  cnpj/legal_name NULL
--   - PJ: cnpj NOT NULL, legal_name NOT NULL, cpf NULL
--   - Endereco eh obrigatorio para todos: cep + street + street_number + neighborhood + city + state_code
--     (frontend autopreenche street/neighborhood/city/state via ViaCEP)
--   - Todos os identificadores armazenados como digitos puros (mascara apenas no display)
--
-- A trigger handle_new_user passa a popular esses campos a partir do raw_user_meta_data
-- enviado pelo frontend em supabase.auth.signUp({ options: { data: {...} } }).
-- =====================================================

-- =========================
-- 1. ENUM person_type
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'person_type') THEN
    CREATE TYPE public.person_type AS ENUM ('pf', 'pj');
  END IF;
END$$;


-- =========================
-- 2. Colunas em subscribers
-- =========================
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS person_type    public.person_type,
  ADD COLUMN IF NOT EXISTS cpf            TEXT,
  ADD COLUMN IF NOT EXISTS cnpj           TEXT,
  ADD COLUMN IF NOT EXISTS legal_name     TEXT,
  ADD COLUMN IF NOT EXISTS cep            TEXT,
  ADD COLUMN IF NOT EXISTS street         TEXT,
  ADD COLUMN IF NOT EXISTS street_number  TEXT,
  ADD COLUMN IF NOT EXISTS complement     TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood   TEXT,
  ADD COLUMN IF NOT EXISTS city           TEXT,
  ADD COLUMN IF NOT EXISTS state_code     CHAR(2);


COMMENT ON COLUMN public.subscribers.person_type   IS 'pf = pessoa fisica (usa cpf); pj = pessoa juridica (usa cnpj + legal_name).';
COMMENT ON COLUMN public.subscribers.cpf           IS 'CPF apenas digitos (11 caracteres). Obrigatorio se person_type=pf.';
COMMENT ON COLUMN public.subscribers.cnpj          IS 'CNPJ apenas digitos (14 caracteres). Obrigatorio se person_type=pj.';
COMMENT ON COLUMN public.subscribers.legal_name    IS 'Razao social. Obrigatorio se person_type=pj.';
COMMENT ON COLUMN public.subscribers.cep           IS 'CEP apenas digitos (8 caracteres).';
COMMENT ON COLUMN public.subscribers.street_number IS 'Numero do endereco (TEXT pra aceitar "S/N", "123A" etc.).';
COMMENT ON COLUMN public.subscribers.state_code    IS 'UF de 2 letras (ex.: SP, RJ).';


-- =========================
-- 3. Constraints de formato + coerencia PF/PJ
-- =========================

-- Formato (so digitos)
ALTER TABLE public.subscribers
  ADD CONSTRAINT chk_subscribers_cpf_format
    CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

ALTER TABLE public.subscribers
  ADD CONSTRAINT chk_subscribers_cnpj_format
    CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');

ALTER TABLE public.subscribers
  ADD CONSTRAINT chk_subscribers_cep_format
    CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$');

ALTER TABLE public.subscribers
  ADD CONSTRAINT chk_subscribers_state_format
    CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$');

-- Coerencia PF/PJ: PF tem cpf, PJ tem cnpj + legal_name. Linhas legadas
-- (pre-migration) ficam com person_type NULL e nenhum identificador, ate
-- o usuario completar o cadastro.
ALTER TABLE public.subscribers
  ADD CONSTRAINT chk_subscribers_person_type_coherent
    CHECK (
      person_type IS NULL
      OR (person_type = 'pf' AND cpf  IS NOT NULL AND cnpj IS NULL     AND legal_name IS NULL)
      OR (person_type = 'pj' AND cnpj IS NOT NULL AND legal_name IS NOT NULL AND cpf IS NULL)
    );


-- =========================
-- 4. Indices unicos parciais (1 conta por documento)
-- =========================
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_cpf_unique
  ON public.subscribers(cpf)
  WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_cnpj_unique
  ON public.subscribers(cnpj)
  WHERE cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscribers_state_code
  ON public.subscribers(state_code)
  WHERE state_code IS NOT NULL;


-- =========================
-- 5. Trigger handle_new_user atualizada
-- Le os novos campos do raw_user_meta_data e popula subscribers.
-- Mantem comportamento anterior (subscriber_profiles para Pro/Plus).
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
  v_phone         TEXT := NULLIF(v_meta ->> 'phone', '');
  v_person_type   public.person_type := NULLIF(v_meta ->> 'person_type', '')::public.person_type;
BEGIN
  INSERT INTO public.subscribers (
    user_id, name, surname, birth_date, phone, email, plan, status,
    person_type, cpf, cnpj, legal_name,
    cep, street, street_number, complement, neighborhood, city, state_code
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
    END,
    v_person_type,
    -- cpf so quando PF; cnpj+legal_name so quando PJ. Garante constraint.
    CASE WHEN v_person_type = 'pf' THEN NULLIF(v_meta ->> 'cpf', '')        ELSE NULL END,
    CASE WHEN v_person_type = 'pj' THEN NULLIF(v_meta ->> 'cnpj', '')       ELSE NULL END,
    CASE WHEN v_person_type = 'pj' THEN NULLIF(v_meta ->> 'legal_name', '') ELSE NULL END,
    NULLIF(v_meta ->> 'cep', ''),
    NULLIF(v_meta ->> 'street', ''),
    NULLIF(v_meta ->> 'street_number', ''),
    NULLIF(v_meta ->> 'complement', ''),
    NULLIF(v_meta ->> 'neighborhood', ''),
    NULLIF(v_meta ->> 'city', ''),
    NULLIF(v_meta ->> 'state_code', '')
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

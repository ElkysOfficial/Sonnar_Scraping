-- =====================================================
-- Pareamento do WhatsApp do assinante (Pro/Plus).
--
-- Problema: o bot identifica assinantes pelo LID do WhatsApp, que NAO eh
-- derivavel do telefone. O portal so consegue o LID se o assinante mandar
-- uma mensagem ao bot. Este migration adiciona o "elo": um token gerado no
-- dashboard que o assinante envia ao bot ("parear <token>"), permitindo
-- casar a mensagem (que carrega o LID) com o assinante certo.
--
--   - wa_link_token  token de pareamento de uso unico (NULL apos vincular)
--   - wa_lid         LID do WhatsApp do assinante (preenchido pelo bot)
--   - wa_linked_at   quando o pareamento foi concluido
-- =====================================================

ALTER TABLE public.subscriber_profiles
  ADD COLUMN IF NOT EXISTS wa_link_token TEXT,
  ADD COLUMN IF NOT EXISTS wa_lid        TEXT,
  ADD COLUMN IF NOT EXISTS wa_linked_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.subscriber_profiles.wa_link_token IS 'Token de pareamento (6 chars). Uso unico - limpo apos o bot vincular.';
COMMENT ON COLUMN public.subscriber_profiles.wa_lid        IS 'LID do WhatsApp do assinante. Preenchido pela edge function link-whatsapp.';
COMMENT ON COLUMN public.subscriber_profiles.wa_linked_at  IS 'Momento em que o pareamento com o WhatsApp foi concluido.';

-- Token precisa ser unico para a edge function localizar 1 assinante.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_wa_link_token
  ON public.subscriber_profiles(wa_link_token)
  WHERE wa_link_token IS NOT NULL;

-- =====================================================
-- gen_wa_link_token: gera um token de 6 caracteres legiveis.
-- Alfabeto sem caracteres ambiguos (sem O/0, I/1).
-- =====================================================
CREATE OR REPLACE FUNCTION public.gen_wa_link_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_result   TEXT := '';
  i          INT;
BEGIN
  FOR i IN 1..6 LOOP
    v_result := v_result || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::INT, 1);
  END LOOP;
  RETURN v_result;
END;
$$;

-- =====================================================
-- get_or_create_wa_link_token: chamada pelo dashboard (usuario autenticado).
-- Retorna o token de pareamento do perfil do proprio usuario, criando um se
-- ainda nao existir. Se ja estiver vinculado, devolve linked=true.
-- SECURITY DEFINER: escopo restrito a auth.uid(), seguro sob RLS.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_or_create_wa_link_token()
RETURNS TABLE(token TEXT, linked BOOLEAN, linked_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_token      TEXT;
  v_lid        TEXT;
  v_linked_at  TIMESTAMPTZ;
BEGIN
  SELECT sp.id, sp.wa_link_token, sp.wa_lid, sp.wa_linked_at
    INTO v_profile_id, v_token, v_lid, v_linked_at
  FROM public.subscriber_profiles sp
  JOIN public.subscribers s ON s.id = sp.subscriber_id
  WHERE s.user_id = auth.uid();

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Ja vinculado: nao expoe token.
  IF v_lid IS NOT NULL THEN
    RETURN QUERY SELECT NULL::TEXT, TRUE, v_linked_at;
    RETURN;
  END IF;

  -- Gera token novo se necessario (retry em caso de colisao).
  IF v_token IS NULL THEN
    LOOP
      v_token := public.gen_wa_link_token();
      BEGIN
        UPDATE public.subscriber_profiles
           SET wa_link_token = v_token
         WHERE id = v_profile_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- token colidiu, tenta de novo
      END;
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_token, FALSE, NULL::TIMESTAMPTZ;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_wa_link_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_wa_link_token() TO authenticated;

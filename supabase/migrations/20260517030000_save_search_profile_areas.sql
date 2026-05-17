-- =====================================================
-- save_search_profile ganha o parametro p_areas (area de atuacao, multi).
-- Recria a funcao: a assinatura muda, entao removemos a versao antiga.
-- Mantem a quota mensal de 3 alteracoes (criacao inicial nao conta).
-- =====================================================

DROP FUNCTION IF EXISTS public.save_search_profile(text, text[], seniority_level, text[], text);

CREATE OR REPLACE FUNCTION public.save_search_profile(
  p_whatsapp     text,
  p_stack        text[],
  p_areas        text[],
  p_seniority    seniority_level,
  p_work_models  text[],
  p_location     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscriber_id uuid;
  v_profile       subscriber_profiles%rowtype;
  v_this_month    date := date_trunc('month', now())::date;
  v_limit         int  := 3;
  v_used          int;
BEGIN
  SELECT id INTO v_subscriber_id
    FROM subscribers
   WHERE user_id = auth.uid();
  IF v_subscriber_id IS NULL THEN
    RAISE EXCEPTION 'subscriber_not_found';
  END IF;

  SELECT * INTO v_profile
    FROM subscriber_profiles
   WHERE subscriber_id = v_subscriber_id;

  -- Primeira criacao: nao consome quota.
  IF v_profile.id IS NULL THEN
    INSERT INTO subscriber_profiles
      (subscriber_id, whatsapp, stack, areas, seniority, work_models, location, edits_count, edits_month)
    VALUES
      (v_subscriber_id, p_whatsapp, p_stack, COALESCE(p_areas, '{}'), p_seniority, p_work_models, p_location, 0, v_this_month);
    RETURN jsonb_build_object('ok', true, 'created', true,
                              'used', 0, 'limit', v_limit, 'remaining', v_limit);
  END IF;

  -- Conta do mes; zera se virou o mes.
  v_used := CASE
    WHEN v_profile.edits_month IS DISTINCT FROM v_this_month THEN 0
    ELSE COALESCE(v_profile.edits_count, 0)
  END;

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'edit_limit_reached';
  END IF;

  UPDATE subscriber_profiles SET
    whatsapp     = p_whatsapp,
    stack        = p_stack,
    areas        = COALESCE(p_areas, '{}'),
    seniority    = p_seniority,
    work_models  = p_work_models,
    location     = p_location,
    edits_count  = v_used + 1,
    edits_month  = v_this_month,
    updated_at   = now()
  WHERE id = v_profile.id;

  RETURN jsonb_build_object('ok', true, 'created', false,
                            'used', v_used + 1, 'limit', v_limit,
                            'remaining', v_limit - (v_used + 1));
END;
$$;

REVOKE ALL ON FUNCTION public.save_search_profile(text, text[], text[], seniority_level, text[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_search_profile(text, text[], text[], seniority_level, text[], text) TO authenticated;

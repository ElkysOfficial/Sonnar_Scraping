-- =====================================================
-- View unified_subscribers: leitura unificada de assinantes (Fluxo A + B).
--
-- Hoje o produto tem dois "subscribers" coexistindo: public.subscribers
-- (Fluxo A, portal Stripe) e public.vip_subscribers (Fluxo B, captados
-- direto no WhatsApp). As semanticas divergem o suficiente para justificar
-- duas tabelas, mas qualquer relatorio "quantos assinantes ativos eu tenho
-- hoje" precisa unir as duas — e hoje isso e feito em memoria no codigo
-- (apps/whatsapp/sender/src/utils/database.js / getVipSubscribers).
--
-- Esta migration NAO unifica as tabelas (decisao pos-v3.0.0). Cria uma view
-- read-only que materializa o UNION com um discriminador `source`, o lid
-- (extraido de subscriber_profiles para o Fluxo A), e os campos comuns
-- (plano, status, stripe ids, periodos, timestamps). Util para dashboard
-- admin e analytics sem precisar replicar a logica de merge em codigo.
--
-- Status sao mapeados para um conjunto canonico: pending, active, past_due,
-- canceled, expired, rejected. O Fluxo A nao tem expired/rejected (so
-- canceled); o Fluxo B nao tem 'past_due' como estado natural antes do
-- billing recorrente. Cada origem cobre o que tem, sem inventar.
-- =====================================================

CREATE OR REPLACE VIEW public.unified_subscribers AS
SELECT
  'portal'::TEXT                            AS source,
  s.id                                      AS id,
  s.user_id                                 AS user_id,
  sp.wa_lid                                 AS lid,
  s.name                                    AS name,
  s.email                                   AS email,
  s.plan::TEXT                              AS plan,
  s.status::TEXT                            AS status,
  s.stripe_customer_id                      AS stripe_customer_id,
  s.stripe_subscription_id                  AS stripe_subscription_id,
  s.current_period_end                      AS current_period_end,
  NULL::TIMESTAMPTZ                         AS expires_at,
  NULL::TEXT                                AS payment_method,
  s.created_at                              AS created_at,
  s.updated_at                              AS updated_at
FROM public.subscribers s
LEFT JOIN public.subscriber_profiles sp ON sp.subscriber_id = s.id

UNION ALL

SELECT
  'whatsapp'::TEXT                          AS source,
  v.id                                      AS id,
  NULL::UUID                                AS user_id,
  v.lid                                     AS lid,
  v.user_name                               AS name,
  v.email                                   AS email,
  v.plan                                    AS plan,
  v.status                                  AS status,
  v.stripe_customer_id                      AS stripe_customer_id,
  v.stripe_subscription_id                  AS stripe_subscription_id,
  v.current_period_end                      AS current_period_end,
  v.expires_at                              AS expires_at,
  v.payment_method                          AS payment_method,
  v.added_at                                AS created_at,
  v.updated_at                              AS updated_at
FROM public.vip_subscribers v;

COMMENT ON VIEW public.unified_subscribers IS
  'Leitura unificada de subscribers (Fluxo A, portal) + vip_subscribers '
  '(Fluxo B, WhatsApp). Read-only. source identifica a origem; lid e '
  'preenchido para Fluxo A via subscriber_profiles.wa_lid quando vinculado.';


-- =====================================================
-- Acesso: a view herda as policies das tabelas base quando consultada por
-- usuarios autenticados, MAS por padrao views nao expoem RLS para roles
-- que nao tem GRANT no SELECT subjacente. Para evitar confusao, restringimos
-- a view a admins e service_role.
-- =====================================================
REVOKE ALL ON public.unified_subscribers FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.unified_subscribers TO service_role;

-- Admins acessam via RPC (ja existe is_admin). Para uso direto via REST,
-- usamos uma funcao SECURITY DEFINER ao inves de granting SELECT, mantendo
-- consistencia com o resto do dashboard.
CREATE OR REPLACE FUNCTION public.get_unified_subscribers(
  source_filter TEXT DEFAULT NULL,
  status_filter TEXT DEFAULT NULL,
  plan_filter   TEXT DEFAULT NULL,
  max_rows      INTEGER DEFAULT 500
)
RETURNS SETOF public.unified_subscribers
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM public.unified_subscribers
  WHERE (source_filter IS NULL OR source = source_filter)
    AND (status_filter IS NULL OR status = status_filter)
    AND (plan_filter   IS NULL OR plan   = plan_filter)
    AND public.is_admin(auth.uid())
  ORDER BY updated_at DESC NULLS LAST
  LIMIT max_rows;
$$;

REVOKE ALL    ON FUNCTION public.get_unified_subscribers(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_subscribers(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_unified_subscribers(TEXT, TEXT, TEXT, INTEGER) IS
  'Dashboard admin: leitura unificada de assinantes (portal + whatsapp). '
  'Filtros opcionais por source/status/plan. SECURITY DEFINER + is_admin '
  'checa permissao dentro da funcao; nao admins recebem 0 linhas.';

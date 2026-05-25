-- =====================================================
-- Limpeza automatica de vip_delivery_history via pg_cron.
--
-- Hoje o bot chama cleanOldEntries() periodicamente para apagar entradas
-- com mais de 48h (cooldown de reenvio). Se o processo do bot ficar
-- parado, a tabela cresce indefinidamente. Movemos a limpeza para um
-- cron job dentro do proprio banco, alinhado com a janela de 48h ja
-- usada no codigo (apps/whatsapp/sender/src/services/vipHistory.js).
--
-- Requer pg_cron habilitado. Em projetos Supabase, a extensao precisa
-- ser instalada uma vez (esta migration tenta via CREATE EXTENSION; se
-- a role nao tiver permissao, habilite manualmente em Database > Extensions
-- e reaplique a migration).
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Garante schema cron acessivel a postgres (Supabase ja faz isso, mas
-- repetir nao machuca em ambientes locais).
GRANT USAGE ON SCHEMA cron TO postgres;

-- =====================================================
-- Funcao isolada para a limpeza. Facilita teste manual e troca da
-- janela sem mexer no scheduler.
-- =====================================================
CREATE OR REPLACE FUNCTION public.cleanup_vip_delivery_history(
  retention_hours INTEGER DEFAULT 48
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.vip_delivery_history
   WHERE sent_at < NOW() - (retention_hours || ' hours')::INTERVAL;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;

REVOKE ALL    ON FUNCTION public.cleanup_vip_delivery_history(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_vip_delivery_history(INTEGER) TO service_role;

COMMENT ON FUNCTION public.cleanup_vip_delivery_history(INTEGER) IS
  'Apaga entradas de vip_delivery_history mais velhas que retention_hours '
  '(default 48h). Disparada pelo pg_cron diariamente, mas tambem pode ser '
  'chamada manualmente via service_role para purgar sob demanda.';


-- =====================================================
-- Agendamento. Idempotente: remove o job antigo (se existir) antes de
-- recriar com o nome canonico.
-- =====================================================
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-vip-delivery-history-48h')
   WHERE EXISTS (
     SELECT 1 FROM cron.job WHERE jobname = 'cleanup-vip-delivery-history-48h'
   );
EXCEPTION WHEN OTHERS THEN
  -- cron.unschedule lanca quando o job nao existe; ignoramos.
  NULL;
END $$;

SELECT cron.schedule(
  'cleanup-vip-delivery-history-48h',
  '15 3 * * *',  -- 03:15 UTC todo dia
  $$SELECT public.cleanup_vip_delivery_history(48);$$
);

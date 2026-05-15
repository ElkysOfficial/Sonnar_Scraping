-- =====================================================
-- Sincroniza repo <-> banco: drop documentado de tabelas legadas.
--
-- As migrations 001-007 em database/migrations/*.sql criam ~13 tabelas
-- que foram removidas do banco em algum momento sem migration de remocao.
-- Reproduzir o schema do zero (rodar 001-007) divergiria do estado atual.
--
-- Esta migration e idempotente (DROP IF EXISTS): se a tabela ja nao existe,
-- nao faz nada. Apos rodar, repo e banco ficam alinhados.
--
-- Tabelas removidas:
--   * vip_*           - antigo sistema de assinaturas pre-Stripe.
--   * group_*         - antigo sistema de envio para grupos do WhatsApp.
--   * auto_responders - bot de respostas automaticas (descontinuado).
--   * user_mutes      - mute de usuarios em grupos (descontinuado).
--   * enrichment_cache - cache de enrichment (substituido por logica inline).
--   * scraper_stats   - estatisticas legadas (substituido por extraction_metrics).
--   * cleanup_log     - log de purges (substituido por logging estruturado).
--   * job_matches     - matching pre-MVP (logica esta nos RPCs).
--   * egress_stats    - tracking de egress (substituido por billing nativo Supabase).
--   * refresh_log     - log de materialized view (descontinuado).
-- =====================================================

DROP TABLE IF EXISTS public.vip_delivery_history       CASCADE;
DROP TABLE IF EXISTS public.vip_pending_subscribers    CASCADE;
DROP TABLE IF EXISTS public.vip_subscribers            CASCADE;
DROP TABLE IF EXISTS public.group_delivery_history     CASCADE;
DROP TABLE IF EXISTS public.group_features             CASCADE;
DROP TABLE IF EXISTS public.auto_responders            CASCADE;
DROP TABLE IF EXISTS public.user_mutes                 CASCADE;
DROP TABLE IF EXISTS public.enrichment_cache           CASCADE;
DROP TABLE IF EXISTS public.scraper_stats              CASCADE;
DROP TABLE IF EXISTS public.cleanup_log                CASCADE;
DROP TABLE IF EXISTS public.job_matches                CASCADE;
DROP TABLE IF EXISTS public.egress_stats               CASCADE;
DROP TABLE IF EXISTS public.refresh_log                CASCADE;

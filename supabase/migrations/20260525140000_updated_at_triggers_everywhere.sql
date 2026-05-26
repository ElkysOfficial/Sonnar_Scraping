-- =====================================================
-- Padroniza a atualizacao de updated_at via trigger.
--
-- Hoje a funcao public.set_updated_at() (definida no init_schema) so esta
-- aplicada em public.subscribers, public.subscriber_profiles e public.jobs.
-- As demais tabelas com a coluna updated_at dependem de UPDATEs manuais
-- espalhados em codigo (stripe-webhook, create-vip-checkout, wa-sender,
-- vipBilling). Isso e fragil: cada chamada de update precisa lembrar de
-- setar a coluna, e a duplicacao de logica entre trigger e codigo no caso
-- de subscribers/subscriber_profiles e ineficiente.
--
-- Esta migration aplica o trigger BEFORE UPDATE em todas as tabelas com a
-- coluna updated_at. O insert continua coberto pelo DEFAULT NOW() de cada
-- coluna. Em conjunto, os updates manuais correspondentes sao removidos
-- nos arquivos de codigo da aplicacao (commit deste PR).
-- =====================================================

-- vip_subscribers (Fluxo B; escrito por stripe-webhook, create-vip-checkout,
-- wa-sender e vipBilling).
DROP TRIGGER IF EXISTS trg_vip_subscribers_updated_at ON public.vip_subscribers;
CREATE TRIGGER trg_vip_subscribers_updated_at
  BEFORE UPDATE ON public.vip_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- sender_state (marca d'agua dos senders; updateSenderState/Delta).
DROP TRIGGER IF EXISTS trg_sender_state_updated_at ON public.sender_state;
CREATE TRIGGER trg_sender_state_updated_at
  BEFORE UPDATE ON public.sender_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- domain_circuits (estado do circuit breaker; escrito pelo scraper).
DROP TRIGGER IF EXISTS trg_domain_circuits_updated_at ON public.domain_circuits;
CREATE TRIGGER trg_domain_circuits_updated_at
  BEFORE UPDATE ON public.domain_circuits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- scraper_progress (checkpoint do scraper, baseline em migration anterior).
DROP TRIGGER IF EXISTS trg_scraper_progress_updated_at ON public.scraper_progress;
CREATE TRIGGER trg_scraper_progress_updated_at
  BEFORE UPDATE ON public.scraper_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

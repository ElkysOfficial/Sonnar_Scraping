-- =====================================================
-- Alinhamento da modelagem: constraints, baseline e documentacao.
--
-- Esta migration nao altera schema "logico"; ela:
--  1. Adiciona CHECKs em contact_leads para evitar valores que nao
--     conseguem ser convertidos depois em subscriber_profiles.
--  2. Adiciona migration baseline da tabela scraper_progress, que
--     existe no banco mas nao tinha migration declarada (drift).
--  3. Documenta o shape esperado das colunas JSONB chave (filters,
--     payment_proof, billing_notifications, payload, job_snapshot).
-- =====================================================

-- =====================================================
-- 1. contact_leads: alinhar com a modelagem do subscriber.
-- =====================================================
-- A tabela hoje aceita TEXT livre em stack/seniority. Como esse lead
-- vira (manual ou automaticamente) um subscriber + subscriber_profile,
-- e subscriber_profiles.seniority eh ENUM seniority_level, qualquer valor
-- fora do enum falha silenciosamente na conversao. Fixamos aqui.

-- Normalizacao previa de leads existentes. O form antigo enviava
-- seniority='lead'; o enum canonico eh 'staff_lead'. Mapeamos antes
-- de criar a CHECK para nao quebrar a migration onde ha dados.
UPDATE public.contact_leads
   SET seniority = 'staff_lead'
 WHERE seniority = 'lead';

-- Qualquer valor de stack/seniority fora do vocabulario canonico vira
-- 'other' / 'pleno' (defaults conservadores) para preservar os leads.
UPDATE public.contact_leads
   SET seniority = 'pleno'
 WHERE seniority NOT IN ('junior', 'pleno', 'senior', 'staff_lead');

UPDATE public.contact_leads
   SET stack = 'other'
 WHERE stack NOT IN (
   'frontend', 'backend', 'fullstack',
   'mobile', 'devops', 'data', 'other'
 );

ALTER TABLE public.contact_leads
  DROP CONSTRAINT IF EXISTS contact_leads_seniority_valid,
  ADD CONSTRAINT contact_leads_seniority_valid
    CHECK (seniority IN ('junior', 'pleno', 'senior', 'staff_lead'));

ALTER TABLE public.contact_leads
  DROP CONSTRAINT IF EXISTS contact_leads_stack_valid,
  ADD CONSTRAINT contact_leads_stack_valid
    CHECK (stack IN (
      'frontend', 'backend', 'fullstack',
      'mobile', 'devops', 'data', 'other'
    ));

COMMENT ON COLUMN public.contact_leads.seniority IS
  'Senioridade declarada no form da landing. Valores espelham o enum '
  'public.seniority_level (junior, pleno, senior, staff_lead) para que a '
  'conversao posterior em subscriber_profiles seja direta.';
COMMENT ON COLUMN public.contact_leads.stack IS
  'Stack principal escolhida no form. Vocabulario fechado: frontend, backend, '
  'fullstack, mobile, devops, data, other.';


-- =====================================================
-- 2. scraper_progress: baseline (a tabela existe no banco mas nao no repo).
-- Esta migration apenas declara o estado atual de forma idempotente. Em
-- ambientes onde a tabela ainda nao existe, ela eh criada; onde ja existe,
-- o IF NOT EXISTS protege.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.scraper_progress (
  engine      TEXT NOT NULL,
  batch_key   TEXT NOT NULL,
  cursor      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (engine, batch_key)
);

ALTER TABLE public.scraper_progress ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.scraper_progress IS
  'Checkpoint persistente do scraper por (engine, batch_key). Atualizado pelo '
  'apps/scraper via service_role. Sem policies: cliente nao toca.';
COMMENT ON COLUMN public.scraper_progress.cursor IS
  'JSONB livre, definido pelo engine. Tipicamente {page, offset, last_seen_id, ...}.';


-- =====================================================
-- 3. COMMENTs documentando shapes JSONB.
-- =====================================================

-- vip_subscribers.filters - matching VIP (Fluxo B / Plus).
-- Shape normalizado em apps/whatsapp/sender/src/services/database.js
-- (normalizeVipFilters). Manter aqui apenas a referencia, evitando
-- drift entre schema e codigo.
COMMENT ON COLUMN public.vip_subscribers.filters IS
  'Filtros de matching do assinante Plus. Shape canonico definido por '
  'normalizeVipFilters() em apps/whatsapp/sender/src/services/database.js. '
  'Chaves esperadas: stacks[], areas[], seniority[], locations[], workMode[], '
  'contract[], languages[], weights{}, must{}. JSONB para suportar evolucao '
  'do perfil sem migration.';

COMMENT ON COLUMN public.vip_subscribers.payment_proof IS
  'Metadados do comprovante de pagamento manual (Fluxo B antes do Stripe). '
  'Shape: { type: "pix_receipt"|"invoice"|..., url, uploaded_at, ... }. '
  'NULL quando o pagamento foi feito por card via Stripe (payment_method=card).';

COMMENT ON COLUMN public.vip_subscribers.billing_notifications IS
  'Marca quais notificacoes de cobranca ja foram enviadas para evitar duplicacao. '
  'Chaves: welcome, expiry_warning, expired, past_due. Valor: timestamp ISO da '
  'ultima vez que aquela notificacao foi disparada para este assinante.';

COMMENT ON COLUMN public.wa_plan_notifications.payload IS
  'Snapshot dos campos relevantes do evento Stripe usado para montar a mensagem '
  '(plano antigo, novo, valores). Shape definido pelo stripe-webhook ao enfileirar.';

COMMENT ON COLUMN public.vip_delivery_history.job_snapshot IS
  'Copia da vaga (titulo, empresa, link, salario, ...) no momento do envio. '
  'Permite o dashboard mostrar as vagas recebidas mesmo que a vaga original '
  'tenha sumido do jobs.json. Shape segue o modelo de vaga do core.';

COMMENT ON COLUMN public.extraction_events.data IS
  'Payload livre do evento (kind define a forma). Exemplos: '
  '{status, retry_after} para status.429; {error, stack} para parser.error.';

COMMENT ON COLUMN public.sender_state.metadata IS
  'Metadata livre por sender. Tipicamente armazena estatisticas do ultimo '
  'batch (jobs_sent, groups_targeted, etc.).';

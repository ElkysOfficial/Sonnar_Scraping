-- =====================================================
-- Schema de runtime do Sonar Bot (WhatsApp) no projeto do PORTAL.
--
-- Decisao de arquitetura (2026-05-16):
--  * Bot e portal compartilham este mesmo projeto Supabase.
--  * Fluxo A (assinante vindo do portal): o bot NAO duplica dados aqui.
--    Le plano/perfil direto de subscribers + subscriber_profiles via wa_lid.
--    Cancelamento de assinatura (subscribers.status) passa a valer no bot
--    automaticamente, sem webhook.
--  * Fluxo B (assinante captado fora do portal, pelo WhatsApp): nao tem
--    linha em subscribers; fica registrado em vip_subscribers (abaixo).
--
-- Planos (subscribers.plan / vip_subscribers.plan):
--  * free : comunidades sociais. NAO recebe vagas.
--  * pro  : grupo de vagas (WhatsApp + Discord). Recebe TODAS, sem filtro.
--  * plus : recebe vagas filtradas pelo perfil, no privado. Inclui o do pro.
--
-- As vagas nao moram mais no Supabase (vem de jobs.json via
-- message-formatting-core), por isso job_id eh TEXT e sem FK.
-- =====================================================

-- Index para o lookup do bot por LID no Fluxo A (subscriber_profiles.wa_lid).
CREATE INDEX IF NOT EXISTS idx_profiles_wa_lid
  ON public.subscriber_profiles(wa_lid)
  WHERE wa_lid IS NOT NULL;

-- =====================================================
-- vip_subscribers: assinantes do FLUXO B (fora do portal).
-- Absorve o antigo estado "pendente" via coluna status — nao existe mais
-- tabela vip_pending_subscribers separada.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.vip_subscribers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lid           TEXT UNIQUE NOT NULL,                 -- WhatsApp LID
  user_name     TEXT NOT NULL,
  phone         TEXT,
  plan          TEXT NOT NULL DEFAULT 'plus'
                  CHECK (plan IN ('free', 'pro', 'plus')),
  filters       JSONB DEFAULT '{}'::jsonb,            -- perfil de matching (so usado p/ plus)
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'rejected')),
  payment_proof JSONB,                                -- metadados do comprovante (Fluxo B)
  decided_at    TIMESTAMPTZ,
  decided_by    TEXT,
  reject_reason TEXT,
  added_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vip_subscribers_status ON public.vip_subscribers(status);

-- =====================================================
-- vip_delivery_history: dedupe de vagas ja enviadas a cada assinante.
-- Chaveado por LID (funciona para Fluxo A e B), job_id eh TEXT (id do jobs.json).
-- =====================================================
CREATE TABLE IF NOT EXISTS public.vip_delivery_history (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lid     TEXT NOT NULL,
  job_id  TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (lid, job_id)
);

CREATE INDEX IF NOT EXISTS idx_vip_delivery_lid     ON public.vip_delivery_history(lid);
CREATE INDEX IF NOT EXISTS idx_vip_delivery_sent_at ON public.vip_delivery_history(sent_at);

-- =====================================================
-- group_delivery_history: dedupe de vagas enviadas aos grupos.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.group_delivery_history (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id   TEXT NOT NULL,
  group_id TEXT NOT NULL,
  sent_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (job_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_group_delivery_sent_at ON public.group_delivery_history(sent_at);

-- =====================================================
-- sender_state: marca d'agua dos senders (card/job/vip).
-- last_processed_* sustentam o fetch incremental (getJobsDelta).
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sender_state (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_type               TEXT UNIQUE NOT NULL,     -- 'card' | 'job' | 'vip'
  last_sent_at              TIMESTAMPTZ,
  last_processed_job_id     TEXT,
  last_processed_created_at TIMESTAMPTZ,
  jobs_processed_count      INTEGER DEFAULT 0,
  metadata                  JSONB DEFAULT '{}'::jsonb,
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- RLS: o bot acessa via service-role (bypassa RLS). Habilitamos RLS sem
-- policies para que chaves anon/authenticated nao toquem estas tabelas.
-- =====================================================
ALTER TABLE public.vip_subscribers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_delivery_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_delivery_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sender_state           ENABLE ROW LEVEL SECURITY;

-- Fila de notificacoes do bot para eventos de mudanca de plano.
-- Webhook stripe insere; bot wa-sender consome (polling) e envia DM
-- privada explicando a mudanca + link do grupo / da Comunidade quando
-- aplicavel.
--
-- Idempotencia: (stripe_event_id, event_type) e unique - reenvios do
-- webhook nao geram mensagem duplicada.
CREATE TABLE IF NOT EXISTS public.wa_plan_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id     uuid REFERENCES public.subscribers(id) ON DELETE CASCADE,
  lid               text NOT NULL,
  event_type        text NOT NULL CHECK (event_type IN (
    'plan_upgraded_to_plus',
    'plan_downgraded_to_pro',
    'plan_canceled_to_free'
  )),
  stripe_event_id   text,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  attempts          int  NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz,
  error             text
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wa_plan_notifications_event
  ON public.wa_plan_notifications(stripe_event_id, event_type)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_plan_notifications_pending
  ON public.wa_plan_notifications(created_at)
  WHERE status = 'pending';

ALTER TABLE public.wa_plan_notifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.wa_plan_notifications IS
  'Fila de mensagens do bot WhatsApp avisando mudanca de plano efetivada.';
COMMENT ON COLUMN public.wa_plan_notifications.event_type IS
  'Qual transicao ocorreu: upgrade para Plus, downgrade para Pro, ou cancelamento para Free.';

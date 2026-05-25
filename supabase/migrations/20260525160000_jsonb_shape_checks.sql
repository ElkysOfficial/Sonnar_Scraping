-- =====================================================
-- Shape guards para colunas JSONB: garante que sao objects (ou NULL),
-- nunca arrays, scalars ou null-json. Evita inserts acidentais como
-- "filters: []" ou "payment_proof: 'pix'" que passariam silenciosamente
-- e quebrariam o consumo no codigo.
--
-- Onde o shape interno e conhecido (chaves esperadas), os comentarios
-- na migration anterior 20260525120000_db_alignment_constraints_and_docs
-- ja documentam. Aqui validamos o tipo base.
--
-- Estrategia: CHECK ... NOT VALID + VALIDATE separado. NOT VALID nao
-- bloqueia o ALTER se ja existirem linhas com shape errado; VALIDATE
-- depois forca a checagem. Se a base estiver suja, o VALIDATE falha e o
-- DBA precisa normalizar antes — mais explicito que falhar a migration
-- inteira no meio.
-- =====================================================

-- ---------------- vip_subscribers ----------------
-- filters: NOT NULL (DEFAULT '{}'), sempre object.
-- payment_proof: NULL ou object (metadados do comprovante).
-- billing_notifications: NOT NULL (DEFAULT '{}'), object, valores ISO strings.

DO $$
BEGIN
  -- vip_subscribers.filters precisa ser object quando presente.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'vip_subscribers_filters_is_object'
  ) THEN
    ALTER TABLE public.vip_subscribers
      ADD CONSTRAINT vip_subscribers_filters_is_object
        CHECK (filters IS NULL OR jsonb_typeof(filters) = 'object') NOT VALID;
    ALTER TABLE public.vip_subscribers VALIDATE CONSTRAINT vip_subscribers_filters_is_object;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'vip_subscribers_payment_proof_is_object'
  ) THEN
    ALTER TABLE public.vip_subscribers
      ADD CONSTRAINT vip_subscribers_payment_proof_is_object
        CHECK (payment_proof IS NULL OR jsonb_typeof(payment_proof) = 'object') NOT VALID;
    ALTER TABLE public.vip_subscribers VALIDATE CONSTRAINT vip_subscribers_payment_proof_is_object;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'vip_subscribers_billing_notifications_is_object'
  ) THEN
    ALTER TABLE public.vip_subscribers
      ADD CONSTRAINT vip_subscribers_billing_notifications_is_object
        CHECK (billing_notifications IS NULL OR jsonb_typeof(billing_notifications) = 'object') NOT VALID;
    ALTER TABLE public.vip_subscribers VALIDATE CONSTRAINT vip_subscribers_billing_notifications_is_object;
  END IF;
END $$;


-- ---------------- wa_plan_notifications ----------------
-- payload: NOT NULL (DEFAULT '{}'), sempre object.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'wa_plan_notifications_payload_is_object'
  ) THEN
    ALTER TABLE public.wa_plan_notifications
      ADD CONSTRAINT wa_plan_notifications_payload_is_object
        CHECK (jsonb_typeof(payload) = 'object') NOT VALID;
    ALTER TABLE public.wa_plan_notifications VALIDATE CONSTRAINT wa_plan_notifications_payload_is_object;
  END IF;
END $$;


-- ---------------- vip_delivery_history ----------------
-- job_snapshot: NULL ou object (snapshot da vaga no momento do envio).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'vip_delivery_history_job_snapshot_is_object'
  ) THEN
    ALTER TABLE public.vip_delivery_history
      ADD CONSTRAINT vip_delivery_history_job_snapshot_is_object
        CHECK (job_snapshot IS NULL OR jsonb_typeof(job_snapshot) = 'object') NOT VALID;
    ALTER TABLE public.vip_delivery_history VALIDATE CONSTRAINT vip_delivery_history_job_snapshot_is_object;
  END IF;
END $$;


-- ---------------- extraction_events ----------------
-- data: NULL ou object (payload do evento, formato definido por kind).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'extraction_events_data_is_object'
  ) THEN
    ALTER TABLE public.extraction_events
      ADD CONSTRAINT extraction_events_data_is_object
        CHECK (data IS NULL OR jsonb_typeof(data) = 'object') NOT VALID;
    ALTER TABLE public.extraction_events VALIDATE CONSTRAINT extraction_events_data_is_object;
  END IF;
END $$;


-- ---------------- sender_state ----------------
-- metadata: NULL ou object.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sender_state_metadata_is_object'
  ) THEN
    ALTER TABLE public.sender_state
      ADD CONSTRAINT sender_state_metadata_is_object
        CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object') NOT VALID;
    ALTER TABLE public.sender_state VALIDATE CONSTRAINT sender_state_metadata_is_object;
  END IF;
END $$;


-- ---------------- scraper_progress ----------------
-- cursor: NOT NULL (DEFAULT '{}'), object.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'scraper_progress_cursor_is_object'
  ) THEN
    ALTER TABLE public.scraper_progress
      ADD CONSTRAINT scraper_progress_cursor_is_object
        CHECK (jsonb_typeof(cursor) = 'object') NOT VALID;
    ALTER TABLE public.scraper_progress VALIDATE CONSTRAINT scraper_progress_cursor_is_object;
  END IF;
END $$;


-- ---------------- stripe_events ----------------
-- payload: NULL ou object (evento bruto do Stripe).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'stripe_events_payload_is_object'
  ) THEN
    ALTER TABLE public.stripe_events
      ADD CONSTRAINT stripe_events_payload_is_object
        CHECK (payload IS NULL OR jsonb_typeof(payload) = 'object') NOT VALID;
    ALTER TABLE public.stripe_events VALIDATE CONSTRAINT stripe_events_payload_is_object;
  END IF;
END $$;

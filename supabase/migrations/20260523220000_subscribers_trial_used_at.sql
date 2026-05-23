-- Marca o momento em que o subscriber consumiu seu unico trial de 7 dias.
-- Setado pelo webhook na 1a vez que uma subscription dele entra em trial.
-- Nunca e limpo (sobrevive a cancelamento/downgrade pra Free).
-- create-checkout-session le esse campo: se preenchido, NAO aplica
-- trial_period_days - cliente reincidente paga na hora.
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS trial_used_at TIMESTAMPTZ;

COMMENT ON COLUMN public.subscribers.trial_used_at IS
  'Quando o subscriber consumiu o trial inicial de 7 dias. NULL = ainda elegivel a trial.';

-- Backfill: assinantes que ja tiveram alguma subscription paga (active,
-- past_due ou canceled) ja gastaram o trial - marca created_at como
-- proxy temporal pra evitar trial duplo em quem ja eh cliente.
UPDATE public.subscribers
   SET trial_used_at = created_at
 WHERE trial_used_at IS NULL
   AND (stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL);

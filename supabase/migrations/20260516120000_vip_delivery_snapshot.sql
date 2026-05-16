-- =====================================================
-- Snapshot da vaga entregue + leitura pelo dashboard.
--
-- As vagas vivem no jobs.json (core), nao no Supabase. Para o dashboard do
-- portal mostrar as vagas que o assinante recebeu no WhatsApp, o bot passa
-- a gravar um snapshot da vaga em vip_delivery_history no momento do envio.
--
-- match_score: score de compatibilidade calculado pelo bot (0-100).
-- =====================================================

ALTER TABLE public.vip_delivery_history
  ADD COLUMN IF NOT EXISTS job_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS match_score  INTEGER;

-- Dashboard: o assinante autenticado le as proprias entregas.
-- O vinculo eh por wa_lid (subscriber_profiles) -> lid (vip_delivery_history).
DROP POLICY IF EXISTS "subscriber reads own deliveries" ON public.vip_delivery_history;
CREATE POLICY "subscriber reads own deliveries"
  ON public.vip_delivery_history
  FOR SELECT
  TO authenticated
  USING (
    lid IN (
      SELECT sp.wa_lid
      FROM public.subscriber_profiles sp
      JOIN public.subscribers s ON s.id = sp.subscriber_id
      WHERE s.user_id = auth.uid()
        AND sp.wa_lid IS NOT NULL
    )
  );

-- =====================================================
-- contact_leads — leads do formulário público da landing
-- Não é uma assinatura. É só um lead que entrou pelo form de contato.
-- Convertido depois (manual ou via automação) em subscriber.
-- =====================================================

CREATE TABLE public.contact_leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  whatsapp    TEXT NOT NULL,
  stack       TEXT NOT NULL,
  seniority   TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'landing_contact_form',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_leads_email      ON public.contact_leads(email);
CREATE INDEX idx_contact_leads_created_at ON public.contact_leads(created_at DESC);

COMMENT ON TABLE public.contact_leads IS 'Leads capturados pelo formulário público. Anônimos podem inserir; só admin lê.';

-- =========================
-- RLS
-- =========================
ALTER TABLE public.contact_leads ENABLE ROW LEVEL SECURITY;

-- Qualquer um (anônimo) pode inserir um lead.
CREATE POLICY "contact_leads_insert_anon"
  ON public.contact_leads FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Só admins leem.
CREATE POLICY "contact_leads_select_admin"
  ON public.contact_leads FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "contact_leads_service_role_all"
  ON public.contact_leads FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT INSERT ON public.contact_leads TO anon, authenticated;
GRANT SELECT ON public.contact_leads TO authenticated;

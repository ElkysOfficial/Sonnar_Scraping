-- =====================================================
-- Consultoria humana LinkedIn + CV (v3.10.32)
-- =====================================================
--
-- Tabela que armazena solicitacoes de consultoria do plano Plus. O fluxo:
--
--   1. Assinante Plus preenche form no dashboard (/dashboard/consultoria)
--      com objetivo + LinkedIn URL + (opcional) CV PDF + (opcional) vaga-alvo
--   2. Edge function valida plano Plus, salva row + arquivo no Storage,
--      e dispara mensagem WhatsApp pro admin
--   3. Admin combina horario por WhatsApp; usa comando /consultoria <id>
--      agendar DD/MM HH:MM pra registrar
--   4. Apos a call: /consultoria <id> concluir
--
-- O CV anexado pode ser distinto do `subscriber_resumes` (consultoria pede
-- contexto pontual; o resume do assinante e usado pra matching).

create table if not exists public.consultoria_requests (
  id                  uuid primary key default gen_random_uuid(),
  subscriber_id       uuid not null references public.subscribers(id) on delete cascade,

  -- Inputs do form
  linkedin_url        text not null,
  objetivo            text not null,            -- texto livre: "transicao de carreira", "otimizar CV", etc
  vaga_alvo_url       text,                     -- opcional: link de uma vaga pra focar
  cv_file_path        text,                     -- opcional: bucket consultoria-cvs/<sub_id>/<uuid>.pdf
  cv_file_name        text,                     -- opcional: nome original (UX)
  cv_file_size        int,                      -- opcional: bytes

  -- Estado do fluxo
  status              text not null default 'pending'
    check (status in ('pending', 'scheduled', 'done', 'cancelled')),
  scheduled_at        timestamptz,              -- horario combinado (preenchido em /consultoria agendar)
  admin_notes         text,                     -- anotacoes internas (nao expostas ao assinante)

  -- Audit
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_consultoria_requests_subscriber
  on public.consultoria_requests (subscriber_id, created_at desc);

create index if not exists idx_consultoria_requests_status
  on public.consultoria_requests (status, created_at desc)
  where status in ('pending', 'scheduled');

-- Trigger updated_at (padrao do projeto)
create trigger trg_consultoria_requests_updated_at
  before update on public.consultoria_requests
  for each row execute function public.set_updated_at();

-- =====================================================
-- RLS — assinante so ve os proprios pedidos; service_role ve tudo
-- =====================================================

alter table public.consultoria_requests enable row level security;

create policy "subscriber_select_own_consultoria"
  on public.consultoria_requests for select
  using (
    subscriber_id in (
      select id from public.subscribers where auth_user_id = auth.uid()
    )
  );

create policy "subscriber_insert_own_consultoria"
  on public.consultoria_requests for insert
  with check (
    subscriber_id in (
      select id from public.subscribers where auth_user_id = auth.uid()
    )
  );

-- Service role bypassa RLS via service_role_key (edge function + admin).

-- =====================================================
-- Storage bucket — privado, so service_role + dono leem
-- =====================================================

insert into storage.buckets (id, name, public)
values ('consultoria-cvs', 'consultoria-cvs', false)
on conflict (id) do nothing;

create policy "consultoria_cv_owner_read"
  on storage.objects for select
  using (
    bucket_id = 'consultoria-cvs'
    and (storage.foldername(name))[1] in (
      select id::text from public.subscribers where auth_user_id = auth.uid()
    )
  );

create policy "consultoria_cv_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'consultoria-cvs'
    and (storage.foldername(name))[1] in (
      select id::text from public.subscribers where auth_user_id = auth.uid()
    )
  );

comment on table public.consultoria_requests is
  'v3.10.32: pedidos de consultoria humana (LinkedIn + CV) do plano Plus. Status segue fluxo pending -> scheduled -> done. Admin gerencia via comandos no bot WhatsApp.';

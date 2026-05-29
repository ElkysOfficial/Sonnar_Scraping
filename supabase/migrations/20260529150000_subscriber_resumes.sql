-- =====================================================
-- Plus #4: Upload de curriculo + parse deterministico (v3.8.0)
-- =====================================================
--
-- Tabela que armazena o resultado do parse do curriculo do assinante Plus.
-- O arquivo original fica no Supabase Storage (bucket `resumes`, privado);
-- aqui guardamos apenas o caminho + dados extraidos por regex/vocabulario
-- (Caminho A: zero custo de LLM).
--
-- Politica: 1 curriculo ATIVO por subscriber. Versoes antigas ficam com
-- is_active=false (historico). Cliente pode reverter pra uma versao
-- anterior se quiser.

create table if not exists public.subscriber_resumes (
  id                  uuid primary key default gen_random_uuid(),
  subscriber_id       uuid not null references public.subscribers(id) on delete cascade,

  -- Arquivo no Storage
  file_path           text not null,            -- ex: resumes/<sub_id>/<uuid>.pdf
  file_name           text,                     -- nome original (UX)
  file_size           int,                      -- bytes
  file_mime           text,                     -- 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  -- Resultado do parse (Caminho A — sem LLM, regex + vocabulario)
  raw_text            text,                     -- texto bruto extraido (max ~100KB)
  extracted_skills    text[] default '{}',      -- skills detectadas (canonicas)
  years_total         int,                      -- anos totais de experiencia (heuristica)
  seniority           text,                     -- 'junior'|'pleno'|'senior'|'lead'|'staff'|null
  languages           text[] default '{}',      -- ['portugues','ingles','espanhol']

  -- Metadata do processamento
  parser_version      text not null,            -- 'v1.0' — permite re-rodar se evoluir heuristica
  parsed_at           timestamptz,
  parse_status        text not null default 'pending' check (parse_status in ('pending','done','failed')),
  parse_error         text,
  parse_metadata      jsonb default '{}'::jsonb, -- { text_length, skill_matches_count, etc }

  -- Estado
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_subscriber_resumes_subscriber_active
  on public.subscriber_resumes (subscriber_id) where is_active = true;

create index if not exists idx_subscriber_resumes_status
  on public.subscriber_resumes (parse_status) where parse_status <> 'done';

comment on table public.subscriber_resumes is
  'Curriculos do assinante Plus + dados extraidos (regex/vocabulario, sem LLM).';
comment on column public.subscriber_resumes.parser_version is
  'Versao da heuristica de parse. Bump quando mudar para permitir reprocessar.';

-- Auto-update updated_at + garante 1 ativo por subscriber.
create or replace function public.subscriber_resumes_set_active_unique()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  -- Se este registro fica ativo, desativa os outros do mesmo subscriber.
  if new.is_active = true then
    update public.subscriber_resumes
      set is_active = false
      where subscriber_id = new.subscriber_id
        and id <> new.id
        and is_active = true;
  end if;
  return new;
end$$;

drop trigger if exists trg_subscriber_resumes_active_unique on public.subscriber_resumes;
create trigger trg_subscriber_resumes_active_unique
before insert or update of is_active on public.subscriber_resumes
for each row execute function public.subscriber_resumes_set_active_unique();

-- =====================================================
-- RLS: cada subscriber so ve/edita os proprios curriculos.
-- Edge Function usa service_role e bypassa.
-- =====================================================
alter table public.subscriber_resumes enable row level security;

create policy "subscriber_resumes_select_own"
  on public.subscriber_resumes for select
  using (
    subscriber_id in (select id from public.subscribers where auth_user_id = auth.uid())
  );

create policy "subscriber_resumes_insert_own"
  on public.subscriber_resumes for insert
  with check (
    subscriber_id in (select id from public.subscribers where auth_user_id = auth.uid())
  );

create policy "subscriber_resumes_update_own"
  on public.subscriber_resumes for update
  using (
    subscriber_id in (select id from public.subscribers where auth_user_id = auth.uid())
  )
  with check (
    subscriber_id in (select id from public.subscribers where auth_user_id = auth.uid())
  );

create policy "subscriber_resumes_delete_own"
  on public.subscriber_resumes for delete
  using (
    subscriber_id in (select id from public.subscribers where auth_user_id = auth.uid())
  );

-- =====================================================
-- Storage bucket privado `resumes` + policies
-- Path convention: resumes/<subscriber_id>/<uuid>.<ext>
-- =====================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  10485760,  -- 10 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Subscriber so pode upload na propria pasta (primeiro segmento do path = subscriber_id).
create policy "resumes_upload_own"
  on storage.objects for insert
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] in (
      select id::text from public.subscribers where auth_user_id = auth.uid()
    )
  );

create policy "resumes_select_own"
  on storage.objects for select
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] in (
      select id::text from public.subscribers where auth_user_id = auth.uid()
    )
  );

create policy "resumes_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] in (
      select id::text from public.subscribers where auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- RPC: pega o curriculo ATIVO do subscriber autenticado.
-- Util pro frontend mostrar o resultado do parse.
-- =====================================================
create or replace function public.get_my_active_resume()
returns table (
  id                uuid,
  file_name         text,
  file_size         int,
  extracted_skills  text[],
  years_total       int,
  seniority         text,
  languages         text[],
  parse_status      text,
  parsed_at         timestamptz,
  created_at        timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    r.id, r.file_name, r.file_size,
    r.extracted_skills, r.years_total, r.seniority, r.languages,
    r.parse_status, r.parsed_at, r.created_at
  from public.subscriber_resumes r
  join public.subscribers s on s.id = r.subscriber_id
  where s.auth_user_id = auth.uid()
    and r.is_active = true
  order by r.created_at desc
  limit 1;
$$;

comment on function public.get_my_active_resume() is
  'Retorna o curriculo ativo do assinante autenticado (Plus only no frontend).';

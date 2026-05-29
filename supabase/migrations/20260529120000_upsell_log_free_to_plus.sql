-- =====================================================
-- Upsell automatico Free -> Plus (v3.7.x)
-- =====================================================
--
-- Tabela de log + cron semanal que dispara a Edge Function
-- `weekly-upsell-free-to-plus`. A tabela existe principalmente pra rate-limit
-- (1 envio por canal por subscriber a cada 30 dias) e pra audit.

create table if not exists public.upsell_log (
  id              uuid primary key default gen_random_uuid(),
  subscriber_id   uuid not null references public.subscribers(id) on delete cascade,
  -- 'email' ou 'whatsapp' — colunas separadas no rate-limit
  channel         text not null check (channel in ('email','whatsapp')),
  -- 'sent' | 'failed' | 'skipped' (sem email/wa_lid, ou opt-out)
  status          text not null default 'sent' check (status in ('sent','failed','skipped')),
  campaign        text not null default 'free_to_plus_weekly',
  -- payload util pra analise (jobs_count_week, sample_job_titles, etc)
  metadata        jsonb not null default '{}'::jsonb,
  error_message   text,
  sent_at         timestamptz not null default now()
);

create index if not exists idx_upsell_log_subscriber_channel_recent
  on public.upsell_log (subscriber_id, channel, sent_at desc);

create index if not exists idx_upsell_log_sent_at_desc
  on public.upsell_log (sent_at desc);

comment on table public.upsell_log is
  'Log de campanhas de upsell automatico (Free -> Plus). Usado pra rate-limit e auditoria.';

-- RLS: so admins podem ver. Edge Function usa service_role e bypassa.
alter table public.upsell_log enable row level security;

create policy "upsell_log_admin_only_select"
  on public.upsell_log
  for select
  using (
    exists (
      select 1 from public.admins where user_id = auth.uid()
    )
  );

-- Helper: subscribers Free elegiveis pra upsell agora.
-- "Elegivel" = plano free + status active + cadastrado ha 7+ dias
--              + nao recebeu upsell deste channel nos ultimos 30 dias.
create or replace function public.list_upsell_free_candidates(p_channel text)
returns table (
  subscriber_id   uuid,
  email           text,
  name            text,
  phone           text,
  wa_lid          text,
  created_at      timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    s.id as subscriber_id,
    s.email,
    coalesce(nullif(trim(coalesce(s.name,'') || ' ' || coalesce(s.surname,'')), ''), s.name) as name,
    s.phone,
    sp.wa_lid,
    s.created_at
  from public.subscribers s
  left join public.subscriber_profiles sp on sp.subscriber_id = s.id
  where s.plan = 'free'
    and s.status = 'active'
    and s.created_at < now() - interval '7 days'
    -- Channel matters: email exige s.email; whatsapp exige sp.wa_lid
    and (
      (p_channel = 'email' and s.email is not null and s.email <> '')
      or
      (p_channel = 'whatsapp' and sp.wa_lid is not null and sp.wa_lid <> '')
    )
    -- Rate-limit: 1 envio por channel por subscriber a cada 30 dias
    and not exists (
      select 1
      from public.upsell_log ul
      where ul.subscriber_id = s.id
        and ul.channel = p_channel
        and ul.status = 'sent'
        and ul.sent_at > now() - interval '30 days'
    );
$$;

comment on function public.list_upsell_free_candidates(text) is
  'Lista subscribers Free elegiveis pra receber upsell por canal (email|whatsapp).';

-- =====================================================
-- pg_cron: dispara Edge Function `weekly-upsell-free-to-plus`
-- toda segunda 10:00 BRT (13:00 UTC).
--
-- A funcao escolhe ambos os canais (email + whatsapp), respeitando
-- rate-limit individual de cada um. Idempotente: rodar 2x no mesmo dia
-- nao duplica envio (a propria funcao checa upsell_log).
-- =====================================================
do $$
declare
  v_url text := current_setting('app.functions_url', true);
begin
  -- Remove agendamento anterior se existir (idempotencia)
  perform cron.unschedule('weekly-upsell-free-to-plus');
exception when others then
  -- ignore se nao existe ainda
  null;
end$$;

-- IMPORTANTE: configurar 2 secrets antes do primeiro run:
--   - app.functions_url      (ex: 'https://<ref>.functions.supabase.co')
--   - app.upsell_cron_token  (Bearer token compartilhado com a Edge Function)
--
-- Comando manual de agendamento (rodar uma vez apos deploy):
--
--   select cron.schedule(
--     'weekly-upsell-free-to-plus',
--     '0 13 * * 1',  -- segunda 13:00 UTC = 10:00 BRT
--     $cron$
--       select net.http_post(
--         url := current_setting('app.functions_url') || '/weekly-upsell-free-to-plus',
--         headers := jsonb_build_object(
--           'Content-Type', 'application/json',
--           'Authorization', 'Bearer ' || current_setting('app.upsell_cron_token')
--         ),
--         body := '{}'::jsonb,
--         timeout_milliseconds := 60000
--       );
--     $cron$
--   );

-- ═══════════════════════════════════════════════════════════════════════
-- whatsapp_conversations + extensoes em support_tickets
--
-- v3.10.23 — Sistema de atendimento humano via WhatsApp
--
-- Arquitetura: o bot do Sonnar tambem responde mensagens recebidas (ate
-- agora so enviava). Quando o cliente solicita atendimento, o bot entra
-- em modo silencioso e os admins respondem via comando /r — as
-- mensagens trafegam pelo proprio numero do bot.
--
-- ESTE ARQUIVO RODA NO BANCO DA ELKYS (njubtnsgtjcfmbnvjuqr).
-- A tabela usa support_tickets que ja existe — nao recriar.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- Extensoes em support_tickets
-- ───────────────────────────────────────────────────────────────────────

-- Origem do ticket (manual via portal vs whatsapp vs email)
alter table public.support_tickets
  add column if not exists source text default 'manual'
    check (source in ('manual','email','whatsapp','portal'));

-- JID do WhatsApp quando origem eh 'whatsapp'
alter table public.support_tickets
  add column if not exists whatsapp_jid text;

-- Metadados livres (ex.: numero, lead_id, subscriber_id do Sonnar)
alter table public.support_tickets
  add column if not exists source_metadata jsonb default '{}'::jsonb;

create index if not exists idx_support_tickets_source
  on public.support_tickets(source) where source != 'manual';
create index if not exists idx_support_tickets_whatsapp_jid
  on public.support_tickets(whatsapp_jid) where whatsapp_jid is not null;

comment on column public.support_tickets.source
  is 'Origem do ticket. ''whatsapp'' indica que veio pelo bot, com JID em whatsapp_jid.';

-- ───────────────────────────────────────────────────────────────────────
-- whatsapp_conversations: estado da conversacao por JID
-- ───────────────────────────────────────────────────────────────────────

create table if not exists public.whatsapp_conversations (
  -- Identificacao da conversa (JID = numero do cliente)
  jid text primary key,

  -- Menu atual: root, sonnar, sonnar_assinar, sonnar_guia, sonnar_consultoria,
  -- orcamento, reuniao, parceria
  current_menu text default 'root',

  -- Modo do bot:
  --   'bot'              -> bot responde automaticamente
  --   'human'            -> bot em silencio, admins atendendo
  --   'awaiting_rating'  -> bot pediu nota 1-5 e aguarda resposta
  mode text default 'bot' check (mode in ('bot','human','awaiting_rating')),

  -- Ticket aberto associado (criado quando entra em 'human')
  active_ticket_id uuid references public.support_tickets(id) on delete set null,

  -- Identificacao do interlocutor (qual tipo de pessoa)
  --   'elkys_client'      -> cliente Elkys conhecido
  --   'sonnar_subscriber' -> assinante Sonnar (free/pro/plus)
  --   'lead'              -> lead recem-criado em leads
  --   'admin'             -> um dos numeros admin
  --   'unknown'           -> nao identificado ainda
  identified_as text default 'unknown' check (identified_as in
    ('elkys_client','sonnar_subscriber','lead','admin','unknown')),

  -- FKs cross-tabela (subscriber_id eh cross-DB, nao FK)
  client_id uuid references public.clients(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  subscriber_id uuid,   -- cross-DB pro Sonnar, sem FK enforcement
  subscriber_plan text, -- snapshot do plano no momento do atendimento

  -- Nome cacheado pra mostrar nas notificacoes admin
  display_name text,

  -- Pra clientes que precisam ser "lembrados" entre sessoes
  last_message_at timestamptz default now(),
  last_message_text text,
  last_bot_reply_at timestamptz,

  -- Storage livre — usado pelo menuRouter pra manter contexto
  -- (ex.: { "sonnar_assinar": "grupo" })
  context jsonb default '{}'::jsonb,

  -- Auditoria
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_conv_mode on public.whatsapp_conversations(mode);
create index if not exists idx_wa_conv_active_ticket on public.whatsapp_conversations(active_ticket_id) where active_ticket_id is not null;
create index if not exists idx_wa_conv_last_msg on public.whatsapp_conversations(last_message_at desc);
create index if not exists idx_wa_conv_client_id on public.whatsapp_conversations(client_id) where client_id is not null;
create index if not exists idx_wa_conv_lead_id on public.whatsapp_conversations(lead_id) where lead_id is not null;

-- Trigger pra manter updated_at em sync
create or replace function public._wa_conv_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_wa_conv_updated_at on public.whatsapp_conversations;
create trigger trg_wa_conv_updated_at
  before update on public.whatsapp_conversations
  for each row execute function public._wa_conv_touch_updated_at();

comment on table public.whatsapp_conversations is
  'Estado de uma conversa do bot WhatsApp por JID. Persistido para sobreviver a restarts do sender.';
comment on column public.whatsapp_conversations.mode is
  'bot = responde automatico; human = bot calado, admins atendendo; awaiting_rating = bot aguardando nota 1-5';
comment on column public.whatsapp_conversations.subscriber_id is
  'ID do subscriber no banco do Sonnar (cross-DB, sem FK enforcement)';

-- ───────────────────────────────────────────────────────────────────────
-- RLS — apenas service_role (bot) acessa via API admin.
-- Usuarios autenticados do portal acessam atraves de funcoes RPC seguras.
-- ───────────────────────────────────────────────────────────────────────

alter table public.whatsapp_conversations enable row level security;

-- Service role tem acesso total (bot usa service_role pra ler/escrever)
drop policy if exists "service_role full access" on public.whatsapp_conversations;
create policy "service_role full access"
  on public.whatsapp_conversations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Admins do portal podem ler tudo (pra dashboard)
drop policy if exists "admins read all conversations" on public.whatsapp_conversations;
create policy "admins read all conversations"
  on public.whatsapp_conversations
  for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role in ('admin_super','admin','support')
    )
  );

-- ───────────────────────────────────────────────────────────────────────
-- View consolidada pro dashboard
-- ───────────────────────────────────────────────────────────────────────

drop view if exists public.whatsapp_active_tickets;
create or replace view public.whatsapp_active_tickets as
select
  c.jid,
  c.display_name,
  c.identified_as,
  c.mode,
  c.client_id,
  c.lead_id,
  c.subscriber_id,
  c.subscriber_plan,
  c.last_message_at,
  c.last_message_text,
  t.id as ticket_id,
  t.subject as ticket_subject,
  t.status as ticket_status,
  t.priority as ticket_priority,
  t.first_response_at,
  t.created_at as ticket_created_at,
  t.rating,
  t.rating_feedback,
  t.rated_at,
  t.resolved_at,
  cl.full_name as client_full_name,
  cl.email as client_email,
  l.name as lead_name
from public.whatsapp_conversations c
left join public.support_tickets t on t.id = c.active_ticket_id
left join public.clients cl on cl.id = c.client_id
left join public.leads l on l.id = c.lead_id
order by c.last_message_at desc;

comment on view public.whatsapp_active_tickets is
  'Dashboard view: conversas WhatsApp ativas + ticket associado + identificacao';

-- ───────────────────────────────────────────────────────────────────────
-- Funcao auxiliar: auto-encerramento de tickets sem atividade
-- (chamada por cron - sera implementado em PR futuro)
-- ───────────────────────────────────────────────────────────────────────

create or replace function public.auto_close_stale_whatsapp_tickets()
returns table (closed_count int) language plpgsql as $$
declare
  affected int := 0;
begin
  -- Tickets em 'awaiting_rating' ha mais de 24h: fecha sem rating
  with closed as (
    update public.support_tickets t
    set status = 'fechado', resolved_at = coalesce(t.resolved_at, now())
    from public.whatsapp_conversations c
    where c.active_ticket_id = t.id
      and c.mode = 'awaiting_rating'
      and c.updated_at < now() - interval '24 hours'
    returning t.id
  )
  select count(*) into affected from closed;

  -- Reset das conversas correspondentes (volta pro modo bot)
  update public.whatsapp_conversations
  set mode = 'bot', active_ticket_id = null, current_menu = 'root'
  where mode = 'awaiting_rating'
    and updated_at < now() - interval '24 hours';

  -- Tickets 'em_andamento' sem atividade ha 7 dias: encerra
  with stale as (
    update public.support_tickets t
    set status = 'fechado', resolved_at = coalesce(t.resolved_at, now())
    from public.whatsapp_conversations c
    where c.active_ticket_id = t.id
      and c.mode = 'human'
      and t.status in ('aberto','em_andamento')
      and c.last_message_at < now() - interval '7 days'
    returning t.id
  )
  select affected + count(*) into affected from stale;

  return query select affected;
end;
$$;

comment on function public.auto_close_stale_whatsapp_tickets is
  'Encerra automaticamente: (1) tickets awaiting_rating ha >24h, (2) tickets human sem atividade ha >7 dias';

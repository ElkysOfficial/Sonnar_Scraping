-- v3.10.24 — Permite ticket sem client_id (lead novo via WhatsApp)
--
-- Antes: support_tickets exigia client_id NOT NULL. Quando o cliente
-- entra em contato pelo WhatsApp e ainda nao tem registro em clients,
-- o ticket nao podia ser criado.
--
-- Agora: client_id eh opcional, mas tickets sem cliente PRECISAM ter
-- source='whatsapp' + whatsapp_jid preenchido (sanity check pra evitar
-- tickets orfaos via inserts manuais errados).

alter table public.support_tickets alter column client_id drop not null;

alter table public.support_tickets
  drop constraint if exists support_tickets_whatsapp_needs_jid;
alter table public.support_tickets
  add constraint support_tickets_whatsapp_needs_jid
  check (
    client_id is not null
    or (source = 'whatsapp' and whatsapp_jid is not null)
  );

comment on column public.support_tickets.client_id is
  'Cliente associado. NULL permitido apenas pra tickets WhatsApp de leads ainda nao convertidos.';

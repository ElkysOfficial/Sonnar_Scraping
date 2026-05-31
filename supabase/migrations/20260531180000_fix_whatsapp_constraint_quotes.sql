-- v3.10.29 — Corrige aspas duplas escapadas erradamente na constraint
-- 'support_tickets_whatsapp_needs_jid' (v3.10.24).
--
-- Bug: a constraint anterior estava comparando source = '"whatsapp"' (com
-- aspas DUPLAS dentro da string), por escape errado no SQL via CLI. Como
-- nenhum source eh literalmente '"whatsapp"', a condicao falhava sempre
-- e bloqueava insercao de tickets sem client_id.
--
-- Esta migration recria a constraint comparando contra 'whatsapp' direto.

alter table public.support_tickets
  drop constraint if exists support_tickets_whatsapp_needs_jid;

alter table public.support_tickets
  add constraint support_tickets_whatsapp_needs_jid
  check (
    client_id is not null
    or (source = 'whatsapp' and whatsapp_jid is not null)
  );

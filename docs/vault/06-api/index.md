---
title: API / Edge Functions
tags: [api, edge, moc]
---

# API / Edge Functions

⚠️ **Stub** - auditar via `supabase/functions/`.

## Serviços HTTP internos (não-Supabase)

| Serviço | Porta | Função | Nota |
|---------|-------|--------|------|
| `message-formatting-core` | 3100 | Intermedia acesso dos bots ao catálogo de vagas (jobs.json) | [[message-formatting-core]] |

## Edge Functions identificadas

| Função                    | Trigger                | Notas a criar              |
| ------------------------- | ---------------------- | -------------------------- |
| `create-checkout-session` | client (após signup)   | `edge-fn-create-checkout-session.md` |
| `stripe-webhook`          | Stripe (webhook)       | `edge-fn-stripe-webhook.md`           |
| `create-owner-account`    | manual (script/admin)  | `edge-fn-create-owner-account.md`     |

## Convenção

Cada função segue: **Contexto → Trigger → Input → Output → Side effects (DB writes, email) → Erros conhecidos → Referências**.

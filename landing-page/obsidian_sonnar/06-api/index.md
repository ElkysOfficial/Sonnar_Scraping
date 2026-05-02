---
title: API / Edge Functions
tags: [api, edge, moc]
---

# API / Edge Functions

⚠️ **Stub** — auditar via `supabase/functions/`.

## Edge Functions identificadas

| Função                    | Trigger                | Notas a criar              |
| ------------------------- | ---------------------- | -------------------------- |
| `create-checkout-session` | client (após signup)   | `edge-fn-create-checkout-session.md` |
| `stripe-webhook`          | Stripe (webhook)       | `edge-fn-stripe-webhook.md`           |
| `create-owner-account`    | manual (script/admin)  | `edge-fn-create-owner-account.md`     |

## Convenção

Cada função segue: **Contexto → Trigger → Input → Output → Side effects (DB writes, email) → Erros conhecidos → Referências**.

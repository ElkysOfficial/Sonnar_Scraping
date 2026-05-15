---
title: Backend
tags: [backend, moc]
---

# Backend

Referência cruzada com [[../06-api/index]].

## Notas

- [[scraper-persistence]] ✅ Persistência do scraper em 3 sinks (JSON / CSV / Supabase).
- [[engine-indeed]] ✅ Engine Indeed via listing JSON (mosaic-provider-jobcards) + enrichment opcional.

## Notas a criar

- `edge-functions-architecture.md` - runtime Deno, deploy via `supabase functions deploy`, secrets via `supabase secrets`.
- `triggers-architecture.md` - `handle_new_user` e outros triggers Postgres.
- `cron-jobs.md` - pg_cron se houver.

## Secrets esperados em produção

(De `.env.example`)

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PLUS`
- `RESEND_API_KEY`
- `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_FULL_NAME`
- `SUPABASE_SERVICE_ROLE_KEY` (auto-injected)
- `SUPABASE_URL` (auto-injected)

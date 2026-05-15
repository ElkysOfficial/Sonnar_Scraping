---
title: Banco de Dados
tags: [database, moc]
---

# Banco de Dados

⚠️ **Stub** - auditar via `supabase/migrations/` e `src/integrations/supabase/types.ts`.

## Notas a criar

- `erd.md` - diagrama de relacionamento entre `subscribers`, `user_roles`, `auth.users` (Supabase managed).
- `key-tables.md` - schema de cada tabela com defaults e constraints.
- `triggers.md` - `handle_new_user` (cria subscriber pós-signup) + outros.
- `rls-policies.md` - policies por tabela e por role. **Crítico** - RLS é a fronteira de segurança real.
- `enums.md` - `plan` (free/pro/plus), `status` (active/pending/past_due/canceled), `role`.

## Convenções

- Sempre incluir snippet SQL da policy quando documentar.
- Marcar com 🔴 qualquer tabela que dependa apenas de check do app, sem RLS.

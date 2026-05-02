---
title: Segurança
tags: [security, moc]
---

# Segurança

| Nota             | Status         |
| ---------------- | -------------- |
| [[auth-model]]   | ✅ documentado |
| `rls-model.md`   | ⚠️ stub — fronteira de segurança real, urgente |
| `csp.md`         | ⚠️ stub — política CSP em produção (verificar `_headers` ou meta tags) |
| `secrets-management.md` | ⚠️ stub — gestão de secrets em Supabase Edge |

## Cheatsheet rápido

- 🔴 **JWT vive em `localStorage`** — XSS é vetor real. Ver [[auth-model]].
- 🔴 **RLS é a verdade** — todo guard de rota é UX. Mudança em RLS exige PR review obrigatório.
- 🟠 **`OWNER_EMAIL` hardcoded** — vetor de privilégio.
- 🟠 **`?redirect=` sanitizado parcialmente** — pode evoluir.

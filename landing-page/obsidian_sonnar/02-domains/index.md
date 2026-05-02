---
title: Domínios de Negócio
tags: [domain, moc]
---

# Domínios de Negócio

⚠️ **Stub** — ainda não auditado em profundidade. Mapeamento inicial baseado em código/router:

| Domínio          | Tabela principal | Notas a criar               |
| ---------------- | ---------------- | --------------------------- |
| Subscribers      | `subscribers`    | `subscribers.md`            |
| Roles staff      | `user_roles`     | `roles.md`                  |
| Vagas            | ⚠️ Assumido     | `jobs.md`                   |
| Perfil de busca  | ⚠️ Assumido     | `search-profile.md`         |
| Planos           | enum `plan`      | `plans.md` (free/pro/plus)  |

## Convenção

Cada nota de domínio segue: **Contexto → Modelo (campos) → Invariantes → Estados/transições → RLS → Referências**.

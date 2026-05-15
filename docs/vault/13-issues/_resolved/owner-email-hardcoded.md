---
title: "OWNER_EMAIL hardcoded → variável de ambiente (resolvido)"
tags: [issue, security, auth]
severity: medium
status: resolved
release: v1.9.1
last-update: 2026-05-01
---

# OWNER_EMAIL hardcoded

## Contexto

Pré-v1.9.1 o e-mail de bootstrap do owner era hardcoded em `src/composables/useAuth.ts`:

```ts
const OWNER_EMAIL = 'lucelho.silva@elkys.com.br'
```

Quem alterasse essa string em um PR conseguia se promover a `owner` no client (apenas - o backend ainda valida via RLS), mas isso ainda permitia bypass das checagens de UI/UX (acesso a `/admin/*` sem ser staff de verdade).

Era um vetor de privilégio em **PR review**: facilmente passa em revisão como mudança de "configuração", e o impacto não é óbvio.

## Resolução (v1.9.1)

`src/composables/useAuth.ts`:

```ts
const OWNER_EMAIL = (import.meta.env.VITE_OWNER_EMAIL ?? '').trim().toLowerCase()
```

Com lógica de fallback explícita:

```ts
const isOwnerByEmail = OWNER_EMAIL !== '' && u.email?.toLowerCase() === OWNER_EMAIL
```

- `VITE_OWNER_EMAIL` adicionado em `.env.example`, `.env.production` e `.env.local`.
- Se a env estiver vazia, o bootstrap por e-mail fica desabilitado - owner precisa estar em `user_roles` como qualquer outro role.
- Mudar quem é owner agora exige acesso ao deploy/secrets, não só PR review.

## Limitações remanescentes

- **Vite injeta env vars no bundle** - `VITE_OWNER_EMAIL` é visível em `dist/assets/index-*.js`. Não é segredo. Quem ler o bundle sabe quem é o owner. **Aceitável** porque a defesa real está na RLS do Postgres + tabela `user_roles`.
- **Bootstrap de owner ainda é client-side** - se um atacante quiser, pode interceptar o JS e remover a checagem; mas isso só afeta a UI dele, não o backend.

## Plano (longo prazo)

Considerar eliminar o bootstrap por e-mail completamente quando o time tiver runbook validado de adicionar owner via SQL/Edge Function pós-reset de banco. Hoje é um trade-off de DX.

## Relações

- [[../../12-decisions/ADR-001-auth-hardening]]
- [[../../10-security/auth-model]]

## Referências

- `src/composables/useAuth.ts:25-26, 102-106`
- `.env.example`, `.env.production`

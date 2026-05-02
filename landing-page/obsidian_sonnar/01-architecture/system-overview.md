---
title: System Overview
tags: [architecture, overview, moc]
aliases: [Architecture, Visão Geral Arquitetural]
---

# System Overview

## Contexto

Sonnar é um **SaaS B2C de matching de vagas de tecnologia via WhatsApp**. Usuário cadastra preferências (stack, senioridade, modalidade), assina um plano (free / pro / plus), e recebe oportunidades curadas. A plataforma serve três audiências:

1. **Visitantes** (landing pública).
2. **Clientes** (`/dashboard` — vagas, assinatura, configurações de perfil de busca).
3. **Staff interno** (`/admin` — gestão de subscribers, criação de cliente manual, gestão de admins).

A escolha por **SPA Vue 3 + Supabase Cloud** privilegia _time-to-market_ e custo operacional baixo (~zero infra própria).

## Descrição Técnica

### Stack

| Camada       | Tecnologia                                     | Versão           |
| ------------ | ---------------------------------------------- | ---------------- |
| Frontend     | Vue 3 (Composition API) + TypeScript           | 3.5 / 5.8        |
| Bundler      | Vite                                           | 7.3              |
| Roteamento   | vue-router                                     | 4.6              |
| UI lib       | Ant Design Vue (parcial — componentes filtrados) | 4.2            |
| Forms        | zod                                            | 3.25             |
| Backend      | Supabase (Postgres 15 + Auth + Edge + Storage) | Cloud            |
| Edge runtime | Deno (Supabase Edge Functions)                 | —                |
| Pagamento    | Stripe                                         | —                |
| Email        | Resend                                         | —                |
| Hosting      | ⚠️ Assumido: deploy estático via GitHub Actions | ver [[../09-infra/index]] |
| Testing      | Vitest                                         | 3.2              |

### Topologia

```
┌──────────────────── Browser ────────────────────┐
│  Vue 3 SPA (bundle estático)                    │
│   ┌─────────┐  ┌──────────┐  ┌──────────────┐   │
│   │ Landing │  │ Dashboard│  │ Admin        │   │
│   │ pública │  │ cliente  │  │ portal       │   │
│   └─────────┘  └──────────┘  └──────────────┘   │
└────────────────────┬────────────────────────────┘
                     │ HTTPS + JWT (PKCE)
        ┌────────────▼─────────────┐
        │     Supabase Cloud       │
        │  Postgres (RLS) · Auth   │
        │  Edge Functions          │
        └────────┬──────────┬──────┘
                 │          │
              Stripe     Resend
              (webhook)  (email)
```

### Princípios fundadores

1. **Sessão hidratada antes do mount** — `bootAuth()` em `main.js` resolve antes de `app.mount()`. Elimina race condition no refresh. Ver [[../04-flows/auth-flow]].
2. **Guard global meta-driven** — uma única `router.beforeEach` lê `route.meta` (`requiresAuth`, `requiresAdmin`, `publicOnly`, etc.). Ver [[../07-frontend/routing]].
3. **Fonte única de verdade em `useAuth`** — singleton reativo (`session`, `userRole`, `subscriber`, `roleStatus`). Sem duplicação em store global.
4. **PKCE em todo fluxo OAuth** — `flowType: 'pkce'` + `detectSessionInUrl: true`. Ver [[../12-decisions/ADR-001-auth-hardening]].
5. **RLS é a verdade no banco** — guards de rota são UX. Segurança real está nas policies do Postgres. ⚠️ Assumido: cada tabela com policies por role.
6. **Português brasileiro** em todo conteúdo, labels e mensagens.

### Camadas

- **Pages** (`src/pages/`) — componentes de rota lazy-loaded.
- **Components** (`src/components/`) — incluindo `SessionNotice.vue` (toast de eventos de sessão), `AppHeader`, `AppFooter`, `CookieBanner`.
- **Composables** (`src/composables/`) — `useAuth.ts` (singleton), `useModalFocus.ts`.
- **Guards** (`src/guards/authGuard.ts`) — `globalAuthGuard` único.
- **Router** (`src/router/index.js`) — config + `router.beforeEach(globalAuthGuard)`.
- **Integrations** (`src/integrations/supabase/`) — cliente + tipos gerados.
- **Utils** (`src/utils/`) — validators puros.

### Build pipeline

`vite.config.ts` define `manualChunks`:

| Chunk           | Conteúdo                          |
| --------------- | --------------------------------- |
| `vue-vendor`    | vue + vue-router                  |
| `supabase`      | @supabase/supabase-js             |
| `antd-core`     | ant-design-vue                    |
| `date-utils`    | date-fns                          |
| `validation`    | zod                               |

Naming pattern: `assets/[name]-[hash].js`. Sourcemaps **off** em prod. Threshold de chunk size: 500 kB. Ver [[../11-performance/index]].

## Problemas Identificados

🟠 **`localStorage` para tokens é vulnerável a XSS** — qualquer script injetado lê o JWT. Mitigação atual: anon key + RLS no banco. Solução definitiva (HTTP-only cookies) exige BFF, fora do escopo SPA puro. Ver [[../13-issues/index]].

🟠 **`subscriber` row pode não existir em micro-janela pós-signup** — depende do trigger `handle_new_user`. Se usuário acessar rota protegida nesse intervalo, vê toast "no-role". ⚠️ Assumido: tem mitigação implícita pelo fluxo `/pagamento/confirmando`.

🟠 **Owner-by-email bootstrap** — `OWNER_EMAIL` hardcoded em `useAuth.ts` e `authGuard.ts`. Recuperação útil pós-reset, mas vetor de privilégio. Recomendado mover para `VITE_OWNER_EMAIL`.

🟢 **Toast `SessionNotice` com z-index 9999** — pode conflitar com modais Ant Design. Validar em `/admin`.

## Impacto

- Velocidade de iteração alta (deploy direto do `main`).
- Custo operacional baixo (Supabase + Stripe + hospedagem estática).
- **Mas** ausência de testes unitários e observabilidade torna cada release uma aposta — ver [[../13-issues/index]].

## Recomendações

1. Adicionar **observabilidade** (Sentry no browser + Edge Functions).
2. Cobrir camadas puras (`utils/`, `composables/`) com **Vitest**.
3. Mover `OWNER_EMAIL` para variável de ambiente.
4. Documentar runbook de incidente (Stripe webhook caído, RLS quebrada) em [[../09-infra/index]].

## Relações

- [[../04-flows/auth-flow]]
- [[../07-frontend/routing]]
- [[../10-security/auth-model]]
- [[../12-decisions/index]]

## Referências

- `src/main.js`
- `src/App.vue`
- `src/router/index.js`
- `vite.config.ts`
- `package.json`

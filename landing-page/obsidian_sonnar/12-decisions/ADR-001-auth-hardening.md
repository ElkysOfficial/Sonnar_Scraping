---
title: ADR-001 — Auth hardening (guard global meta-driven, intended route, inactivity timeout)
tags: [adr, security, auth]
status: accepted
release: v1.8.0
---

# ADR-001 — Auth hardening em v1.8.0

## Contexto

Pré-v1.8.0 o fluxo de auth tinha quatro problemas estruturais identificados em auditoria comparativa com o repo `ElkysOfficialWebSite`:

1. **Estado duplicado.** `useAuth` mantinha singletons reativos hidratados em `bootAuth()`, mas cada `beforeEnter` por rota chamava `supabase.auth.getSession()` + queries de role independentemente — race condition no refresh, com guard vendo `session = null` enquanto `useAuth` já tinha hidratado.
2. **Sem rota pretendida.** Anônimo acessando `/dashboard/configuracoes` ia para `/login` perdendo o destino; após login caía sempre no fallback `/dashboard`.
3. **`signOut()` defensivo derrubava sessão válida.** Se `subscriber` ainda não tinha carregado (race com trigger do banco), `access.role` era `null` e o guard chamava `signOut()` — usuário legítimo deslogado por race transitório.
4. **Sem catch-all.** URL inexistente renderizava vazio.

Adicionalmente, gaps de UX herdados do referencial:

5. **Sem inactivity timeout** — sessão durava o que durava o `expires_at` do JWT, sem aviso.
6. **Erros de role (transient vs permanente) tratados igual** — qualquer falha mandava para `/login?error=unauthorized`.

## Decisão

### 1. Guard global meta-driven

Substituir `beforeEnter` por rota por uma `router.beforeEach(globalAuthGuard)` única. Cada rota declara intenção via `route.meta`:

```js
{
  path: '/admin',
  component: AdminLayout,
  meta: { requiresAdmin: true },
  children: [ ... ]
}
```

Flags suportadas: `requiresAuth`, `requiresAdmin`, `requiresOwner`, `requiresPaymentPending`, `publicOnly`.

### 2. Intended route com `?redirect=`

`globalAuthGuard.loginRedirect()` preserva `to.fullPath` na query:

```ts
return { path: '/login', query: { redirect: to.fullPath } }
```

`LoginPage.redirectAfterLogin()` lê e aplica via `router.replace()`. Sanitização anti open-redirect: rejeita `//host` e paths não-absolutos.

### 3. `roleStatus` reativo + retry em `fetchUserRole`

Adicionado `roleStatus: Ref<'idle' | 'loading' | 'ready' | 'no-role' | 'transient-error'>`. `fetchUserRole` agora:
- Promise.all em `user_roles` + `subscribers` envolvidas em `withTimeout` (8s, depois retry 12s).
- `AbortError` tratado separadamente (sai sem retry — navegação SPA cancelou).
- Retorno tipado `{ ok: true } | { ok: false; reason }`.

Guard sob sessão válida sem role:
- `roleStatus = 'no-role'` → `dispatch('auth-no-access', { reason: 'no-role' })` + `next('/')`. **Não** derruba sessão.
- `roleStatus = 'transient-error'` → mesmo dispatch com reason `transient-error`. Sessão preservada.

### 4. Inactivity timeout (30 min + 2 min warning)

Em `useAuth`:

```ts
const INACTIVITY_MS = 30 * 60 * 1000
const WARNING_BEFORE_MS = 2 * 60 * 1000
const ACTIVITY_THROTTLE_MS = 2000
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
```

Timers só rodam quando há sessão. Throttle de 2s evita flood de resets. `session-expired` chama `supabase.auth.signOut()` automaticamente.

### 5. Eventos custom + `SessionNotice.vue`

Componente novo escuta `session-expiring`, `session-expired`, `auth-no-access` e mostra toast minimalista (Teleport + tokens do design system existentes). Dispensável; sem alteração visual em outros componentes.

### 6. Catch-all

```js
{ path: '/:pathMatch(.*)*', redirect: '/' }
```

## Alternativas consideradas

| Opção                                              | Por que não                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Manter `beforeEnter` por rota e duplicar await em `bootAuth()` | Solução paliativa. Race continuaria existindo em rotas que esquecessem o await.        |
| `state` em vue-router (em vez de query param)      | State não persiste através de redirect HTTP do OAuth. Query param sobrevive.                 |
| sessionStorage para guardar intended route         | Mais lugar para limpar; query param é stateless e auditável.                                 |
| Wrapper-per-route (estilo React `<ProtectedRoute>`) | Idiomático em React; em Vue Router o padrão é `meta` + `beforeEach` global, mais escalável. |
| `signOut()` em qualquer falha de role              | Causa o bug original — derruba usuário legítimo em race com trigger do banco.                |
| Sync ID para descartar fetches obsoletos (Elkys pattern) | Necessário lá porque hidratação roda em `useEffect` (pós-mount). `bootAuth()` antes do mount elimina o problema na origem. |

## Consequências

### Positivas

- **Refresh em rota protegida preserva o caminho.** Foi o bug-mãe que motivou a auditoria.
- **Adicionar nova rota protegida = 1 linha** (`meta: { requiresAuth: true }`). Sem novos guards.
- **Sessão válida + role ausente não derruba mais usuário.** UI mostra toast claro.
- **UX de inatividade conforme padrão de mercado** (30 min + warning).
- **Eventos custom** dão lugar de extensão — pode-se acoplar telemetria, analytics, banner sem tocar `useAuth`.

### Negativas / atenção

- **`SessionNotice` usa z-index 9999** — pode conflitar com modais do Ant Design Vue em `/admin`. Validar manualmente.
- **`localStorage` continua sendo o storage** — XSS é vetor real ainda (ver [[../10-security/auth-model]]).
- **`OWNER_EMAIL` continua hardcoded** — não escopo desta ADR; trackear como tech-debt.

## Mantido sem mudança

- Bootstrap por `OWNER_EMAIL` (recuperação pós-reset do banco).
- Trigger `handle_new_user` cria linha em `subscribers` (assumido — ver [[../05-database/index]]).
- Stripe webhook ativa subscriber em `subscription.created/updated` e `invoice.paid`.

## Relações

- [[../04-flows/auth-flow]]
- [[../07-frontend/routing]]
- [[../10-security/auth-model]]

## Referências

- Commit feature: `dea3b46 feat(auth): hardening de sessão com inactivity timeout, eventos custom e guard global meta-driven`
- Merge develop: `3de62ea`
- Merge main: `1af1c78`
- Tag: **v1.8.0**
- Arquivos:
  - `src/composables/useAuth.ts`
  - `src/guards/authGuard.ts`
  - `src/router/index.js`
  - `src/components/SessionNotice.vue`
  - `src/integrations/supabase/client.ts`
  - `src/pages/LoginPage.vue`
  - `src/App.vue`

---
title: Auth Flow
tags: [flow, auth, security]
aliases: [Login Flow, Authentication Flow]
---

# Auth Flow

## Contexto

Autenticação é o ponto de entrada do `/dashboard` (cliente) e `/admin` (staff). A papel (`role`) vem da combinação de duas tabelas (`user_roles` para staff, `subscribers` para clientes) — não vem do JWT — então o fluxo tem mais idas-e-voltas que um login JWT-only típico. A sessão é hidratada **antes do mount** pra eliminar race conditions no refresh.

## Descrição Técnica

### Sequência completa (a partir de v1.8.0)

```
┌─ Browser ───────────────────────────────────────────────────────┐
│ 1. main.js → bootAuth() ANTES de app.mount('#app')              │
│    bootPromise idempotente; cache em closure                    │
│ 2. supabase.auth.getSession() → tokens em localStorage          │
│    (PKCE; detectSessionInUrl=true para callback OAuth)          │
│ 3. onAuthStateChange listener registrado                        │
│ 4. Se sessão existir: fetchUserRole() (timeouts 8s → 12s)       │
│ 5. roleStatus = 'ready' | 'no-role' | 'transient-error'         │
│ 6. scheduleInactivityTimers (30 min + warning 28 min)           │
│ 7. app.mount('#app')                                            │
└─────────────────────┬────────────────────────────────────────────┘
                      ▼
┌──────────── router.beforeEach(globalAuthGuard) ─────────────────┐
│ 8. await bootAuth() (resolve imediato — já cached)              │
│ 9. Lê route.meta:                                               │
│    - requiresAuth, requiresAdmin, requiresOwner                 │
│    - requiresPaymentPending, publicOnly                         │
│ 10. Decide redirect baseado em singleton state                  │
│     - !session + protected → /login?redirect=<intended>         │
│     - session + role missing → next('/') + auth-no-access       │
│     - session + role valid → next() ou redirect por papel       │
└─────────────────────┬────────────────────────────────────────────┘
                      ▼
              Página renderiza
```

### Login bem-sucedido

```
1. /login → form submit
2. signInWithEmail(email, password)
3. supabase.auth.signInWithPassword
4. onAuthStateChange dispara → singleton atualiza
5. fetchUserRole() carrega role + subscriber
6. redirectAfterLogin():
   - se ?redirect= existir → router.replace(path) (sanitizado)
   - else owner/admin → /admin
   - else needsPayment → /pagar
   - else → /dashboard
```

### Roles e papéis

Sonnar tem **3 roles** efetivos:

| Role     | Origem                                                          |
| -------- | --------------------------------------------------------------- |
| `owner`  | `OWNER_EMAIL` hardcoded OU `user_roles.role = 'owner'`          |
| `admin`  | `user_roles.role = 'admin'`                                     |
| `client` | tem entrada em `subscribers`, não está em `user_roles` como staff |

⚠️ Assumido: `user_roles` só armazena `'owner'` e `'admin'`. Cliente não tem linha lá — o fato de ter `subscribers.user_id` faz dele cliente.

### Estado de role (v1.8.0)

`useAuth.roleStatus`:

| Status              | Significado                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| `idle`              | Sem sessão ou ainda não inicializado                                            |
| `loading`           | Querying `user_roles` + `subscribers`                                           |
| `ready`             | Role confirmado                                                                 |
| `no-role`           | Sessão válida mas usuário não está em nenhuma tabela (vetor de erro real)       |
| `transient-error`   | Falha de rede / timeout / abort (não derruba sessão)                            |

### Inactivity timeout

- `INACTIVITY_MS = 30 * 60 * 1000`
- `WARNING_BEFORE_MS = 2 * 60 * 1000` (aviso aos 28 min)
- Throttle: 2000ms
- Eventos: `mousemove`, `keydown`, `click`, `scroll`, `touchstart`
- Custom events emitidos:
  - `session-expiring` (com `detail.remainingMs`)
  - `session-expired` (auto-logout via `supabase.auth.signOut()`)
  - `auth-no-access` (com `detail.reason: 'no-role' | 'transient-error'`)
- Consumidos por `SessionNotice.vue` (toast).

### Intended route (`?redirect=`)

`globalAuthGuard.loginRedirect()` preserva `to.fullPath`:

```ts
const fullPath = to.fullPath
const safeRedirect = fullPath.startsWith('/') && !fullPath.startsWith('//')
  ? fullPath : '/'
return { path: '/login', query: { redirect: safeRedirect } }
```

`LoginPage.safeRedirect()` valida no momento do redirect pós-login:

```ts
if (!raw.startsWith('/') || raw.startsWith('//')) return null
```

Defesa contra open-redirect (`//evil.com`, `https://evil.com`).

### Cleanup em signOut / SIGNED_OUT / TOKEN_REFRESHED sem sessão

`useAuth` limpa: `session`, `user`, `userRole`, `subscriber`, `roleStatus = 'idle'`, e chama `clearInactivityTimers()`.

## Problemas Identificados

🟠 **Roles vêm do banco, não do JWT** — se `user_roles`/`subscribers` SELECT timeout em loop, `roleStatus` fica `transient-error` indefinidamente. Mitigação atual: retry [8s, 12s] e bypass por `OWNER_EMAIL`. Sem retry automático após segundo timeout.

🟠 **`subscriber` row pode estar ausente em janela pós-signup** — depende do trigger `handle_new_user`. ⚠️ Assumido: trigger é síncrono; se falhar, usuário recém-criado fica sem role.

🟠 **`isOwnerByEmail` bypass por hardcode** — `OWNER_EMAIL = 'lucelho.silva@elkys.com.br'` em duas constantes (`useAuth.ts:21`, `authGuard.ts` removido em v1.8.0 — só `useAuth` mantém). Recomendado migrar para `import.meta.env.VITE_OWNER_EMAIL`.

🟢 **Throttle de 2s em atividade** — pode perder cliques muito próximos; aceitável para reset de timeout de inatividade.

## Impacto

- Refresh em rota protegida não joga mais para landing nem para login (corrigido em v1.8.0).
- Falha transitória de rede preserva sessão; erro real (no-role) dispara toast claro.
- OAuth via Google ⚠️ Assumido: não está implementado no Sonnar (apenas email/password).

## Recomendações

1. Mover `OWNER_EMAIL` para variável de ambiente.
2. Considerar custom claims no JWT (`auth.users.app_metadata.role`) para reduzir round-trip.
3. Garantir que `SessionNotice` está sempre montado (atualmente em `App.vue` raiz — OK).
4. Adicionar teste E2E para os 12 cenários listados em [[../12-decisions/ADR-001-auth-hardening|ADR-001]].

## Relações

- [[../07-frontend/routing]]
- [[../10-security/auth-model]]
- [[../12-decisions/ADR-001-auth-hardening]]

## Referências

- `src/composables/useAuth.ts`
- `src/guards/authGuard.ts`
- `src/router/index.js`
- `src/components/SessionNotice.vue`
- `src/pages/LoginPage.vue`
- `src/integrations/supabase/client.ts`
- `src/main.js`

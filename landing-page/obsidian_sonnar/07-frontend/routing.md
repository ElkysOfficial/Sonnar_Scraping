---
title: Routing
tags: [frontend, router, auth]
aliases: [Roteamento, Vue Router]
---

# Routing

## Contexto

Vue Router 4 em modo `createWebHistory()`. Todas as páginas são lazy-loaded. A autorização é **meta-driven**: cada rota declara o que exige via `route.meta`, e um único `router.beforeEach(globalAuthGuard)` decide acesso. Esse padrão substitui (em v1.8.0) o anterior, em que cada rota tinha seu próprio `beforeEnter`.

## Descrição Técnica

### Arquivo

`src/router/index.js` — exporta `router` default já com guard registrado.

### Meta flags

| Flag                       | Onde aplica                              | Comportamento                                              |
| -------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `requiresAuth`             | `/dashboard/*`, `/change-password`       | Exige sessão; sem role → toast + `/`                       |
| `requiresAdmin`            | `/admin/*`                               | Exige `role ∈ {admin, owner}`                              |
| `requiresOwner`            | `/admin/admins`                          | Exige `role = owner`                                       |
| `requiresPaymentPending`   | `/pagar`                                 | Só entra cliente que precisa pagar (não staff, não free)  |
| `publicOnly`               | `/login`, `/cadastro/:plan?`             | Bloqueia se já autenticado; redireciona por papel          |

### Tabela de rotas

| Path                         | Componente                | Meta                       |
| ---------------------------- | ------------------------- | -------------------------- |
| `/`                          | `HomePage`                | —                          |
| `/login`                     | `LoginPage`               | `publicOnly`               |
| `/cadastro/:plan?`           | `SignupPage`              | `publicOnly`               |
| `/verificar-email`           | redirect → `/login`       | —                          |
| `/pagamento-sucesso`         | redirect → `/pagamento/confirmando` | —                |
| `/pagamento/confirmando`     | `PaymentConfirmingPage`   | —                          |
| `/change-password`           | `ChangePasswordPage`      | `requiresAuth`             |
| `/pagar`                     | `PaymentPendingPage`      | `requiresPaymentPending`   |
| `/dashboard`                 | `DashboardLayout`         | `requiresAuth`             |
| `/dashboard/vagas`           | `DashboardJobs` (child)   | `requiresAuth`             |
| `/dashboard/assinatura`      | `DashboardSubscription`   | `requiresAuth`             |
| `/dashboard/configuracoes`   | `DashboardSettings`       | `requiresAuth`             |
| `/admin`                     | `AdminLayout`             | `requiresAdmin`            |
| `/admin/subscribers`         | `AdminSubscribers`        | `requiresAdmin`            |
| `/admin/new-client`          | `AdminNewClient`          | `requiresAdmin`            |
| `/admin/admins`              | `AdminManageAdmins`       | `requiresAdmin + requiresOwner` |
| `/termos`, `/privacidade`, `/cookies` | páginas legais   | —                          |
| `/:pathMatch(.*)*`           | `NotFoundPage` (404 explícita) | catch-all              |

### Guard único

`src/guards/authGuard.ts → globalAuthGuard`:

```ts
export async function globalAuthGuard(to, _from, next) {
  await bootAuth()                              // idempotente
  const isAuth = !!session.value
  const role = userRole.value
  const meta = to.meta as { ... }

  if (meta.publicOnly && isAuth) {
    if (isStaff) return next('/admin')
    if (needsPayment()) return next('/pagar')
    if (role) return next('/dashboard')
    dispatchNoAccess(roleStatus.value === 'transient-error' ? ... : 'no-role')
    return next()
  }

  if (meta.requiresAuth || meta.requiresAdmin || ...) {
    if (!isAuth) return next(loginRedirect(to))   // ?redirect=<intended>
    if (!role) {
      dispatchNoAccess(...)
      return next('/')                            // não derruba sessão
    }
    // ... refinamentos por papel
  }

  return next()
}
```

### Scroll behavior

`scrollBehavior` no `createRouter`:
- Hash navigation → scroll suave SE elemento existir; senão topo (sem warning).
- `savedPosition` (back/forward) → preservada.
- Default → topo.

### Lazy loading

Todas as páginas são `() => import('...')`. Vite divide em chunks por arquivo.

## Problemas Identificados

🟢 **`requiresPaymentPending` não tem `requiresAuth`** — é implícito (o guard checa `!isAuth` cedo). Funciona, mas o nome da meta sugere ortogonalidade. Pode confundir leitor casual.

## Impacto

- Adicionar nova rota protegida = 1 linha (`meta: { requiresAuth: true }`). Sem novos `beforeEnter`.
- Refactor de regras de acesso = 1 arquivo (`globalAuthGuard`).

## Recomendações

1. Padronizar: rotas que exigem qualquer auth incluem `requiresAuth: true` _explicitamente_, mesmo quando combinado com `requiresAdmin`. Mais legível.
2. Considerar página 404 dedicada quando o produto crescer.

## Relações

- [[../04-flows/auth-flow]]
- [[../12-decisions/ADR-001-auth-hardening]]

## Referências

- `src/router/index.js`
- `src/guards/authGuard.ts`

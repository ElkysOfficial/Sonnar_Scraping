---
title: Auth Model
tags: [security, auth]
aliases: [Modelo de Autenticação]
---

# Auth Model

## Contexto

Modelo de autenticação Sonnar é **SPA + Supabase Auth** com **PKCE**, RBAC em duas tabelas (`user_roles` para staff, `subscribers` para clientes) e RLS no Postgres como fronteira de segurança real. Guards de rota são UX, não defesa.

## Descrição Técnica

### Configuração do Supabase Auth client

`src/integrations/supabase/client.ts`:

```ts
auth: {
  storage: localStorage,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  flowType: 'pkce'
}
```

| Opção                 | Por quê                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| `flowType: 'pkce'`    | OAuth2.1 obrigatório para SPA; sem secret no client                         |
| `detectSessionInUrl`  | Captura `?code=` em callback OAuth automaticamente                          |
| `persistSession`      | Token sobrevive a reload                                                    |
| `autoRefreshToken`    | SDK refresha access token antes de expirar                                  |
| `storage: localStorage` | Trade-off conhecido - XSS-vulnerável; ver issue                            |

### Camadas de defesa

| Camada              | O quê                              | Onde                                    |
| ------------------- | ---------------------------------- | --------------------------------------- |
| **PKCE**            | Sem token na URL                   | Supabase client                         |
| **Storage**         | localStorage                        | (XSS-vulnerável; ver issue)             |
| **Hidratação**      | `bootAuth()` antes do mount        | `main.js`                               |
| **Guard global**    | `globalAuthGuard` em `beforeEach`  | `src/guards/authGuard.ts`               |
| **Inactivity**      | 30 min + signOut auto              | `useAuth.ts`                            |
| **Anti open-redirect** | sanitização de `?redirect=`     | `authGuard.ts:loginRedirect`, `LoginPage.safeRedirect` |
| **RLS no banco**    | policies por role/owner            | ⚠️ Assumido: cada tabela com policies   |

### Eventos de auth (custom DOM events)

| Evento              | Detail                                    | Quem dispara                              | Quem escuta                |
| ------------------- | ----------------------------------------- | ----------------------------------------- | -------------------------- |
| `session-expiring`  | `{ remainingMs }`                         | `useAuth` (warning timer)                 | `SessionNotice.vue`        |
| `session-expired`   | -                                         | `useAuth` (expiry timer + signOut auto)   | `SessionNotice.vue`        |
| `auth-no-access`    | `{ reason: 'no-role' \| 'transient-error' }` | `useAuth.signInWithEmail`, `globalAuthGuard` | `SessionNotice.vue` |

### Sanitização de redirect

```ts
function safeRedirect(): string | null {
  const raw = route.query.redirect
  if (typeof raw !== 'string' || !raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}
```

Bloqueia: URLs absolutas, protocol-relative (`//evil.com`), strings vazias.

⚠️ **Não bloqueia explicitamente**: backslash injection (`/\evil.com`) e control chars. O Elkys (referência) usa `safeRedirectPath` mais paranoico - candidato a portar.

## Problemas Identificados

🔴→🟠 **`localStorage` armazena JWT** - superfície de XSS. **Mitigado em v1.9.0** com CSP estrita (sem `'unsafe-inline'` em script-src; whitelist de `connect-src`) + `Strict-Transport-Security`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`. Solução definitiva (BFF + cookies HttpOnly) deferida - ver [[../13-issues/jwt-localstorage-xss]] e [[../12-decisions/ADR-002-jwt-storage-csp-hardening]].

🟠 **`OWNER_EMAIL` hardcoded** - `'lucelho.silva@elkys.com.br'` em `useAuth.ts:21`. Quem mudar essa string vira owner. Recomendado: `import.meta.env.VITE_OWNER_EMAIL`.

🟠 **Sanitização de redirect menos paranoica que o referencial** - não cobre backslash injection nem control chars.

🟢 **Throttle de 2s nos eventos de atividade** - pode perder cliques rápidos consecutivos; aceitável.

## Impacto

- XSS em página com token = controle total da conta enquanto o token for válido (típico 1h, com refresh).
- Mudança em `OWNER_EMAIL` exige PR review obrigatório.

## Recomendações

1. **Criar `src/utils/safe-redirect.ts`** com validação completa (control chars, backslash). Reusar entre guard e LoginPage.
2. **Mover `OWNER_EMAIL` para env**.
3. **Documentar política CSP** em [[../09-infra/index]] quando audtoria de infra acontecer.
4. **Considerar BFF** (Edge Function de auth) em médio prazo se XSS virar preocupação real (depende de surface de injeção HTML/iframe).

## Relações

- [[../04-flows/auth-flow]]
- [[../07-frontend/routing]]
- [[../12-decisions/ADR-001-auth-hardening]]
- [[../13-issues/index]]

## Referências

- `src/integrations/supabase/client.ts`
- `src/composables/useAuth.ts`
- `src/guards/authGuard.ts`
- `src/pages/LoginPage.vue`

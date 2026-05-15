---
title: "Sanitização de ?redirect= menos paranoica (resolvido)"
tags: [issue, security, auth]
severity: medium
status: resolved
release: v1.9.1
last-update: 2026-05-01
---

# Sanitização de `?redirect=` menos paranoica que referencial

## Contexto

Pré-v1.9.1 a validação do query param `?redirect=` (intended route) cobria:

- ✅ Rejeita strings não-string
- ✅ Rejeita string vazia
- ✅ Exige `startsWith('/')`
- ✅ Rejeita `//host` (protocol-relative)

Lacunas em relação ao padrão paranoico do referencial Elkys (`safeRedirectPath`):

- ❌ **Backslash injection** - `/\evil.com` é normalizado para `//evil.com` por alguns browsers legados.
- ❌ **Control characters** - CR/LF/TAB/NUL no path podem driblar parsers permissivos e abrir log injection.
- ❌ **Whitespace no início** - alguns parsers trimam antes da validação, bypassando o `startsWith('/')`.

Lógica espalhada em 2 lugares:
- `src/guards/authGuard.ts:loginRedirect`
- `src/pages/LoginPage.vue:safeRedirect`

## Resolução (v1.9.1)

Helper centralizado em `src/utils/safeRedirect.ts`:

```ts
export function safeRedirect(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  if (raw[0] !== '/') return null            // exige '/' literal (sem ws)
  if (raw.startsWith('//')) return null      // protocol-relative
  if (raw.includes('\\')) return null        // backslash injection
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    if (c < 0x20 || c === 0x7f) return null  // control chars + DEL
  }
  return raw
}
```

Cobertura de **37 testes Vitest** em `src/utils/safeRedirect.test.ts`:
- Aceita paths internos com query/fragment.
- Rejeita schemes (`javascript:`, `data:`, `mailto:`, etc.).
- Rejeita `//host`, `////triple`.
- Rejeita backslash em qualquer posição.
- Rejeita CR/LF/TAB/NUL/DEL.
- Rejeita whitespace no início.
- Rejeita tipos não-string (`null`, `undefined`, número, boolean, objeto, array).

`authGuard.ts:loginRedirect` e `LoginPage.vue:redirectAfterLogin` consomem o helper.

## Relações

- [[../../10-security/auth-model]]
- [[../../12-decisions/ADR-001-auth-hardening]]

## Referências

- `src/utils/safeRedirect.ts`
- `src/utils/safeRedirect.test.ts`
- `src/guards/authGuard.ts`
- `src/pages/LoginPage.vue`

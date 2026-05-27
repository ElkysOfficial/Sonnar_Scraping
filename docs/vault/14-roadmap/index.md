---
title: Roadmap
tags: [roadmap, moc]
---

# Roadmap

⚠️ **Stub** - popular conforme alinhamento de produto.

## Curto prazo (próximas 1–2 sprints)

- [ ] 🎯 **Reduzir vCPU pico de 73% → 50% e reduzir RAM** ([[../12-decisions/ADR-006-vps-load-reduction-target]] + [[../13-issues/vps-cpu-peak-reduction]]). Roteiro encadeado: PR1 Canvas → PR2 Scraper → PR3 Core. Estratégias completas em [[../11-performance/vcpu-ram-reduction-strategies]].
- [ ] Estender tradução inline às engines não-PT ([[../12-decisions/ADR-007-translation-inline-policy]] + [[../13-issues/untranslated-jobs-gap]]).
- [ ] ⏸️ Aguardando bloqueador acima: feature Plus [[../03-features/plus-match-breakdown-cv]] (match breakdown + CV).
- [x] Migrar `OWNER_EMAIL` para `VITE_OWNER_EMAIL` (v1.9.1 - [[../13-issues/_resolved/owner-email-hardcoded]])
- [x] Criar helper de sanitização completa (control chars, backslash) (v1.9.1 - `src/utils/safeRedirect.ts` + 37 testes - [[../13-issues/_resolved/redirect-sanitization]])
- [x] Validar `SessionNotice` z-index em modais do `/admin` (v1.9.2 - token `--z-toast: 1100` - [[../13-issues/_resolved/session-notice-zindex]])
- [~] Cobertura Vitest de `src/utils/` e `src/composables/` - parcial em v1.9.3 (`globalAuthGuard` 27, `humanizeAuthError` 19, `safeRedirect` 37). Falta `useAuth` e composables UI.

## Médio prazo

- [ ] ⏸️ Observabilidade (Sentry/PostHog) - deferido. Reavaliar quando: (a) houver bug não reproduzível em prod, (b) escala paga ≥ N usuários, (c) auditoria externa exigir. Decisão atual: NÃO atacar.
- [ ] E2E Playwright dos 12 cenários de auth (ver [[../12-decisions/ADR-001-auth-hardening]])
- [ ] Cobertura Vitest do restante de `useAuth.ts`: `fetchUserRole` (mock supabase chain), `bootAuth` idempotência, inactivity timer (`vi.useFakeTimers`)
- [ ] Limpeza automática de tokens de projetos antigos no `bootAuth`

## Longo prazo

- [ ] Avaliar BFF / Edge Function de auth para mover sessão para cookies HttpOnly (mitigaria 🔴 [[../13-issues/jwt-localstorage-xss]] na origem)
- [ ] Custom claims no JWT (`auth.users.app_metadata.role`) - eliminar round-trip de role

## Convenção

Quando um item virar work concreto, abra ADR em `12-decisions/` ou issue em `13-issues/`.

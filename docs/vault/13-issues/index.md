---
title: Issues / Débito Técnico
tags: [issue, moc]
---

# Issues / Débito Técnico

## Abertos

| Severidade | Título                                                | Status     |
| ---------- | ----------------------------------------------------- | ---------- |
| 🔴 HIGH    | [[jwt-localstorage-xss\|JWT em localStorage]] (XSS surface) | mitigado em v1.9.0 ([[../12-decisions/ADR-002-jwt-storage-csp-hardening\|ADR-002]]) - defesa em profundidade; nota mantida pra rastrear avanços (cookies HttpOnly via BFF) |
| 🟠 MEDIUM  | Cobertura unitária de auth ausente (parcial)          | parcial em v1.9.3 (`globalAuthGuard` 27 testes, `humanizeAuthError` 19 testes) - falta `useAuth` (timer, `fetchUserRole`, `bootAuth`) e composables UI |
| 🟠 MEDIUM  | Sem observabilidade em produção (Sentry/PostHog)      | ⏸️ deferido - sem decisão (não está sendo trabalhado) |
| 🔴 HIGH    | [[vps-cpu-peak-reduction\|Redução de vCPU pico (73% → 50%)]] | aberto - roteiro de PRs traçado, decisão PR1 pendente ([[../12-decisions/ADR-006-vps-load-reduction-target\|ADR-006]]) |
| 🟠 MEDIUM  | [[untranslated-jobs-gap\|Vagas em EN/ES sem tradução acumulando no banco]] | aberto - política definida em [[../12-decisions/ADR-007-translation-inline-policy\|ADR-007]]; gap retroativo pendente |

## Resolvidos

| Severidade | Título                                                                       | Release |
| ---------- | ---------------------------------------------------------------------------- | ------- |
| 🟠 MEDIUM  | [[_resolved/owner-email-hardcoded\|`OWNER_EMAIL` hardcoded → env var]]       | v1.9.1  |
| 🟠 MEDIUM  | [[_resolved/redirect-sanitization\|Sanitização `?redirect=` (helper + 37 testes)]] | v1.9.1  |
| 🟠 MEDIUM  | [[_resolved/subscriber-row-post-signup-race\|`subscriber` row pós-signup]] (not-an-issue: trigger síncrono na transação) | - |
| 🟢 LOW     | [[_resolved/session-notice-zindex\|`SessionNotice` z-index via token `--z-toast`]] | v1.9.2  |
| 🟢 LOW     | [[_resolved/catchall-silent-redirect\|Catch-all → `NotFoundPage` explícita]] | v1.9.2  |

## Convenção

Cada issue vira uma nota `slug.md` com:

- **Frontmatter:** `tags: [issue]`, `severity: high|medium|low`, `status: open|in-progress|resolved|accepted|not-an-issue`.
- **Estrutura:** Contexto → Reprodução → Impacto → Mitigação atual → Plano → Referências.
- Issues resolvidas: mover para `13-issues/_resolved/` e atualizar status.

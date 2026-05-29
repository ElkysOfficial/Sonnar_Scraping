---
title: Roadmap
tags: [roadmap, moc]
---

# Roadmap

## Em produção (releases recentes)

- [x] **v3.6.0** — Vagas em texto puro + 16 alavancas de redução vCPU/RAM + pipeline PT-only obrigatório. [[../12-decisions/ADR-008-text-only-delivery]], [[../12-decisions/ADR-006-vps-load-reduction-target]]
- [x] **v3.6.1** — Conformidade AdSense (ads.txt + meta + robots + sitemap)
- [x] **v3.7.0** — Plus #1: [[../03-features/plus-stack-compatibility|✓/✗ stacks compatíveis na DM]]
- [x] **v3.7.1** — [[../03-features/free-to-plus-upsell|Upsell automático Free → Plus]] (email + WhatsApp semanal)
- [x] **v3.8.0** — Plus #4: [[../03-features/plus-resume-upload|Upload de currículo + parse determinístico]]
- [x] **v3.8.1** — Plus #5: [[../03-features/plus-resume-match-breakdown|Match breakdown estruturado (CV vs vaga)]]

## Curto prazo — concluir roadmap Plus (12 funcionalidades)

Ordem priorizada (ver [[../12-decisions/ADR-010-plans-differentiation-strategy]]):

- [ ] **Plus #11 + #12** — Consultoria LinkedIn + Templates de contato (conteúdo estático, alto valor percebido, baixo esforço)
- [ ] **Plus #6** — Histórico de candidaturas + lembrete 7d
- [ ] **Plus #7** — Estatísticas pessoais detalhadas
- [ ] **Plus #10** — Sugestões de melhoria do CV (determinístico, sem LLM — [[../12-decisions/ADR-009-zero-llm-policy]])
- [ ] **Plus #8** — Alertas em tempo real (match alto)
- [ ] **Plus #9** — Filtros avançados no dashboard

## Médio prazo — diferenciar Pro e Free

Após terminar Plus, voltar atenção:

- [ ] Pro: grupo filtrado por estado + work_model
- [ ] Pro: dashboard de vagas no portal
- [ ] Pro: newsletter semanal top 10
- [ ] Pro: sistema de indicação
- [ ] Free: página `/vagas` indexável (SEO)
- [ ] Free: newsletter top 5

## Tracker permanente (não-feature)

- [~] Cobertura Vitest de `src/utils/` e `src/composables/` — parcial em v1.9.3 (`globalAuthGuard` 27, `humanizeAuthError` 19, `safeRedirect` 37). Falta `useAuth` e composables UI
- [ ] Medir vCPU pico real pós v3.6.0 com `pm2 monit` 24h e atualizar [[../13-issues/_resolved/vps-cpu-peak-reduction|issue]]

## Longo prazo / parking lot

- [ ] ⏸️ Observabilidade (Sentry/PostHog) — deferido
- [ ] E2E Playwright dos 12 cenários de auth
- [ ] BFF/Edge Function de auth para cookies HttpOnly (mitiga 🔴 [[../13-issues/jwt-localstorage-xss]])
- [ ] Custom claims no JWT (eliminar round-trip de role)
- [ ] Cobertura Vitest `useAuth` completa
- [ ] Limpeza automática de tokens de projetos antigos no `bootAuth`

## Convenção

Quando um item virar work concreto, abra ADR em `12-decisions/` ou issue em `13-issues/`. Itens [~] são parciais; [x] são feitos; [ ] são pendentes.

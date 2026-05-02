---
title: Infraestrutura
tags: [infra, moc]
---

# Infraestrutura

⚠️ **Stub** — auditar `.github/workflows/` e configuração de hosting.

## Workflows GitHub Actions identificados

| Workflow         | Arquivo                              | Função                  |
| ---------------- | ------------------------------------ | ----------------------- |
| CI               | `.github/workflows/ci.yml`           | Build + lint + tests    |
| Bundle analysis  | `.github/workflows/bundle-analysis.yml` | Análise de bundle    |
| Security         | `.github/workflows/security.yml`     | ⚠️ Assumido: audit deps |

## Notas a criar

- `deployment.md` — destino, gatilho, processo de rollback.
- `github-actions.md` — detalhamento de cada workflow.
- `runbook.md` — procedimentos de incidente (Stripe webhook caído, RLS quebrada, hospedagem fora).
- `environments.md` — local, staging (se houver), produção.

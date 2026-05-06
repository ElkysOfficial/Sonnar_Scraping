---
title: ADRs — Decisões Arquiteturais
tags: [adr, decisions, moc]
---

# ADRs — Decisões Arquiteturais

Padrão: cada ADR contém **Contexto → Decisão → Alternativas → Consequências**.

| ID                                              | Título                                                                  | Status   | Release                |
| ------------------------------------------------ | ----------------------------------------------------------------------- | -------- | ---------------------- |
| [[ADR-001-auth-hardening]]                       | Auth hardening (guard global meta-driven, intended route, inactivity)   | Aceito   | v1.8.0                 |
| [[ADR-002-jwt-storage-csp-hardening]]            | JWT em localStorage com CSP estrita (defesa em profundidade)            | Aceito   | v1.9.0                 |
| [[ADR-003-indeed-listing-json-extraction]]       | Indeed engine via listing JSON (substitui detail-fetch por vaga)        | Aceito   | data_collection v2026.05 |

## Como adicionar um ADR novo

1. Copie a estrutura de `ADR-001-auth-hardening.md`.
2. Numere sequencialmente: `ADR-NNN-slug.md`.
3. Adicione frontmatter com `status: accepted | superseded | deprecated` e `release: vX.Y.Z`.
4. Atualize esta tabela.
5. Linke ADRs relacionados em **Relações**.
6. Em caso de superseded: deixe o ADR antigo no lugar com `status: superseded by ADR-XXX`.

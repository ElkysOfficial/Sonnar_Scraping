---
title: data_collection — Second Brain
tags: [index, moc, brain]
aliases: [Brain, Index, MOC]
---

# 🧠 data_collection (scraper) — Brain

> Microserviço Python que coleta vagas de 17+ engines (LinkedIn, Indeed, Gupy, etc.),
> persiste em JSON local + CSV + Supabase, com rate-limit, retry, circuit breaker,
> checkpoint persistente e DLQ.

Fonte de verdade: `D:\Pessoal\Sonar\data_collection\src\`.

---

## 🗺️ Mapa

| Pasta              | Conteúdo                                                       |
| ------------------ | -------------------------------------------------------------- |
| `01-architecture/` | Arquitetura geral, fluxo controller → engine → repository      |
| `02-domains/`      | Engines disponíveis e suas particularidades                    |
| `03-features/`     | Checkpoint persistente, DLQ, reenrichment, idempotência        |
| `04-flows/`        | Operações: como rodar, refetch_one, batch, dev loop            |
| `05-database/`     | Tabelas em Supabase: jobs, extraction_jobs, extraction_dlq     |
| `06-api/`          | Não aplicável (sem API HTTP — escreve direto via PostgREST)    |
| `07-frontend/`     | Não aplicável                                                  |
| `08-backend/`      | Estrutura Python, persistência, controllers                    |
| `09-infra/`        | Configuração, variáveis de ambiente, agendamento               |
| `10-security/`     | Rate-limit por domínio, retry/backoff, circuit breaker         |
| `11-performance/`  | Observabilidade: métricas, eventos, dashboards                 |
| `12-decisions/`    | ADRs (decisões arquiteturais)                                  |
| `13-issues/`       | Bugs conhecidos / débito técnico                               |
| `14-roadmap/`      | Próximas ondas (novas engines, refinos)                        |
| `15-glossary/`     | Termos do domínio                                              |

---

## ⚡ Atalhos

- 🎯 **Onboarding novo dev:** [[../01-architecture/index]] → [[../02-domains/engines]] → [[../04-flows/operations]]
- 🛡️ **Rate-limit / resiliência:** [[../10-security/rate-limit-and-resilience]]
- 📊 **Observabilidade:** [[../11-performance/observability]]
- 🪣 **DLQ / checkpoint:** [[../03-features/checkpoint-and-dlq]]
- 📚 **Glossário:** [[../15-glossary/index]]

---

## Convenções

- **Wikilinks** `[[...]]` para navegar entre notas.
- **Frontmatter** com `tags` para filtrar.
- ADRs em `12-decisions/ADR-NNN-slug.md`, listados em `12-decisions/index.md`.
- Issues em `13-issues/`, resolvidos movem para `13-issues/_resolved/`.
- Sempre cite `arquivo.py:linha` ao referenciar código.

---

## Microserviços relacionados (vaults irmãos)

- [[../../../landing-page/obsidian_sonnar/00-index/brain]] — frontend Vue + Supabase
- [[../../../message_formatting/obsidian_sonnar/00-index/brain]] — formatação para Discord/WhatsApp
- [[../../../message_sending/obsidian_sonnar/00-index/brain]] — envio efetivo das mensagens

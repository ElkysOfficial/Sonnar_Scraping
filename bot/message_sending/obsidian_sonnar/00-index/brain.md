---
title: message_sending — Second Brain
tags: [index, moc, brain]
aliases: [Brain, Index, MOC]
---

# 🧠 message_sending — Brain

> Microserviço responsável por **enviar** as mensagens já formatadas aos canais
> (WhatsApp, Discord). Cuida de filas de envio, taxa de envio, controle de quem
> recebe (VIP vs grupo), histórico e dedup.

Fonte de verdade: `D:\Pessoal\Sonar\message_sending\`.

Subprojetos atuais:
- `whatsapp/` — bot WhatsApp completo (services, commands, database)
- `discord/` — bot Discord

---

## 🗺️ Mapa

| Pasta              | Conteúdo                                                          |
| ------------------ | ----------------------------------------------------------------- |
| `01-architecture/` | Posição no pipeline: format → send. Conexão com bots externos.    |
| `02-domains/`      | Audiências: VIPs, grupos públicos. Comandos administrativos.      |
| `03-features/`     | Cache de jobs já enviados, encurtamento, comandos `/limpar` etc.  |
| `04-flows/`        | Fluxo de envio, retry de falhas, gatilho por novas vagas          |
| `05-database/`     | Tabelas próprias (subscribers, delivery_history, scraper_stats).  |
| `06-api/`          | Webhooks de bots, comandos slash                                  |
| `07-frontend/`     | N/A                                                               |
| `08-backend/`      | Estrutura Node, services/commands/database                        |
| `09-infra/`        | Tokens (Discord/WhatsApp), variáveis, processos persistentes      |
| `10-security/`     | Validação de comandos admin, anti-spam                            |
| `11-performance/`  | Throttling de envios para não derrubar grupos                     |
| `12-decisions/`    | ADRs                                                              |
| `13-issues/`       | Bugs / débito                                                     |
| `14-roadmap/`      | Próximos canais, novos comandos                                   |
| `15-glossary/`     | Termos (VIP, grupo, jobsCache, etc.)                              |

---

## ⚡ Atalhos

- 🎯 **Onboarding:** [[../01-architecture/index]] → [[../04-flows/index]]
- 🔌 **Integração com message_formatting:** consome o output formatado.
- 📚 **Cache & dedup:** [[../03-features/index]] (`vipJobsCache`, `groupJobsCache`).
- 🛠️ **Comandos admin:** ver `whatsapp/src/commands/admin/`.

---

## Microserviços relacionados

- [[../../../data_collection/obsidian_sonnar/00-index/brain]] — origem dos dados.
- [[../../../message_formatting/obsidian_sonnar/00-index/brain]] — formata antes do envio.
- [[../../../landing-page/obsidian_sonnar/00-index/brain]] — UI / admin do produto.

---
title: message_formatting — Second Brain
tags: [index, moc, brain]
aliases: [Brain, Index, MOC]
---

# 🧠 message_formatting — Brain

> Microserviço responsável por **formatar** as vagas (vindas do `data_collection`)
> antes de serem entregues aos canais (Discord, WhatsApp).
> Não envia — apenas constrói o conteúdo final (embeds, cards, mensagens texto).

Fonte de verdade: `D:\Pessoal\Sonar\message_formatting\`.

Subprojetos atuais:
- `core/` — código compartilhado de formatação
- `discord/` — embeds e templates específicos do Discord
- `whatsapp/` — formatação para mensagens WhatsApp (incluindo encurtamento de URL)

---

## 🗺️ Mapa

| Pasta              | Conteúdo                                                         |
| ------------------ | ---------------------------------------------------------------- |
| `01-architecture/` | Como o serviço se encaixa no pipeline (collection → format → send) |
| `02-domains/`      | Tipos de mensagem por canal: embed Discord, mensagem WhatsApp    |
| `03-features/`     | Encurtamento de URL, templates, lógica VIP vs pública            |
| `04-flows/`        | Pipeline de formatação: input → template → output                |
| `05-database/`     | Persistência (se houver) — atualmente baseada em arquivos JSON   |
| `06-api/`          | Rotas internas para solicitar formatação                         |
| `07-frontend/`     | N/A                                                              |
| `08-backend/`      | Estrutura Node/TS                                                |
| `09-infra/`        | Variáveis, deploy, dependências                                  |
| `10-security/`     | Sanitização de conteúdo, escape de markdown                      |
| `11-performance/`  | Cache de templates compilados                                    |
| `12-decisions/`    | ADRs                                                             |
| `13-issues/`       | Bugs / débito                                                    |
| `14-roadmap/`      | Próximos canais, novos templates                                 |
| `15-glossary/`     | Termos                                                           |

---

## ⚡ Atalhos

- 🎯 **Onboarding:** [[../01-architecture/index]] → [[../02-domains/index]]
- 🔌 **Integração com data_collection:** consome JSON gerado por `data_collection/src/data/jobs.json`.
- 📤 **Próximo passo no pipeline:** [[../../../message_sending/obsidian_sonnar/00-index/brain]]

---

## Microserviços relacionados

- [[../../../data_collection/obsidian_sonnar/00-index/brain]] — produz as vagas brutas.
- [[../../../message_sending/obsidian_sonnar/00-index/brain]] — consome o que esse serviço gera.
- [[../../../landing-page/obsidian_sonnar/00-index/brain]] — UI / admin do produto.

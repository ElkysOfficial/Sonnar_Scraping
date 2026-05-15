---
title: message-formatting-core (HTTP, porta 3100)
tags: [api, service, core, bots]
---

# message-formatting-core

API HTTP interna que **intermedia o acesso dos bots** (Discord, WhatsApp, futuramente Telegram) ao catálogo de vagas. Não é Edge Function Supabase — é um Express rodando localmente/em VPS.

## Contexto

Source-of-truth: `apps/scraper/src/data/jobs.json` (dict por `job_url`), mantido pelo [[../08-backend/scraper-persistence|LocalJobStore]] do scraper Python. Migração documentada em [[../12-decisions/ADR-005-message-formatting-core-jobs-json]].

Path canônico definido em `packages/message-formatting-core/src/server.js:16-19`. Override por env `JOBS_JSON_PATH`.

## Descrição Técnica

### Endpoints

| Método | Path | Função |
|--------|------|--------|
| `GET`  | `/health` | Status + path do `jobs.json` + se existe |
| `GET`  | `/jobs` | Lista todas as vagas (ordenadas por `created_at` desc) |
| `GET`  | `/jobs/pending?channel=<discord\|whatsapp\|telegram>` | Vagas ainda não enviadas no canal |
| `GET`  | `/jobs/check-url?url=<job_url>` | Existe vaga com essa URL? |
| `GET`  | `/jobs/:id` | Busca por id (md5 da URL) |
| `GET`  | `/stats` | Contagens (total, pending por canal, sent por canal, bySource) |
| `POST` | `/jobs` | Upsert por `job_url` |
| `PUT`  | `/jobs/status` | Marca `statuses.{channel} = true/false` (mexe em `sent_to[]`) |
| `DELETE` | `/jobs/:id` | Remove a vaga do dict |

### Shape da resposta

API serve sempre o shape "bots-friendly":

```json
{
  "id": "md5(job_url)",
  "job_title": "...",
  "job_url": "...",
  "company": "...",
  "location": "...",
  "work_type": "...",
  "hiring_regime": "...",
  "salary": "...",
  "publication_date": "YYYY-MM-DD",
  "source": "...",
  "skills": ["Python", "AWS"],
  "description": "...",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "statuses": { "discord": false, "whatsapp": true, "telegram": false }
}
```

### Tradução de schema na fronteira

O `jobs.json` físico usa `sent_to: ["discord", ...]` (array). A API responde com `statuses: { discord: bool, ... }` (objeto). Conversão em `entryToApiJob` / `buildIncoming` no `server.js`.

### IDs determinísticos

`id = md5(job_url).hex`. Estável entre execuções, sem precisar persistir UUID. Quem chama `PUT /jobs/status` usa esse id; o core localiza a entrada pelo url derivado.

## Problemas Identificados

- **Sem RLS**: qualquer processo na máquina lê/escreve o arquivo. Aceitável para dev/teste; em produção precisa ser revisitado.
- **Race condition cross-process**: scraper Python (LocalJobStore) e core Node podem escrever simultaneamente. Mitigação atual: scraper escreve em batches de 5s; core escreve raramente. **Não há lock cross-process** — ver follow-up no ADR-005.
- **Skills via API**: ainda não há schema validation em runtime. Se vier malformado (ex: número), `normalizeSkills` defensivamente filtra entradas vazias.

## Impacto

- **Consumidores**: `apps/discord/sender`, `apps/discord/formatter`, `apps/whatsapp/sender` (6 funções de jobs), `apps/whatsapp/formatter`.
- **Não-consumidores (continuam em Supabase)**: `apps/web`, `apps/whatsapp/sender` (VIP/group_features/auto_responders/sender_state).

## Recomendações

- Para rodar localmente: `cd packages/message-formatting-core && npm start`. Sem `.env` o default aponta para `apps/scraper/src/data/jobs.json`.
- Para testar com fixture: `JOBS_JSON_PATH=/path/to/fixture.json npm start`.
- Sempre verificar `GET /health` antes de subir bots (ele retorna `jobsExists: bool`).

## Relações

- [[../12-decisions/ADR-005-message-formatting-core-jobs-json]] — decisão e alternativas.
- [[../08-backend/scraper-persistence]] — origem do `jobs.json`.
- [[index]] — MOC de APIs.

## Referências

- `packages/message-formatting-core/src/server.js:1`
- `packages/message-formatting-core/package.json:1`
- `packages/message-formatting-core/.env.example:1`
- Commit `a60e139` (corte do Supabase)
- Commit `363bf5b` (skills/description)

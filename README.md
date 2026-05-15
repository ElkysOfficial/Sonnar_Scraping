# Sonnar Scraping

Monorepo do Sonnar — agregador de vagas de tecnologia que coleta, normaliza, persiste e distribui ofertas para **Discord**, **WhatsApp** e o **frontend web público + dashboard**.

## Arquitetura em uma figura

```
                      ┌───────────────────────────────────┐
                      │ apps/scraper (Python)             │
                      │ engines → JobsRepository → 3 sinks│
                      └──────────┬─────────┬──────────────┘
                                 │         │
                  jobs.json (local)        Supabase (public.jobs)
                                 │         │
              ┌──────────────────┴──┐      └───────────┐
              ▼                                        ▼
   packages/message-formatting-core            apps/web (Vue 3 + Vite)
   (HTTP API, porta 3100)                      landing + dashboard + admin
        │
        ├─ apps/discord/sender ◀── apps/discord/formatter
        └─ apps/whatsapp/sender ◀── apps/whatsapp/formatter
```

- **Scraper** escreve em três sinks independentes: `jobs.json` (local, dict por URL), `job.csv` (append-only) e `public.jobs` no Supabase.
- **Bots** consomem **só** o `jobs.json` via API HTTP do `message-formatting-core` (porta 3100). Não tocam Supabase para vagas.
- **Frontend web** lê agregados do Supabase via RPCs com `SECURITY DEFINER`.

Decisões arquiteturais relevantes:
- [ADR-004 — Reestruturação para monorepo](docs/vault/12-decisions/ADR-004-monorepo-restructure.md)
- [ADR-005 — Core via jobs.json](docs/vault/12-decisions/ADR-005-message-formatting-core-jobs-json.md)

## Layout do repositório

```
sonnar-scraping/
├── apps/                            Aplicações executáveis
│   ├── scraper/                     Pipeline Python de coleta + persistência
│   ├── discord/
│   │   ├── sender/                  Bot Discord (envio)
│   │   └── formatter/               API Express de formatação Discord
│   ├── whatsapp/
│   │   ├── sender/                  Bot WhatsApp (envio, Baileys)
│   │   └── formatter/               Gerador de cards (Canvas) + API
│   └── web/                         Frontend Vue 3 + Vite (Sonnar Jobs)
│
├── packages/
│   └── message-formatting-core/     API HTTP central — porta 3100
│                                    (intermedia bots ↔ jobs.json)
│
├── supabase/                        Source-of-truth do schema
│   ├── config.toml
│   ├── functions/                   Edge functions (Stripe, OTP, admin)
│   ├── migrations/                  Migrations canônicas (timestamp)
│   └── _legacy_migrations/          Histórico — não aplicadas
│
├── docs/
│   ├── vault/                       Vault Obsidian canônico (second brain)
│   └── _archive/                    Vaults antigos a consolidar
│
├── scripts/
│   └── db_legacy/                   Helpers antigos de DB (referência)
│
├── .github/workflows/               CI/CD
│   ├── branch-name.yml              Valida nome de branch (git-flow)
│   ├── web-ci.yml                   Lint + build em PRs do web
│   ├── web-deploy.yml               Deploy FTP → Hostinger em push main
│   ├── web-bundle-analysis.yml      Métrica de bundle
│   └── web-security.yml             npm audit semanal
│
├── .githooks/
├── README.md
├── Roadmap.md
└── LICENSE
```

## Aplicações

| Caminho                      | Stack                | Porta | Função                                                      |
| ---------------------------- | -------------------- | ----- | ----------------------------------------------------------- |
| `apps/scraper`               | Python 3.13          | —     | Coleta vagas de N engines, normaliza, escreve 3 sinks       |
| `apps/web`                   | Vue 3 + Vite + Antd  | 5173  | Frontend público (sonnarjobs.com.br) + dashboard + admin    |
| `apps/discord/sender`        | Node + TypeScript    | —     | Bot do Discord — `client.login` + envia embeds              |
| `apps/discord/formatter`     | Node + TypeScript    | —     | API Express de formatação Discord (chama o core)            |
| `apps/whatsapp/sender`       | Node (Baileys)       | —     | Bot WhatsApp — envia cards, gerencia VIP/grupos             |
| `apps/whatsapp/formatter`    | Node + Canvas        | 3001  | Gera cards 1080×1080 e prepara payload do WhatsApp          |
| `packages/message-formatting-core` | Node + Express | 3100  | API HTTP de vagas (fonte: `apps/scraper/src/data/jobs.json`) |

## Como rodar localmente

### Pré-requisitos
- Node 20+
- Python 3.13+ (apenas para o scraper)
- Acesso ao Supabase para o `apps/web` e features VIP do `whatsapp/sender`

### Pipeline mínimo para testar bots (sem Supabase)

```powershell
# 1) Scraper gera apps/scraper/src/data/jobs.json
cd apps/scraper
python -m pip install -r requirements.txt
python scrapy.py   # ou rode 1 engine específica

# 2) Core serve jobs.json em HTTP (porta 3100)
cd ../../packages/message-formatting-core
npm install
npm start

# 3) WhatsApp formatter gera cards (porta 3001)
cd ../../apps/whatsapp/formatter
npm install
npm start

# 4) WhatsApp sender ou Discord sender
cd ../sender   # ou apps/discord/sender
npm install
npm start
```

Sem rodar o scraper, você pode escrever um `apps/scraper/src/data/jobs.json` manualmente (dict por URL com `sent_to: []`) e o core servirá normalmente.

### Frontend web

```powershell
cd apps/web
npm install
npm run dev
```

Variáveis de ambiente em `.env` na raiz de `apps/web/` (ver `.env.example`).

## Banco de dados

Source-of-truth do schema vive em `supabase/`. Migrations canônicas em `supabase/migrations/` (formato `YYYYMMDDHHMMSS_descricao.sql`).

Aplicar localmente:
```powershell
cd supabase
supabase db reset  # roda todas as migrations
```

Migrations em formatos antigos ficam em `supabase/_legacy_migrations/`, separadas por origem (`from_bot_database_root`, `from_bot_database_supabase`). **Não são aplicadas** — só referência histórica.

## CI/CD

| Workflow              | Trigger                                  | O que faz                                         |
| --------------------- | ---------------------------------------- | ------------------------------------------------- |
| `branch-name`         | PR (qualquer)                            | Valida padrão git-flow do nome da branch          |
| `web-ci`              | PR ou push main com mudanças em `apps/web/**` | Lint + build do frontend                     |
| `web-deploy`          | push main com mudanças em `apps/web/**`  | Build → FTP Hostinger → smoke check → Discord     |
| `web-bundle-analysis` | PR ou push main com mudanças em `apps/web/**` | Métricas de bundle (raw + gzip) + artifact   |
| `web-security`        | PR/push/cron semanal (segunda 9h UTC)    | `npm audit --audit-level=high`                    |

**Secrets exigidos pelo `web-deploy`** (em Settings > Secrets and variables > Actions):
- `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` (Hostinger)
- `VITE_INVERTEXTO_TOKEN` (API de telefone)
- `DISCORD_WEBHOOK` (notificação de deploy)

## Documentação

Vault Obsidian em [`docs/vault/`](docs/vault/) — second brain operacional. Pontos de entrada:

- [`00-index/brain.md`](docs/vault/00-index/brain.md) — MOC central
- [`01-architecture/`](docs/vault/01-architecture/) — visão de sistema
- [`12-decisions/`](docs/vault/12-decisions/) — ADRs (5 hoje)
- [`13-issues/`](docs/vault/13-issues/) — débito técnico catalogado

## Roadmap

Ver [Roadmap.md](Roadmap.md) e [`docs/vault/14-roadmap/`](docs/vault/14-roadmap/).

## Licença

Ver [LICENSE](LICENSE).

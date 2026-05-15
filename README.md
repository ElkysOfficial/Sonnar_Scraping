# Sonnar Scraping

Monorepo do Sonnar: agregador de vagas de tecnologia que coleta, normaliza, publica e distribui ofertas para mensageria (Discord, WhatsApp) e para um frontend web.

## Layout do repositório

```
sonnar-scraping/
├── apps/                            Aplicações executáveis
│   ├── scraper/                     Pipeline Python de coleta (engines + persistência)
│   ├── discord/
│   │   ├── sender/                  Bot Discord (envio)
│   │   └── formatter/               Formatação de mensagens Discord
│   ├── whatsapp/
│   │   ├── sender/                  Bot WhatsApp (envio)
│   │   └── formatter/               Formatação de mensagens WhatsApp
│   └── web/                         Frontend Vue + Vite
│
├── packages/
│   └── message-formatting-core/     Lógica de formatação compartilhada
│
├── supabase/                        Source-of-truth do schema
│   ├── config.toml
│   ├── functions/                   Edge functions
│   ├── migrations/                  Migrations canônicas (timestamped)
│   └── _legacy_migrations/          Migrations históricas para referência
│
├── docs/
│   ├── vault/                       Vault Obsidian canônico (era web/obsidian_sonnar)
│   └── _archive/                    Vaults antigos a consolidar manualmente
│
├── scripts/
│   └── db_legacy/                   Helpers antigos de banco (lib, scripts, configs)
│
├── .github/                         CI/CD e templates
├── .githooks/
└── Roadmap.md
```

## Aplicações

| Caminho                      | Stack            | Função                                            |
| ---------------------------- | ---------------- | ------------------------------------------------- |
| `apps/scraper`               | Python           | Coleta vagas de múltiplos engines, persiste em DB |
| `apps/discord/sender`        | Node + TypeScript | Bot do Discord — envia vagas em canais            |
| `apps/discord/formatter`     | Node + TypeScript | Formatação de embeds/mensagens Discord            |
| `apps/whatsapp/sender`       | Node             | Bot WhatsApp — envia vagas a grupos               |
| `apps/whatsapp/formatter`    | Node             | Formatação de mensagens WhatsApp                  |
| `apps/web`                   | Vue 3 + Vite     | Frontend público + dashboard                      |

## Banco de dados

Toda a fonte de verdade do schema vive em `supabase/`. Migrations canônicas estão em `supabase/migrations/` (formato `YYYYMMDDHHMMSS_descricao.sql`).

Migrations antigas em formatos não padronizados ficam em `supabase/_legacy_migrations/`, separadas por origem (`from_bot_database_root`, `from_bot_database_supabase`). Elas não são aplicadas — servem apenas como referência histórica.

## Próximos passos sugeridos

1. **Vault Obsidian**: revisar `docs/_archive/{data_collection,message_formatting,message_sending}` e mesclar conteúdo único para `docs/vault/`.
2. **Workspace tooling**: avaliar adoção de pnpm workspaces ou Turborepo para amarrar `apps/*` e `packages/*`.
3. **Scraper**: migrar `requirements.txt` + `pytest.ini` para `pyproject.toml`.
4. **CI**: ajustar workflows em `.github/workflows/` para os novos caminhos.

## Licença

Ver [LICENSE](LICENSE).

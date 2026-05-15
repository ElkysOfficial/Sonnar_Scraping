---
title: ADR-004 — Reestruturação para monorepo apps/packages/supabase/docs
tags: [adr, decisions, monorepo, repo]
status: accepted
release: 2026-05-15
---

# ADR-004 — Reestruturação para monorepo apps/packages/supabase/docs

## Contexto

Até maio/2026 o repositório tinha dois layouts conflitantes coexistindo:

- **Layout original (commitado):** `data_collection/`, `database/`, `web/`, `LICENSE`, `README.md` na raiz.
- **Layout intermediário (não commitado):** tudo movido para `bot/` (com `data_collection/`, `database/`, `message_formatting/`, `message_sending/`) e `web/` separados.

Sintomas observados:

- 4 cópias independentes (e divergentes) do vault Obsidian: em `bot/data_collection/obsidian_sonnar`, `bot/message_formatting/obsidian_sonnar`, `bot/message_sending/obsidian_sonnar` e `web/obsidian_sonnar`. O `brain.md` diferia entre as cópias — risco real de perda de conhecimento.
- Migrations de Supabase em **dois locais** com convenções incompatíveis: `bot/database/migrations/` no formato `001_..007_` e `web/supabase/migrations/` no formato timestamped `YYYYMMDDHHMMSS_*`. Risco de drift de schema.
- `bot/database/supabase/` aninhado dentro de `bot/database/`, com mais um conjunto de migrations transitórias.
- Mensageria espalhada em `bot/message_formatting/{discord,whatsapp}` e `bot/message_sending/{discord,whatsapp}` — agrupada por verbo em vez de plataforma.
- `errors.log` versionado, `bot/dist` potencialmente versionável, sem tooling de monorepo.

## Decisão

Adotar layout monorepo canônico **apps / packages / supabase / docs / scripts** com uma única fonte de verdade por domínio.

```
sonnar-scraping/
├── apps/                       Aplicações executáveis
│   ├── scraper/                Python — pipeline de coleta
│   ├── discord/{sender,formatter}
│   ├── whatsapp/{sender,formatter}
│   └── web/                    Vue 3 + Vite (era web/)
├── packages/
│   └── message-formatting-core/  Lib compartilhada
├── supabase/                   Source-of-truth do schema
│   ├── config.toml
│   ├── functions/
│   ├── migrations/             Canônicas (timestamped)
│   └── _legacy_migrations/     Histórico (não aplicadas)
│       ├── from_bot_database_root/
│       └── from_bot_database_supabase/
├── docs/
│   ├── vault/                  Vault Obsidian canônico
│   └── _archive/{data_collection,message_formatting,message_sending}/
│                               Vaults divergentes para merge manual
├── scripts/
│   └── db_legacy/              lib, scripts e configs antigos de DB
└── .github/, .githooks/, README.md, LICENSE, Roadmap.md, .gitignore
```

**Critérios de organização:**

- Mensageria **agrupada por plataforma** (`discord/`, `whatsapp/`) com sub-projetos `sender` e `formatter` mantidos como pacotes npm independentes.
- Supabase com **uma única pasta** na raiz; migrations legadas preservadas em `_legacy_migrations/` separadas por origem para auditoria.
- Vault Obsidian **canônico em `docs/vault/`**, vaults divergentes preservados em `docs/_archive/` (não foram mesclados automaticamente porque `brain.md` e demais notas divergiam entre as cópias).

## Alternativas consideradas

1. **Manter o layout `bot/` + `web/` (intermediário)** — rejeitada. Manteria a dualidade de migrations e a confusão de agrupamento por verbo na mensageria.
2. **Mesclar os 4 vaults Obsidian automaticamente em `docs/vault/`** — rejeitada. Risco alto de perder conteúdo único; merge semântico precisa revisão humana. Conteúdo divergente foi para `_archive/` para consolidação posterior.
3. **Renomear migrations legadas (`001_..007_`) para o padrão timestamped e unificar com as canônicas** — rejeitada nesta passada. Exigiria reconciliar com o estado real do banco; alto risco de drift. Decisão: parking lot em `_legacy_migrations/`.
4. **Configurar pnpm workspaces / Turborepo imediatamente** — deferida. Layout `apps/packages/` já é compatível; tooling pode ser adicionado quando o time decidir, sem novo movimento de arquivos.

## Consequências

**Positivas:**

- Eliminada a duplicação de vault e o risco de migrations conflitantes em `003_*`.
- Topologia compatível com pnpm workspaces / Turborepo quando se quiser adotar.
- Cada plataforma de mensageria fica self-contained (`apps/<plataforma>/<papel>`).
- README raiz documenta o layout — onboarding de novo dev fica direto.

**Negativas / dívida criada:**

- `apps/whatsapp/sender/src/config.js:129` (`EMBEDS_FILE_PATH`) precisou ser corrigido manualmente — outras referências a paths antigos podem existir. Já varridas e não encontradas em código (`apps/`, `packages/`), mas presentes em READMEs e docs antigos (não impactam runtime).
- `docs/_archive/` aguarda consolidação manual — conteúdo único dos vaults antigos (engines.md, checkpoint-and-dlq.md, observability.md, rate-limit-and-resilience.md, operations.md do data_collection) precisa ser portado para `docs/vault/`.
- `scripts/db_legacy/migrate-json-to-db.js` tem paths antigos. Não roda automaticamente, mas requer atualização antes de eventual uso futuro.
- Workflows de CI em `.github/workflows/` não tinham paths hardcoded — não precisaram de ajuste, mas precisam de revisão se forem adicionados novos paths.

## Plano de follow-up

1. Mesclar `docs/_archive/data_collection/` em `docs/vault/` (priorizar: `02-domains/engines.md`, `03-features/checkpoint-and-dlq.md`, `04-flows/operations.md`, `10-security/rate-limit-and-resilience.md`, `11-performance/observability.md`).
2. Atualizar referências de path em notas do vault que ainda citam `data_collection/`, `message_sending/`, `message_formatting/`, `web/supabase/`, `bot/database/`.
3. Smoke test de cada app (`apps/scraper` pytest, `apps/web` build, bots `npm install && build`).
4. Avaliar pnpm workspaces depois que (1)–(3) estiverem prontos.

## Relações

- [[../01-architecture/system-overview]] (precisa refletir o novo layout)
- [[../00-index/brain.md]] (mapa central atualizado)
- [[ADR-003-indeed-listing-json-extraction]] (citava `data_collection/` — caminho desatualizado)

## Referências

- Commit `b5b19e7` — `chore(repo): move conteudo legado para bot/ e web/`
- Commit `474b4ba` — `chore(repo): reestrutura para layout apps/packages/supabase/docs`
- Commit `490800f` — `fix(whatsapp): atualiza EMBEDS_FILE_PATH para novo layout apps/discord/formatter`
- `README.md:1` — documentação do layout no root

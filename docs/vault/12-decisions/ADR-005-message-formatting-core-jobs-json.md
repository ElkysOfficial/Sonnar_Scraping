---
title: ADR-005 — message-formatting-core lê jobs.json em vez de Supabase
tags: [adr, decisions, core, bots, jobs-json]
status: accepted
release: 2026-05-15
---

# ADR-005 — message-formatting-core lê jobs.json em vez de Supabase

## Contexto

Antes deste ADR, o serviço `packages/message-formatting-core` (porta 3100) era a API HTTP central consumida pelos bots (Discord e WhatsApp) para listar vagas, marcar status de envio e gerar estatísticas. Ele lia e escrevia diretamente na tabela `public.jobs` do Supabase.

Problemas observados ao tentar testar localmente os bots:

- Toda execução dos bots exigia `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` válidos. Não havia caminho "offline" para ensaiar comportamento.
- O `apps/whatsapp/formatter/src/utils/jobDataClient.js` bypassava o core e ia direto no Supabase — divergência arquitetural silenciosa com o lado Discord, que já passava pelo core.
- O `apps/scraper` já mantinha `apps/scraper/src/data/jobs.json` (dict por `job_url`, com array `sent_to[]`) como sink local — ver [[../08-backend/scraper-persistence]]. Esse arquivo existia há tempos mas só era consumido pelo próprio scraper para dedup.
- Existiam **4 caminhos diferentes** de "como ler vagas": core→Supabase, whatsapp/formatter→Supabase direto, whatsapp/sender→Supabase direto (6 funções de `jobs`), scraper→jobs.json local.

## Decisão

Tornar `apps/scraper/src/data/jobs.json` o **source-of-truth** consumido pelos bots, intermediado pelo `message-formatting-core`:

1. **Core (porta 3100)** lê/escreve `jobs.json` via `fs.readFileSync`/`fs.renameSync` atômico. Mantém o **mesmo shape de resposta** da API anterior — discord/sender, discord/formatter e whatsapp/sender continuam consumindo HTTP sem alteração de contrato.
2. **Tradução na fronteira**: o dict do scraper usa `sent_to: ["discord", ...]`; a API responde com `statuses: { discord: true, whatsapp: false, telegram: false }`. Conversão acontece dentro do core (`sentToToStatuses` / `buildIncoming`).
3. **IDs determinísticos**: `id = md5(job_url)`. Permite que requisições do bot referenciem uma vaga sem precisar persistir UUID no `jobs.json`.
4. **whatsapp/formatter/jobDataClient.js**: deixa de instanciar `@supabase/supabase-js` e passa a falar HTTP com o core (idêntico ao discord/formatter).
5. **whatsapp/sender/services/database.js**: as 6 funções de jobs (`getAllJobs`, `getJobsPage`, `getJobsDelta`, `getPendingWhatsAppJobs`, `markJobSentToWhatsApp`, `getJobById`) viram HTTP no core. As outras tabelas (`vip_subscribers`, `group_features`, `auto_responders`, `sender_state`) **permanecem em Supabase** — fora do escopo desta decisão.
6. **Scraper continua escrevendo nos 3 sinks** (JSON, CSV, Supabase). Sem mudança no lado Python. Supabase continua sendo fonte de agregados públicos do [[../08-backend/index|apps/web]].
7. **Extensão de schema**: a API ganha `skills: string[]` e `description: string`. Quando `skills` chega da API, o card do WhatsApp usa essas tags em vez da heurística regex-no-título legada.

## Alternativas consideradas

1. **Cada bot lê `jobs.json` direto do disco** — rejeitada. Duplicaria lógica de leitura/marcação em 4 lugares e teria race condition se discord e whatsapp escrevessem o mesmo arquivo simultaneamente.
2. **Core lê jobs.json (read-only) + status por arquivo separado** (`sent_discord.json`, `sent_whatsapp.json`) — rejeitada. Adicionaria dois arquivos novos sem ganho claro; o `sent_to[]` no jobs.json já resolve.
3. **Migrar tudo do whatsapp/sender (incluindo VIP) para arquivos** — rejeitada. VIP, group_features e auto_responders têm necessidade real de Postgres (joins, queries, durabilidade) — não cabem em JSON.
4. **Manter o whatsapp/formatter falando Supabase direto** — rejeitada. Padroniza com o discord/formatter, simplifica o modelo mental ("os bots não tocam Supabase para jobs").

## Consequências

**Positivas:**

- Bots podem ser testados localmente sem Supabase. Basta rodar `npm start` no core apontando para qualquer `jobs.json` (via env `JOBS_JSON_PATH`).
- Padronização: todos os bots agora consomem a mesma API HTTP para vagas.
- `whatsapp/formatter` e `whatsapp/sender` deixam de depender de `@supabase/supabase-js` para o caminho de jobs.
- `skills[]` autoritativo da API substitui a heurística frágil de regex no título para gerar chips do card.

**Negativas / dívida criada:**

- **Sem RLS / sem auditoria** no caminho de jobs: o arquivo `jobs.json` é world-readable por qualquer processo na máquina. Antes, Supabase aplicava RLS.
- **Single-writer race**: scraper Python escreve via `LocalJobStore` (lock interno) e core escreve via `writeJobsFile` (queue em Node). **Os dois processos podem escrever no mesmo arquivo** — não há lock cross-process. Mitigação atual: scraper escreve em batch (flush a cada 5s), core escreve raramente (só em `PUT /jobs/status` e `POST /jobs`). Em produção isso precisa virar lock advisory ou colocação de fila/banco entre eles.
- **Source-of-truth dividido**: scraper escreve **tanto** no Supabase **quanto** no jobs.json. Os bots leem do jobs.json (via core); a landing page lê do Supabase. Long-term existe risco de divergência se um sink falhar e o outro continuar.
- **IDs derivados de URL**: se uma URL mudar entre coletas, o id muda. Bots que persistissem `id` em logs antigos não conseguem mais resolver — mitigado porque ninguém persiste id externamente hoje.

## Plano de follow-up

1. **Lock cross-process** no jobs.json (arquivo `.lock` ou fila SQLite). Atacar antes de testar com volume real.
2. **Detectar drift**: script que compara `count(jobs.json)` vs `count(public.jobs)` periodicamente e alerta divergência.
3. **Remover `@supabase/supabase-js` do `apps/whatsapp/sender`** quando VIP/group_features também migrarem (provavelmente nunca — devem ficar no Postgres).
4. **Bump de versão** dos pacotes envolvidos (core era `1.0.0`; mudança é breaking de operação — discutido fora deste ADR).
5. **CI/teste**: adicionar smoke test que sobe o core com fixture e bate os endpoints — hoje só foi feito manualmente.

## Relações

- [[ADR-004-monorepo-restructure]] — pré-requisito (core já estava em `packages/`).
- [[../08-backend/scraper-persistence]] — o 3º sink ("JSON") deste documento agora é fonte primária dos bots.
- [[../06-api/message-formatting-core]] — descrição da API HTTP servida.

## Referências

- Commit `a60e139` — `feat(core): troca Supabase por jobs.json mantido pelo scraper`
- Commit `363bf5b` — `feat(core,whatsapp,discord): suporta skills[] e description vindos da API`
- `packages/message-formatting-core/src/server.js:1` — implementação atual
- `packages/message-formatting-core/.env.example:1` — `JOBS_JSON_PATH` documentado
- `apps/whatsapp/formatter/src/utils/jobDataClient.js:1` — agora HTTP no core
- `apps/whatsapp/sender/src/services/database.js:738` — bloco "JOBS (via message-formatting-core / jobs.json)"
- `apps/scraper/src/persistence/local_store.py:1` — schema do jobs.json (dict por URL com `sent_to[]`)

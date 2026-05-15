---
title: Fluxo de Scraping (data_collection)
tags: [flow, scraper, persistence, data_collection]
updated: 2026-05-03
---

# Fluxo de Scraping

## Contexto

`data_collection/` é o módulo responsável por coletar vagas de múltiplas fontes
(LinkedIn, Catho, BNE, Gupy, Indeed, etc.) e persistir em três sinks: JSON local,
CSV append-only e Supabase. As vagas alimentam:

- O **bot de envio** (WhatsApp / Discord), que lê de `src/data/jobs.json`.
- A **landing-page**, que lê agregados do Supabase via RPCs públicas.
- **Analytics offline** (Excel/Pandas/BI), que consome `src/data/job.csv`.

## Sequência (alto nível)

```
   variavel.iter_batches(10)
            │
            ▼
   ┌─────────────────────────┐
   │ controller.scrape_jobs  │ ─── loop infinito de batches
   └─────────────────────────┘
            │
            │ 1. set_active_batch(batch)
            ▼
   ┌─────────────────────────┐
   │ _run_one_batch          │ ─── dispara getters em paralelo (sem=3)
   └─────────────────────────┘
            │
            │ 2. cada getter chama on_job(parsed) por vaga
            ▼
   ┌─────────────────────────┐
   │ _process_one_job        │ ─── normaliza + enriquece + persiste
   └─────────────────────────┘
            │
            ├──▶ LocalJobStore.upsert  (jobs.json, write-through)
            ├──▶ CSVJobStore.append     (job.csv, append-only)
            └──▶ SupabaseJobsClient.upsert_job  (REST)
```

Após o lote terminar, o controller dorme `BATCH_INTERVAL_SECONDS` (default 2h)
e parte para o próximo lote. Ao esgotar a última categoria, recomeça da primeira.

## Batching

`variavel.STACK_CATEGORIES` é um dict ordenado de **14 categorias** com ~196
stacks no total. `iter_batches(10)` produz tuplas `(categoria, lote)` onde:

- Cada lote tem no máximo 10 stacks.
- Lotes **não cruzam fronteiras de categoria**: o último lote de uma categoria
  pode ter <10 itens - não puxamos da próxima pra completar.
- Ordem das categorias é preservada (Python 3.7+ garante ordem do dict).

Total: ~26 lotes × 2h = **~52h** para um pass completo.

## Streaming de persistência

Engines aceitam parâmetro opcional `on_job` (`async fn(parsed)`). Quando o
controller passa esse callback, **cada vaga parseada vai para o disco/banco
imediatamente**, antes da engine terminar o ciclo. Vantagens:

- Crash da engine no meio do lote ⇒ vagas já parseadas estão salvas.
- Outros consumers (bot WhatsApp/Discord) começam a ver vagas novas em
  segundos, não no fim do lote.

Engines que ainda não suportam `on_job` continuam funcionando: o controller
detecta via `TypeError` e cai no fallback (loop sobre o retorno em batch).

## Pontos de falha & mitigação

| Falha                              | Mitigação                                              |
|-----------------------------------|--------------------------------------------------------|
| Site bane sessão após N requests  | Reset de sessão + cool-off (catho, bne)                |
| Cloudflare hard challenge         | Playwright (`utils/browser_fetch.py`) - só simplyhired |
| Engine crasha mid-stack           | `try/except` por engine, vagas já salvas via streaming |
| Supabase fora do ar                | JSON e CSV continuam gravando; supa retorna False      |
| URL com caracteres especiais      | `urllib.parse.quote` antes de montar a URL             |
| Mesma vaga em múltiplas engines   | Dedup por `job_url` (set em memória + UNIQUE no banco) |

## Tunáveis (env vars)

```bash
BATCH_SIZE=10                  # tamanho do lote
BATCH_INTERVAL_SECONDS=7200    # pausa entre lotes (2h)
MAX_CONCURRENT_ENGINES=3       # engines em paralelo
ENABLE_GOOGLE_ENRICHMENT=0     # enrichment via Playwright (default off)
SUPABASE_URL=...               # (sem isso, sink Supabase fica desligado)
SUPABASE_SERVICE_ROLE_KEY=...
```

## Referências de código

- Loop principal: [`src/controllers/controllers.py::scrape_jobs`](../../../data_collection/src/controllers/controllers.py)
- Catálogo + batching: [`variavel.py`](../../../data_collection/variavel.py)
- Persistência:
    - [`src/persistence/local_store.py`](../../../data_collection/src/persistence/local_store.py) → JSON
    - [`src/persistence/csv_store.py`](../../../data_collection/src/persistence/csv_store.py) → CSV
    - [`src/persistence/supabase_client.py`](../../../data_collection/src/persistence/supabase_client.py) → Supabase
    - [`src/persistence/jobs_repository.py`](../../../data_collection/src/persistence/jobs_repository.py) → orquestrador
- Engines: [`src/engines/`](../../../data_collection/src/engines)
- Helper Playwright (CF bypass): [`src/utils/browser_fetch.py`](../../../data_collection/src/utils/browser_fetch.py)
- Testes: [`tests/`](../../../data_collection/tests)

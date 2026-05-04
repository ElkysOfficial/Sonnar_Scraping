# data_collection — Scraper de Vagas

Módulo Python responsável por coletar vagas em múltiplas fontes (LinkedIn,
Catho, BNE, Indeed, Gupy, etc.) e persistir em três sinks: **JSON**, **CSV**
e **Supabase**.

## Como rodar

```bash
# 1. Variáveis de ambiente (arquivo .env na raiz de data_collection/)
cp .env.example .env
# Edite .env com suas credenciais Supabase (opcional — sem isso, só JSON+CSV
# são gravados, e a landing-page não recebe agregados).

# 2. Dependências
pip install -r requirements.txt
playwright install chromium     # só se for usar a engine simplyhired (Cloudflare bypass)

# 3. Roda em loop infinito
python scrapy.py
```

## Estrutura

```
data_collection/
├── scrapy.py                 # entry-point: chama scrape_jobs()
├── variavel.py               # catálogo de stacks + iter_batches()
├── pytest.ini                # configuração de testes
├── tests/                    # 85 testes (variavel, csv_store, jobs_repository, location)
└── src/
    ├── controllers/
    │   ├── controllers.py    # loop principal (batching + streaming)
    │   └── job_getters.py    # registry das engines ativas
    ├── engines/              # uma engine por site (bne.py, catho.py, ...)
    ├── persistence/
    │   ├── jobs_repository.py    # orquestra os 3 sinks
    │   ├── local_store.py        # JSON write-through atômico
    │   ├── csv_store.py          # CSV append-only
    │   ├── supabase_client.py    # PostgREST upsert
    │   └── location_normalizer.py # texto livre → (state_code, country_code)
    ├── utils/
    │   ├── jobsUtils.py          # formatação de salário
    │   └── browser_fetch.py      # helper Playwright (CF bypass — só simplyhired)
    ├── routes/                   # roteamento p/ embed Discord
    ├── models/models.py          # classe Job (dict-like com .to_dict)
    └── data/
        ├── jobs.json             # SAÍDA: estado atual de todas as vagas
        └── job.csv               # SAÍDA: histórico append-only
```

## Estratégia de execução

### 1. Batching por categoria de stack

`variavel.STACK_CATEGORIES` agrupa as ~196 stacks em **14 categorias**
(linguagens, front-end, back-end, mobile, BD, cloud, data, ML/AI,
arquitetura, segurança, QA, cargos PT, cargos EN, níveis).

`iter_batches(10)` produz tuplas `(categoria, lote)` com até 10 stacks por
vez, **sem cruzar fronteiras de categoria**. Total: ~26 lotes.

A cada ciclo o controller:

1. Pega o próximo lote de `iter_batches(BATCH_SIZE)`.
2. Chama `set_active_batch(batch)` — engines passam a iterar só essas stacks.
3. Roda **todas as engines em paralelo** (semáforo `MAX_CONCURRENT_ENGINES=3`).
4. Dorme `BATCH_INTERVAL_SECONDS` (default 7200s = 2h).
5. Próximo lote.

Quando o último lote da última categoria roda, o ciclo recomeça.
Tempo total de uma volta completa: **~52h** (26 lotes × 2h).

### 2. Streaming de persistência (zero perda)

Engines aceitam o parâmetro `on_job` (callback `async`). O controller passa
um callback que normaliza, enriquece e persiste **a cada vaga parseada** —
não no fim do ciclo. Logo:

- Crash da engine no meio do lote ⇒ vagas já parseadas estão salvas.
- Bot de envio começa a enxergar vagas novas em segundos.
- A engine pode ainda devolver a lista no fim para retrocompat (modo standalone).

Pseudo-código simplificado:

```python
async def get_X_jobs(on_job=None):
    jobs = []
    for stack in get_active_stacks():        # <-- lê o lote ativo
        for parsed in extract_from_site(stack):
            jobs.append(parsed)
            if on_job is not None:
                await on_job(parsed)         # <-- streaming
    return jobs
```

### 3. Persistência em 3 sinks

`JobsRepository.save()` grava em todos os 3 — falha de um não bloqueia os
outros. Retorna `True` se ao menos um confirmou.

| Sink | Arquivo / Endpoint | Modo | Consumidor |
|------|--------------------|------|------------|
| JSON | `src/data/jobs.json` | upsert (write-through atômico) | Bot WhatsApp/Discord |
| CSV | `src/data/job.csv` | append-only | Analytics (Excel/Pandas) |
| Supabase | `public.jobs` | upsert por `job_url` UNIQUE | Landing-page (RPCs públicas) |

## Tunáveis (env vars)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `BATCH_SIZE` | `10` | Tamanho do lote de stacks |
| `BATCH_INTERVAL_SECONDS` | `7200` | Pausa entre lotes (2h) |
| `MAX_CONCURRENT_ENGINES` | `3` | Engines em paralelo |
| `SUPABASE_URL` | — | Sem isso, sink Supabase fica desligado |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Service role para upsert (bypassa RLS) |

## Engines

| Engine | Site | Iterа stacks? | Estratégia |
|--------|------|---------------|------------|
| bne | bne.com.br | ❌ (5 áreas hardcoded) | cloudscraper + JSON-LD |
| careerjet | careerjet.com.br | ✅ | curl_cffi + JSON-LD |
| catho | catho.com.br | ✅ | curl_cffi + parse de listing |
| dice | dice.com | ✅ | curl_cffi + data-testid |
| geekhunter | geekhunter.com.br | ❌ | GraphQL público |
| gupy | portal.api.gupy.io | ✅ | API pública JSON |
| indeed | br.indeed.com | ✅ | curl_cffi + parse |
| infojobs | infojobs.com.br | ✅ | httpx + JSON-LD |
| jooble | br.jooble.org | ✅ | curl_cffi + `__INITIAL_STATE__` |
| linkedin | br.linkedin.com | ✅ | API `seeMoreJobPostings` |
| michaelpage | michaelpage.com.br | ❌ (8 categorias) | httpx + parse |
| programathor | programathor.com.br | ❌ | httpx + JSON-LD |
| remoteok | remoteok.com | ❌ (filtra client-side) | API pública |
| remotive | remotive.com | ❌ (13 categorias) | API pública |
| simplyhired | simplyhired.com.br | ✅ | **Playwright** (CF bypass) + `__NEXT_DATA__` |
| weworkremotely | weworkremotely.com | ❌ (9 feeds RSS) | XML/RSS |
| ziprecruiter | ziprecruiter.co.uk | ✅ | curl_cffi + parse |

## Testes

```bash
python -m pytest                # 85 testes
python test_engines.py          # smoke test individual de cada engine
python test_engines.py catho    # só uma engine
ENGINE_TIMEOUT=300 python test_engines.py linkedin   # timeout custom
```

## Documentação adicional

- [[../landing-page/obsidian_sonnar/04-flows/scraping-flow.md|Fluxo completo no Obsidian]]
- [[../landing-page/obsidian_sonnar/08-backend/scraper-persistence.md|Detalhes da persistência]]

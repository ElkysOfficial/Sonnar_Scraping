# 💾 Checkpoint, retomada e DLQ

Este é o sistema que garante que **nenhuma vaga se perde** e que **a engine sempre pode continuar de onde parou** após qualquer queda.

Implementado em `src/persistence/extraction_tracker.py` e nas tabelas `extraction_jobs` / `extraction_dlq` no Supabase.

## A ideia central

Para cada URL que a engine descobre, registramos seu **estado** numa tabela. Se a engine cair, o estado fica salvo. Quando ela voltar, lê o estado e continua exatamente do ponto correto.

## Os 6 estados

```
                    ┌──────────────┐
                    │  discovered  │  URL achada no listing
                    └──────┬───────┘
                           │ controller chama refetch
                           ▼
                    ┌──────────────┐
                    │   running    │  detail-fetch em andamento
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │ completed│  │ partial  │  │ failed   │
       └──────────┘  └─────┬────┘  └─────┬────┘
       descrição    descrição vazia,   tenta de novo no
       boa, salvo   parser pode estar  próximo lote
       em todos     defasado           
       os sinks                          
                                      ┌───────────────────┐
                                      │ blocked           │
                                      │ (circuit aberto)  │
                                      └───────────────────┘

          após 3 falhas → vai para extraction_dlq
                          (dead-letter queue)
```

| Estado | Significa |
|---|---|
| `discovered` | URL achada no listing, ainda não foi buscada |
| `running` | Detail-fetch em andamento (vai virar completed/partial/failed) |
| `partial` | Vaga foi salva, mas detail falhou (descrição vazia, regime errado) |
| `completed` | Tudo certo: URL foi enriquecida e persistida em todos os sinks |
| `failed` | Última tentativa deu erro; será reintroduzida no próximo ciclo |
| `blocked` | Domínio está em quarentena (circuit aberto) |

## Idempotência

A chave primária é a **URL**. Mesmo se a engine roda 10 vezes contra a mesma URL:
- Em `extraction_jobs` ela **só existe uma vez** (UPSERT pelo PK).
- Em `jobs` ela **só existe uma vez** (UNIQUE em `job_url`).

Então mesmo crash + retry + duas engines paralelas com a mesma URL = nenhuma duplicata.

## Retomada após queda

Quando a engine inicia (`scrape_jobs`):
1. Lê todas as URLs em `state='completed'` do Supabase → coloca no set `sent_jobs`.
2. Junta com URLs já em `jobs.json` local.
3. **Pula essas URLs** no listing seguinte (dedup natural).
4. URLs em `state='discovered'` ou `'failed'` que ainda existem na tabela são candidatas a reprocessamento (passe de reenrichment, ver abaixo).

Resultado: **kill -9 no meio de qualquer ciclo, restart, continua igual**.

## Dead-letter queue (DLQ)

Após **3 falhas seguidas** numa URL, ela é movida para a tabela `extraction_dlq`:

```sql
SELECT job_url, engine, attempts, last_error_type, last_error_msg, failed_at
FROM extraction_dlq
ORDER BY failed_at DESC LIMIT 10;
```

Útil para diagnóstico: você vê **exatamente** quais URLs estão dando problema persistente e por quê. No dashboard, há uma tabela "Dead-letter queue" com essa informação.

DLQ não para o sistema — só registra. As URLs daí saem da fila normal e ficam só lá esperando análise manual.

## Reenrichment automático

Aqui mora a inteligência. Cada engine tem uma constante:

```python
# em src/engines/linkedin.py
PARSER_VERSION = "linkedin-2026.05.07"
```

Quando você **muda essa constante** (porque melhorou o parser, corrigiu um bug, adicionou novo campo), na próxima vez que o scraper sobe acontece:

1. **Startup**: para cada engine, chama RPC `requeue_stale_partial(engine, parser_version)` no Supabase. Esse RPC encontra todas as URLs daquele engine em `state='partial'` ou `'failed'` cujo `parser_version` é diferente do atual e **as marca como `discovered`** novamente.

2. **Entre lotes**: o controller faz um **passe de reenrichment**. Para cada engine que tem `refetch_one(url)` (atualmente só LinkedIn), ele:
   - Pega até 100 URLs em `state='discovered'` daquela engine.
   - Chama `refetch_one(url)` para cada uma — vai direto na página, ignora listing.
   - Se enriqueceu bem (descrição > 200 chars), marca `completed`.
   - Se ainda falhou, conta como tentativa; ao 3º vai pra DLQ.

3. **Resultado**: bumpe `PARSER_VERSION` em uma engine → na próxima execução, todas as vagas antigas são reprocessadas automaticamente. **Sem rodar nenhuma query manual.**

### Como ativar para mais engines

Hoje só LinkedIn faz isso. Para Gupy, Indeed, etc.:

```python
# 1. Em src/engines/<engine>.py:
PARSER_VERSION = "gupy-2026.05.07"

async def refetch_one(url: str) -> list | None:
    """Reprocessa uma URL específica."""
    # ... busca direto a página de detalhe e devolve a lista canônica
```

```python
# 2. Em src/controllers/controllers.py, _build_engine_registry:
from ..engines import gupy as _gupy
registry["gupy"] = {
    "parser_version": getattr(_gupy, "PARSER_VERSION", None),
    "refetch_one": getattr(_gupy, "refetch_one", None),
}
```

A partir daí, qualquer bump de `PARSER_VERSION` no Gupy reaciona reenrichment automático.

## Arquivos e tabelas

### Python
- `src/persistence/extraction_tracker.py` — singleton `tracker` com a API
- API:
  - `tracker.discover(url, engine='linkedin')` — quando descobre no listing
  - `tracker.mark_running(url, engine=...)` — antes do detail
  - `tracker.mark_partial(url, engine=..., parser_version=...)` — descrição curta
  - `tracker.mark_completed(url, engine=..., parser_version=...)` — sucesso final
  - `tracker.mark_failed(url, engine=..., error_type=..., error_msg=...)` — erro
  - `tracker.requeue_stale_partial(engine, version)` — reset stale
  - `tracker.pick_pending(engine, limit=100)` — pega URLs para reenrichment

### Supabase
- `extraction_jobs(job_url PK, domain, engine, state, attempts, parser_version, payload_hash, last_error_type, last_error_msg, discovered_at, last_attempt_at, completed_at)`
- `extraction_dlq(id PK, job_url, domain, engine, attempts, last_error_type, last_error_msg, parser_version, discovered_at, failed_at)`
- RPCs:
  - `requeue_stale_partial(engine, version)` → INTEGER (linhas afetadas)
  - `pick_pending_urls(engine, limit)` → SETOF (job_url, attempts)
  - `get_extraction_queue_stats()` → contagem por engine × estado
  - `get_extraction_queue_summary()` → KPIs do dashboard
  - `get_extraction_dlq(window_minutes, max_rows)` → últimas falhas

## Custos

- **1 round-trip** ao Supabase a cada 5s (batch de até 200 transições) — ~1 KB
- 2 tabelas crescendo (com índices): `extraction_jobs` proporcional ao universo de URLs vistas; `extraction_dlq` só cresce com falhas
- ~250 linhas de código de tracker

## O que você vê no dashboard

Painel `/admin/scraper`, seção **Fila de extração**:
- Cards por estado (Descobertas, Em execução, Parciais, Completas, Falharam, Bloqueadas, DLQ)
- Tabela **Engine × Estado** mostrando distribuição
- Tabela **DLQ** com últimas falhas persistentes (URL clicável para investigar)

Veja [[OBSERVABILITY]] para mais.

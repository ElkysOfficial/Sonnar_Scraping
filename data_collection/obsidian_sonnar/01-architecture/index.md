# 🏗️ Arquitetura

## Visão geral

A engine é um **único processo Python assíncrono** que orquestra 17 engines especializadas (uma por site de vagas) em ciclos repetidos.

```
scrapy.py
   │
   ├─► controllers/controllers.py  (orquestrador principal)
   │      │
   │      ├─► engines/*.py          (1 por site)
   │      │      │
   │      │      └─► utils/http_session.py  (cliente HTTP partilhado)
   │      │             └─► utils/rate_limiter.py
   │      │                   • token bucket por domínio
   │      │                   • retry com backoff
   │      │                   • circuit breaker
   │      │
   │      ├─► persistence/jobs_repository.py
   │      │      ├─► persistence/local_store.py     (jobs.json)
   │      │      ├─► persistence/csv_store.py      (job.csv)
   │      │      └─► persistence/supabase_client.py (tabela jobs)
   │      │
   │      └─► persistence/extraction_tracker.py
   │             • estado por URL (Supabase)
   │             • DLQ (dead-letter queue)
   │
   └─► utils/metrics.py  +  utils/structured_logging.py
          • envia métricas para Supabase
          • logs em JSON (arquivo) + texto colorido (stdout)
```

## As 4 camadas

### 1. Orquestração — `controllers/`

Quem decide **o que rodar e quando**:
- Divide as stacks (Python, Java, etc.) em **lotes de 10**.
- Para cada lote, dispara as engines em paralelo (default: 2 simultâneas).
- Após cada lote, faz uma **passagem de reenrichment** (reprocessa URLs com parser antigo).
- Dorme 2h entre lotes.

Arquivo principal: `controllers/controllers.py`. Engines ativas são listadas em `controllers/job_getters.py`.

### 2. Engines — `engines/`

Cada engine é **um arquivo independente** que sabe:
- Como buscar a listagem de vagas no site.
- Como buscar o detalhe de cada vaga (quando aplicável).
- Como traduzir a resposta em um formato canônico de 10 campos: `[url, título, empresa, localização, modalidade, regime, salário, data, skills, descrição]`.

Não precisam saber sobre persistência, dedup, rate-limit ou retry — tudo isso está nas camadas inferiores. Veja [[ENGINES]] para detalhes de cada uma.

### 3. Resiliência HTTP — `utils/`

Toda chamada HTTP passa por uma "casa de máquinas" comum:

| Componente | Responsabilidade |
|---|---|
| `http_session.HttpSession` | Cliente httpx singleton (pool de 20 conexões, HTTP/2, timeouts curtos) |
| `http_session.fetch` / `fetch_sync` | Helper que chama a URL aplicando a "policy" (rate-limit + retry + circuit breaker) |
| `rate_limiter.DomainRateLimiter` | **Token bucket por domínio**: garante que você não faz mais de N req/seg por site |
| `rate_limiter.CircuitBreaker` | Se um site começa a errar muito, **fecha** automaticamente por 15min~2h |
| `metrics.MetricsCollector` | Conta tudo (requests, status codes, latência) e envia para o Supabase a cada 30s |

Detalhes: [[RATE_LIMIT_AND_RESILIENCE]].

### 4. Persistência — `persistence/`

Vagas são salvas em **3 destinos** ao mesmo tempo, todos best-effort:

| Destino | Para que serve |
|---|---|
| `src/data/jobs.json` | Fonte da verdade local (lida pelo `message_sending`). Flush em batch a cada 5s. |
| `src/data/job.csv` | Histórico append-only para analytics offline (Excel, Pandas). |
| Supabase tabela `jobs` | Produção: alimenta a landing-page, o dashboard, etc. |

Se um falhar, os outros continuam. Se ao menos 1 confirmar, a vaga conta como salva.

Em paralelo, a `extraction_tracker` mantém o **estado por URL** no Supabase (`extraction_jobs`):
- `discovered` → URL achada no listing
- `running` → buscando o detalhe
- `partial` → seed gravado mas falhou enriquecer (descrição vazia)
- `completed` → salvou com sucesso
- `failed` → erro nesse ciclo
- `blocked` → domínio em quarentena

Após 3 falhas, vai pra `extraction_dlq` (dead-letter queue) para análise manual.

Detalhes: [[CHECKPOINT_AND_DLQ]].

## Por que tudo isso?

**Sem essas camadas:**
- Sem rate-limiter → você bombarda o site → IP banido em horas.
- Sem retry/backoff → erro temporário derruba o lote inteiro.
- Sem circuit breaker → site fora do ar consome retries inúteis.
- Sem tracker → crash no meio = perde o progresso.
- Sem DLQ → erros viram log e somem.
- Sem métricas → você não sabe se está funcionando até reclamarem.

**Com elas:**
- Coleta sustentada 24×7 sem ban.
- Recuperação automática após qualquer falha.
- Visibilidade total no dashboard `/admin/scraper`.

## Limites operacionais (VPS 2 vCPU / 8 GB RAM)

| Parâmetro | Valor | Por quê |
|---|---|---|
| `MAX_CONCURRENT_ENGINES` | 2 | 2 vCPUs = 2 engines paralelas sem contenção |
| `httpx max_connections` | 20 | Margem segura sobre o uso real |
| Concorrência por host | 2-3 | LinkedIn 429 medido com 8+ paralelas |
| Rate por host | 0.4-1 req/s | Conservador, anti-bloqueio |
| Retry máximo | 3 | Mais que isso amplifica bloqueio |
| Backoff | exponencial 2,4,8s + jitter | Padrão da indústria |

Esses valores cabem em `utils/rate_limiter.py` (`_DOMAIN_CONFIGS`). Ajuste se precisar — mas sempre com cautela.

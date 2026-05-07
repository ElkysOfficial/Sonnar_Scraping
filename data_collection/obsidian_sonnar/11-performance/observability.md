# 📊 Observabilidade

Você não opera o que não consegue ver. A engine emite **métricas, eventos e logs estruturados**, todos consultáveis em tempo real no dashboard `/admin/scraper`.

## O que é coletado

### Métricas (envio a cada 30s para Supabase)

Cada métrica tem: `ts`, `host`, `domain`, `metric_type` (counter/gauge), `metric_key`, `value`.

| Categoria | Chaves | O que é |
|---|---|---|
| Requests | `req.total`, `req.sampled` | Total de chamadas HTTP |
| Status code | `status.2xx`, `status.429`, `status.5xx`, `status.<exato>` | Distribuição por código |
| Erros | `err.<TipoErro>` | Timeouts, ConnectError, etc. |
| Latência | `latency.p50_ms`, `latency.p95_ms` | Mediana e p95 por domínio |
| Retry | `retry.attempt`, `retry.exhausted` | Tentativas e desistências |
| Rate-limit | `rate.effective` | Rate atual (req/s) por domínio |
| Persistência | `persist.ok`, `persist.error`, `persist.skipped` | Resultado dos saves |
| Engine | (eventos) | start/finish/error |
| Circuit | (eventos) | open/half_open/closed |

### Eventos discretos (envio a cada 30s)

Pontos importantes no tempo: `circuit.open`, `parser.error`, `engine.error`, `batch.error`, `reenrich.start`, `listing.aborted`, etc. Cada um vem com `ts`, `kind`, `domain`, `data` (JSON livre).

### Logs estruturados

- **Arquivo**: `scraper.log` em formato **JSON-line** (1 linha = 1 record), rotacionado em 10 MB × 5.
- **Console**: formato **pretty** colorido (`HH:MM:SS LEVEL logger msg k=v...`) por padrão.
- Toggle: `SCRAPER_LOG_FORMAT=json|pretty` (default `pretty` no console).
- Toggle: `SCRAPER_LOG_STDOUT=0` para desligar stdout.

Logger principal: `scraper`. Sub-loggers: `scraper.controller`, `scraper.metrics`, `scraper.tracker`, `scraper.engine.linkedin`, etc.

## Onde ver tudo isso

### Dashboard `/admin/scraper` (recomendado)

Acesso por usuário com role `admin` ou `owner`. Layout:

```
┌─ KPIs do topo ───────────────────────────────────────────────┐
│  Requests  │ 429 │ 5xx │ Circuits abertos │ Retries │ Vagas │
└──────────────────────────────────────────────────────────────┘

┌─ Por domínio ───────────────────────────────────────────────┐
│  domínio  reqs  2xx  429  5xx  retries  p50  p95  rate     │
└─────────────────────────────────────────────────────────────┘

┌─ Circuit breakers ──────────────────────────────────────────┐
│  domínio  estado  erros  sucessos  taxa  reabre em  últ.atu│
└─────────────────────────────────────────────────────────────┘

┌─ Fila de extração ──────────────────────────────────────────┐
│  Descobertas Em execução Parciais Completas Falharam DLQ    │
│                                                              │
│  Engine × Estado (tabela)                                    │
└─────────────────────────────────────────────────────────────┘

┌─ Dead-letter queue ─────────────────────────────────────────┐
│  Quando  Engine  URL  Tentativas  Erro                      │
└─────────────────────────────────────────────────────────────┘

┌─ Eventos recentes ──────────────────────────────────────────┐
│  ts  kind  domain  data                                      │
└─────────────────────────────────────────────────────────────┘
```

Janela configurável: 15min, 1h, 6h, 24h. Auto-refresh a cada 30s.

### Console (em dev local)

```
$ python scrapy.py
18:15:52 INFO    scraper.controller  scraper_init  local_known=0 tracker_known=0
18:15:52 INFO    scraper.controller  batch_start  batch_idx=1 batch_total=29 category=...
18:15:52 INFO    scraper.controller  engine_start  engine=linkedin
18:15:55 INFO    scraper.engine.linkedin  detail_fetch  url=... statusCode=200 durationMs=842
```

### Arquivo `scraper.log` (em produção)

JSON-line, ingerível por qualquer ferramenta (Loki, Grafana, ELK, etc.):

```json
{"ts":"2026-05-07T18:15:52.037Z","level":"INFO","logger":"scraper.controller","msg":"scraper_init","local_known":0,"tracker_known":0}
```

## O que olhar primeiro quando algo dá errado

### "A coleta não está crescendo"

1. Dashboard → **Requests** está crescendo?
   - Se sim, mas vagas não, problema é no parser.
   - Se não, engine está parada → veja eventos `engine.error`.

2. **Circuits abertos > 0**?
   - Algum site está em quarentena. Veja a tabela "Circuit breakers" → estado/tempo de reabertura.
   - Se for um site específico travando: investigue (mudou layout? IP banido?).

3. **DLQ crescendo**?
   - Falhas persistentes. Olhe a coluna "Erro" — `JSONDecodeError`? `KeyError`? Indica mudança no site.

### "Recebi muito 429"

1. Dashboard → tabela "Por domínio" → veja qual site.
2. O `rate.effective` deve ter caído automaticamente (slow_down).
3. Se persistir, abra `_DOMAIN_CONFIGS` em `rate_limiter.py` e baixe o `rate_per_sec` daquele site.

### "Engine caiu"

1. `scraper.log` no host (`tail -f scraper.log | grep ERROR`).
2. No console: errors estão visíveis em vermelho.
3. Reinicie: `python scrapy.py`. O sistema lê o estado e continua. Veja [[CHECKPOINT_AND_DLQ#Retomada após queda]].

## RPCs disponíveis (caso queira fazer dashboards próprios)

| RPC | Retorna |
|---|---|
| `get_scraper_health(window_minutes)` | KPIs gerais (1 linha) |
| `get_scraper_summary(window_minutes)` | Por domínio |
| `get_scraper_timeseries(window_minutes, bucket_minutes)` | Série temporal |
| `get_scraper_circuits()` | Estado dos circuits |
| `get_scraper_events(window_minutes, max_rows)` | Eventos recentes |
| `get_extraction_queue_summary()` | KPIs de fila |
| `get_extraction_queue_stats()` | Por engine × estado |
| `get_extraction_dlq(window_minutes, max_rows)` | Últimas DLQ |

Todas com `SECURITY DEFINER`, leitura permitida só a `authenticated` com role admin/owner.

## Variáveis de ambiente úteis

| Variável | Default | O que faz |
|---|---|---|
| `SCRAPER_LOG_PATH` | `scraper.log` | Caminho do arquivo de log |
| `SCRAPER_LOG_FORMAT` | `pretty` | `json` ou `pretty` no stdout |
| `SCRAPER_LOG_STDOUT` | `1` | `0` desliga stdout |
| `METRICS_FLUSH_INTERVAL_S` | `30` | Periodicidade do flush de métricas |
| `EXTRACTION_FLUSH_INTERVAL_S` | `5` | Periodicidade do flush do tracker |
| `EXTRACTION_FLUSH_THRESHOLD` | `200` | Flush antecipado quando atingir N transições |
| `EXTRACTION_MAX_ATTEMPTS` | `3` | Quantas tentativas antes de ir pra DLQ |
| `REENRICH_LIMIT_PER_PASS` | `100` | URLs reprocessadas por passe entre lotes |

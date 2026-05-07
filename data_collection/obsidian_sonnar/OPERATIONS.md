# 🔧 Operações — instalar, rodar, mexer no dia a dia

## Setup local

### Pré-requisitos
- Python 3.11+
- Acesso ao projeto Supabase (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`)
- Para Indeed/SimplyHired: navegador Chromium do Playwright

### Instalação

```bash
cd data_collection
pip install -r requirements.txt
playwright install chromium    # só se for usar Indeed/SimplyHired
```

### Configurar `.env`

Na raiz de `data_collection/`, crie um `.env` (já gitignorado):

```
SUPABASE_URL=https://<seu-projeto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<chave-service-role>
```

Service role bypassa RLS — **nunca exponha no frontend**, só no backend do scraper.

### Rodar

```bash
python scrapy.py
```

Em produção (VPS):

```bash
nohup python -O scrapy.py > scraper.out 2>&1 &
```

ou via systemd / pm2 / supervisor (recomendado).

## Configuração principal

Tudo via env vars (e defaults sensatos):

| Variável | Default | O que faz |
|---|---|---|
| `BATCH_SIZE` | 10 | Stacks por lote |
| `BATCH_INTERVAL_SECONDS` | 7200 | Pausa entre lotes (2h) |
| `MAX_CONCURRENT_ENGINES` | 2 | Engines em paralelo |
| `LINKEDIN_DETAIL_CONCURRENCY` | 4 | Coroutines simultâneas pro LinkedIn detail |
| `EXTRACTION_MAX_ATTEMPTS` | 3 | Retries antes de DLQ |
| `REENRICH_LIMIT_PER_PASS` | 100 | URLs reprocessadas por lote |
| (e mais — veja [[OBSERVABILITY#Variáveis de ambiente úteis]]) |

## Fluxos comuns

### Ativar uma engine nova

Edite `src/controllers/job_getters.py` e descomente a linha:

```python
getters = [
    get_linkedin_jobs,
    get_gupy_jobs,        # ← descomentado
    # get_indeed_jobs,
]
```

Reinicie o processo. A engine entra no próximo lote.

### Adicionar uma engine totalmente nova

1. Crie `src/engines/<nome>.py` seguindo o padrão (veja `linkedin.py` como referência completa).
2. Importe em `src/engines/job_getters.py`.
3. Adicione na lista `getters`.
4. Configure rate-limit em `_DOMAIN_CONFIGS` (`utils/rate_limiter.py`).
5. (Opcional) Adicione `PARSER_VERSION` e `refetch_one()` para participar do reenrichment.

### Atualizar parser de uma engine sem perder vagas antigas

1. Edite o parser.
2. **Bumpe** `PARSER_VERSION` no topo da engine (ex.: `"linkedin-2026.05.07"` → `"linkedin-2026.06.01"`).
3. Reinicie o processo.
4. Pronto: o sistema reagenda automaticamente todas as vagas com versão antiga e reprocessa entre os lotes. Veja [[CHECKPOINT_AND_DLQ#Reenrichment automático]].

### Investigar falhas

```sql
-- DLQ recente
SELECT engine, last_error_type, count(*)
FROM extraction_dlq
WHERE failed_at > NOW() - INTERVAL '1 day'
GROUP BY 1, 2
ORDER BY 3 DESC;

-- URLs presas em "running" há muito (provavelmente crash)
SELECT * FROM extraction_jobs
WHERE state='running' AND last_attempt_at < NOW() - INTERVAL '30 min';
```

Ou pelo dashboard `/admin/scraper`.

### Limpar uma URL específica para reprocessar

```sql
-- Volta para discovered (fila)
UPDATE extraction_jobs SET state='discovered', attempts=0
WHERE job_url = 'https://...';
```

Próximo passe de reenrichment vai pegar.

### Limpar a DLQ (após resolver causa raiz)

```sql
DELETE FROM extraction_dlq WHERE engine='linkedin' AND failed_at < NOW() - INTERVAL '7 days';
```

## Logs e monitoramento

- Console (dev): texto colorido humano.
- Arquivo (`scraper.log`, prod): JSON-line, rotação automática.
- Dashboard: `/admin/scraper` — métricas em tempo real, fila, DLQ, eventos.

## Troubleshooting

### "Status 404 'Could not find the table extraction_metrics'"

A migration não foi aplicada. Rode:

```bash
cd landing-page
npx supabase db push
```

### "Status 401 / 403 do Supabase"

`SUPABASE_SERVICE_ROLE_KEY` errada ou ausente. Confira o `.env`.

### "playwright._impl._api_types.Error: BrowserType.launch: Executable doesn't exist"

```bash
playwright install chromium
```

### "Engine X parou de retornar vagas"

1. Dashboard `/admin/scraper` → tabela "Por domínio" → o domínio sumiu? Está com circuit aberto?
2. Veja DLQ → erros recentes daquele engine.
3. Provavelmente o site mudou layout. Investigue HTML, ajuste seletores, **bumpe `PARSER_VERSION`**, reinicie.

### "Memory leak / RAM crescendo"

- Playwright pode acumular se `close_browser` não rodar. O controller fecha entre lotes — verifique se isso está sendo chamado.
- Reduza `MAX_CONCURRENT_ENGINES` se passar de 2.

### "VPS travando com swap"

- Diminua `MAX_CONCURRENT_ENGINES` para 1.
- Diminua `LINKEDIN_DETAIL_CONCURRENCY`.
- Verifique se Indeed/SimplyHired estão rodando — Playwright come muita RAM.

## Estrutura de pastas

```
data_collection/
├── scrapy.py                       # entrypoint
├── src/
│   ├── controllers/
│   │   ├── controllers.py          # loop principal
│   │   └── job_getters.py          # quais engines ativar
│   ├── engines/                    # 17 engines, 1 por site
│   ├── persistence/
│   │   ├── jobs_repository.py      # orquestra os 3 sinks
│   │   ├── local_store.py          # JSON local
│   │   ├── csv_store.py            # CSV append-only
│   │   ├── supabase_client.py      # tabela jobs
│   │   └── extraction_tracker.py   # estado por URL + DLQ
│   ├── utils/
│   │   ├── http_session.py         # cliente httpx + helpers
│   │   ├── rate_limiter.py         # rate, retry, circuit
│   │   ├── metrics.py              # coletor + flush
│   │   ├── structured_logging.py   # JSON + pretty
│   │   ├── browser_fetch.py        # Playwright fallback
│   │   ├── jobsUtils.py            # process_salary
│   │   ├── job_fallbacks.py        # apply_description_fallbacks
│   │   ├── skills_vocabulary.py
│   │   └── text_utils.py           # extract_skills, strip_html
│   └── data/
│       ├── jobs.json               # fonte de verdade local
│       └── job.csv                 # histórico
├── obsidian_sonnar/                # esta documentação
├── tests/
└── requirements.txt
```

Veja [[ARCHITECTURE]] para o "porquê" das decisões.

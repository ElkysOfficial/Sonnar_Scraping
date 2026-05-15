---
title: Persistência do Scraper (3 sinks)
tags: [backend, scraper, persistence]
updated: 2026-05-03
---

# Persistência do Scraper

O `JobsRepository` (`data_collection/src/persistence/jobs_repository.py`)
orquestra a gravação de cada vaga em **três sinks independentes**.
Cada sink falha ou tem sucesso isoladamente - `save()` retorna True se ao
menos um deles confirmou.

## Os três sinks

| Sink | Arquivo / Endpoint | Modo | Quem consome |
|------|--------------------|------|--------------|
| `LocalJobStore` | `src/data/jobs.json` | upsert atômico (`.tmp + os.replace`) | Bot WhatsApp/Discord (envio de mensagens) |
| `CSVJobStore` | `src/data/job.csv` | append-only com cabeçalho fixo | Analytics offline (Excel, Pandas, BI) |
| `SupabaseJobsClient` | `public.jobs` (PostgREST) | upsert por `job_url` (UNIQUE) | Landing-page (agregados via RPCs) |

## Por que 3 sinks?

- **JSON** (`jobs.json`): formato keyed por URL → dedup O(1), ideal para o bot
  iterar sem hit no banco. Suporta o campo `sent_to[]` para rastrear quais
  canais já receberam a vaga (controle de idempotência fora do scraper).

- **CSV** (`job.csv`): histórico imutável, cada linha registra o estado da vaga
  no momento da coleta. Útil para análises retroativas mesmo que a vaga seja
  apagada do banco. Cabeçalho fixo em `CSV_COLUMNS` (15 colunas) - alinhado
  ao schema da tabela `jobs` no Supabase.

- **Supabase** (`public.jobs`): fonte de agregados públicos da landing-page.
  Usa RLS + RPCs com `SECURITY DEFINER` para que o `anon` role não toque a
  tabela diretamente - só executa funções estatísticas
  (`get_jobs_stats`, `get_jobs_by_uf`, `get_jobs_by_country`).

## Schema canônico do payload

Antes de gravar, `build_job_payload()` normaliza o dict bruto da engine para o
formato canônico:

```python
{
    "job_url": str,                     # UNIQUE
    "job_title": str,
    "company": str | None,
    "location_raw": str | None,         # original ("São Paulo - SP, Brasil")
    "state_code": str | None,           # UF derivada ('SP') ou None
    "country_code": str | None,         # ISO-2 ('BR') ou None
    "work_type": str | None,            # 'Remoto' | 'Híbrido' | 'Presencial'
    "hiring_regime": str | None,        # 'CLT' | 'PJ' | 'Estágio' | ...
    "salary_raw": str | None,           # texto original
    "salary_min": int | None,           # parseado
    "salary_max": int | None,
    "salary_currency": "BRL",           # hardcoded por enquanto
    "publication_date": "YYYY-MM-DD" | None,
    "source": str,                      # nome da engine ('linkedin', 'gupy'...)
    "scraped_at": ISO-8601 timestamp UTC,
}
```

A normalização vive em `jobs_repository.py::build_job_payload`.

## Garantias de durabilidade

- **JSON**: `_flush_unlocked` escreve em `.tmp` e usa `os.replace` para
  movimento atômico - uma queda do processo no meio da escrita não corrompe o
  arquivo (você fica com a versão antiga ou a nova, nunca uma híbrida).
- **CSV**: cada `append` abre/fecha o arquivo em modo `'a'` e fecha o file
  handle imediatamente - flush implícito no close. Última linha
  potencialmente perdida ⇒ a próxima escrita re-abre limpo.
- **Supabase**: REST `Prefer: resolution=merge-duplicates` faz upsert real
  (sem race entre INSERT e UPDATE concorrentes).

## Streaming via callback

O controller injeta o repo em `_process_one_job` que é chamado **a cada vaga**
parseada pelas engines (via callback `on_job`). Não há buffer - cada vaga
passa pelo `repo.save()` antes de a engine continuar parseando a próxima.

Isso garante que crashes mid-batch não percam dados já extraídos.

## Referências

- Implementação: [`src/persistence/`](../../../data_collection/src/persistence)
- Controller: [`src/controllers/controllers.py`](../../../data_collection/src/controllers/controllers.py)
- Migration Supabase: [`landing-page/supabase/migrations/20260502000000_jobs_schema.sql`](../../supabase/migrations)
- Fluxo completo: [[scraping-flow]]

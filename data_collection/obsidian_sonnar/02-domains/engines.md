# 🛠️ Engines

Cada engine extrai vagas de **um site**. Todas seguem o mesmo contrato e usam a mesma camada HTTP. O que muda entre elas é só o site específico (URLs, formato do HTML/JSON, etc.).

## Contrato comum

Toda engine expõe uma função `get_<nome>_jobs(on_job=None)` que:
1. Busca vagas no site.
2. Para cada vaga encontrada, monta uma **lista canônica de 10 campos**:
   ```
   [url, título, empresa, localização, modalidade,
    regime, salário, data, skills, descrição]
   ```
3. Se `on_job` foi passado (e foi, pelo controller), invoca **a cada vaga** em vez de só no final. Isso garante que vagas vão sendo persistidas em streaming — se a engine cair no meio, o que já foi extraído está salvo.

## Ativação

Engines ativas estão em `src/controllers/job_getters.py`:

```python
getters = [
    # get_bne_jobs,
    # get_careerjet_jobs,
    get_linkedin_jobs,         # ← ativa
    # get_michaelpage_jobs,
    ...
]
```

Comente/descomente para ativar. Em produção, normalmente todas as importantes ficam ativas.

## Tipos de cliente HTTP por engine

Diferentes sites exigem diferentes "máscaras" de cliente:

| Cliente | Engines | Por quê |
|---|---|---|
| `httpx` (HttpSession) | linkedin, gupy, infojobs, michaelpage, programathor, geekhunter | Sites que aceitam clientes HTTP "normais" |
| `curl_cffi` (impersona Chrome) | indeed, jooble, dice, catho, careerjet, remoteok, remotive, weworkremotely, ziprecruiter, simplyhired | Sites com fingerprint TLS-check (httpx puro recebe 403) |
| `cloudscraper` | bne | Site com desafio anti-bot Cloudflare |
| `Playwright` (browser headless) | indeed (fallback), simplyhired (listing) | Quando até `curl_cffi` falha — caro, só usado como último recurso |

**Importante**: independentemente do cliente, **toda chamada passa pelo `fetch()` ou `fetch_sync()`** que aplica rate-limit, retry e circuit breaker. Não tem engine fazendo request direto.

## Padrão "listing → detail"

A maioria das engines tem 2 fases:

### Fase 1: Listing
Busca a página de resultados com vários cards de vaga. Extrai dados básicos (URL, título, empresa) — chamamos isso de **seed**.

### Fase 2: Detail
Para cada link, busca a página individual da vaga e extrai o **JSON-LD** (`<script type="application/ld+json">`) — formato schema.org JobPosting. Daí saem descrição, skills, regime detalhado, etc.

Vantagem: dados muito mais completos. Desvantagem: faz N requests adicionais (um por vaga). Por isso o rate-limit é crítico.

## Por engine

### LinkedIn (`linkedin.py`)
- API pública guest `seeMoreJobPostings/search` para listing.
- Detail via `br.linkedin.com/jobs/view/{id}` parseando JSON-LD.
- Concorrência alta = 429 garantido. Mantemos 2-3 paralelas.
- **Constante `PARSER_VERSION`**: bump quando mudar parser → reenrichment automático nas vagas antigas.

### Indeed (`indeed.py`)
- Listing por stack, paginado.
- Detail com fallback para Playwright quando `curl_cffi` recebe 403.
- Heurísticas pesadas para inferir regime (CLT/PJ) de descrição livre — ver `_infer_regime_with_heuristics`.

### Jooble (`jooble.py`)
- HTML com `__INITIAL_STATE__` JSON embutido.
- Sem paginação real (XHR fechado pelo Cloudflare). Compensa com filtros ortogonais (`&date=1`, `&rgns=<UF>`).

### Gupy (`gupy.py`)
- API JSON pública `/api/v1/jobs?jobName=<stack>&limit=1000`.
- Uma chamada cobre quase tudo. Engine simples.

### GeekHunter (`geekhunter.py`)
- GraphQL pública `findShowcaseJobs` (uma chamada → até 1000 vagas).
- Sem batching: cobre o catálogo inteiro de uma vez.
- Detalhe HTML extraído via regex de `__next_f.push` (RSC do Next).

### Catho (`catho.py`)
- Listing por stack, blacklist/whitelist de termos para filtrar lixo (R, BI, Go ambíguos).
- Detail com `__NEXT_DATA__` ou JSON-LD.

### Careerjet (`careerjet.py`)
- Listing paginado, detail JSON-LD.

### BNE (`bne.py`)
- Sem busca por texto: só áreas hardcoded. Cobre `informatica` (única tech).
- `cloudscraper` para passar Cloudflare.

### Michael Page (`michaelpage.py`)
- Listing por categoria, sem JSON-LD no listing — links `/job-detail/` no DOM.
- Detail JSON-LD.

### Programathor (`programathor.py`)
- Site enxuto, listing+detail HTML simples.

### InfoJobs (`infojobs.py`)
- Listing por stack, detail JSON-LD.

### RemoteOK (`remoteok.py`)
- API JSON pública `/api`. Uma chamada cobre tudo.

### Remotive (`remotive.py`)
- API por categoria, 13 categorias hardcoded.

### WeWorkRemotely (`weworkremotely.py`)
- Múltiplos feeds RSS. 100% remoto, simples.

### Dice (`dice.py`)
- EUA, foco tech. Listing + detail JSON-LD.

### ZipRecruiter (`ziprecruiter.py`)
- UK. Só listing, sem detail (cards já trazem tudo).

### SimplyHired (`simplyhired.py`)
- Listing via Playwright (Cloudflare), detail via curl_cffi.

## Adicionando reenrichment a uma engine

Hoje só o **LinkedIn** tem `refetch_one(url)` que reprocessa vagas antigas. Para adicionar a outra engine:

1. No final do arquivo da engine, adicione:
   ```python
   async def refetch_one(url: str) -> list | None:
       seed = {"link": url, "title": "", ...}  # campos vazios
       ...  # mesmo fluxo do detail-fetch
       return apply_description_fallbacks(_merge_detail_over_seed(seed, detail))
   ```
2. Em `controllers/controllers.py`, em `_build_engine_registry()`, registre:
   ```python
   from ..engines import gupy as _gupy
   registry["gupy"] = {
       "parser_version": getattr(_gupy, "PARSER_VERSION", None),
       "refetch_one": getattr(_gupy, "refetch_one", None),
   }
   ```
3. Crie a constante `PARSER_VERSION = "gupy-2026.05.07"` no topo da engine.

A partir daí, qualquer bump do `PARSER_VERSION` aciona reenrichment automático para vagas antigas dessa engine.

Detalhes: [[CHECKPOINT_AND_DLQ#Reenrichment automático]].

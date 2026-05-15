---
title: ADR-003 - Indeed engine via listing JSON em vez de detail-fetch por vaga
tags: [adr, scraper, engines, indeed]
status: accepted
release: data_collection v2026.05
---

# ADR-003 - Indeed: extração via listing JSON

## Contexto

O engine `data_collection/src/engines/indeed.py` operava em duas fases:

1. **Listing**: paginar `https://br.indeed.com/empregos?q=<stack>&start=<N>` e coletar `data-jk` únicos.
2. **Detail-fetch**: para cada `jk`, GET em `https://br.indeed.com/viewjob?jk=<jk>`, parsear o `<script type="application/ld+json">` (`JobPosting` schema.org).

Auditoria empírica (lote de 10 stacks) mostrou:

- **Página 2 do listing redireciona para login** (`<title>Acessar | Contas Indeed</title>`). O Indeed só serve uma página anônima por busca → ~50 vagas únicas por stack. Com overlap entre stacks → **~65 vagas únicas por ciclo**.
- O **detail-fetch acumula rate-limit no Cloudflare**: depois de algumas dezenas de requisições, retorna o desafio "Security Check" (HTTP 200 com `<title>Security Check</title>`).
- Sem detector específico desse desafio, o `_parse_html_fallback` extraía `"Security Check"` como `job_title` e gravava no banco. **288 de 351 registros (82%) eram lixo** - campos `company`, `description`, `skills` vazios.

Tentativas insuficientes:
- **Multi-query por stack** (`&jt=fulltime`, `&jt=contract`, `&fromage=7`, `&l=`): subiu de 65 → 129 vagas reais, mas mantém o gargalo do detail-fetch.
- **Playwright fallback** + concorrência reduzida: melhora marginal, mas não escala.

## Decisão

Eliminar o detail-fetch como caminho principal. Extrair tudo do **listing JSON** que o Indeed embute em `window.mosaic.providerData['mosaic-provider-jobcards']`.

### Estrutura do blob

```js
window.mosaic.providerData['mosaic-provider-jobcards'] = {
  metaData: {
    mosaicProviderJobCardsModel: {
      results: [
        { jobkey, title, company, formattedLocation, jobLocationCity,
          jobLocationState, remoteLocation, jobTypes[], salarySnippet,
          pubDate, snippet, ... }, // ~15 vagas por listing
      ]
    }
  }
}
```

Cada listing = 1 request → ~15 vagas com **todos os campos críticos** já resolvidos. Sem rate-limit acumulado (1 request por (stack, variante) em vez de 1 + N).

### Camadas

1. **Listing JSON (caminho rápido, 100% sucesso)**: `_parse_jobcards(html)` extrai `title`, `company`, `location` (via `jobLocationCity/State` ou `remoteLocation`), `work_type`, `hiring_regime` (via `jobTypes` + heurísticas), `salary` (`salarySnippet.text`), `pubDate`, `snippet`, `skills`.

2. **Enrichment via detail-fetch (best-effort)**: substitui `description` (snippet ~200 chars) pelo texto completo da página de detalhe (~3000 chars) e mescla skills extraídas do texto integral. Concorrência baixa (2). **Auto-disable**: 8 falhas consecutivas desligam o enrichment pelo resto do ciclo - vagas restantes ficam com snippet em vez de bloquear o pipeline.

### Defesas em profundidade

- `_BLOCK_TITLE_RE` agora reconhece `Security Check`, `Just a moment`, `Attention Required`, `Acessar | Contas Indeed`, `Cloudflare`, `Checking your browser`.
- `_is_invalid_title()` rejeita títulos que claramente não são vagas (challenge/login/erro). Aplicado nos dois parsers (JSON-LD e HTML fallback) para nunca gravar lixo.
- `_LISTING_VARIANTS` reduzido a 3 (`&sort=date`, `&jt=fulltime`, `&jt=contract`) - economiza rate-budget e cobre os principais buckets do índice.

## Alternativas consideradas

1. **Mais variantes de listing + Playwright fallback no detail**: testado, sobe pra ~340 vagas mas com **288 corruptas** porque o Playwright também trafega o desafio. Custo operacional alto (Chromium, ~5 min/lote) sem ganho real.
2. **Migrar Indeed pra `httpx` + API Mobile (`m.indeed.com`)**: testado, retorna `FAIL` (Indeed bloqueia clientes não-Chrome). Inviável.
3. **Usar API JSON-LD da própria página de detalhe via `curl_cffi`**: era o que vinha sendo feito; falha pelo rate-limit acumulado.

## Consequências

### Métricas (10 stacks × 3 variantes)

| Versão | Vagas reais | Tempo | Lixo |
|---|---:|---:|---:|
| Detail-fetch (1 var, original) | 65 | ~30s | 0 |
| Multi-query + detail-fetch | 63 | 219s | **288** |
| **Listing JSON + enrichment opcional** | **~340** | ~96s/3 stacks | **0** |
| – delas, com description completa | ~94% | | |
| – delas, com snippet (rate-limit) | ~6% | | |

### Cobertura de campos pós-mudança (auditoria de 88 vagas)

| Campo | Cobertura |
|---|---:|
| `location_raw`, `country_code`, `work_type`, `description`, `skills`, `company`, `job_title` | 100% |
| `state_code` (excluindo remotos) | 100% |
| `hiring_regime` | 90.9% |

### Trade-offs

- **+** Sem rate-limit catastrófico - pior caso é description em snippet, não vaga perdida.
- **+** Mais vagas/lote (~5x), mais rápido (~3x quando enrichment está desabilitado).
- **+** Defesa robusta contra Cloudflare interstitials.
- **−** 6% das vagas terão snippet em vez de descrição completa (aceitável; seria 100% se não houvesse rate-limit).
- **−** Adiciona ~80 linhas no engine (parser do blob + state machine do enrichment).

### Padrão a propagar

Engines `curl_cffi` que sofrerem o mesmo sintoma (alta taxa de "lixo" por challenge no detail-fetch) devem ser auditadas e migradas pra extração via listing-JSON quando o site embutir os dados. Engines com listing-JSON nativo já: `simplyhired` (`__NEXT_DATA__`), `geekhunter` (GraphQL), `gupy`/`linkedin`/`remotive`/`remoteok` (APIs JSON públicas).

## Referências

- Implementação: [`data_collection/src/engines/indeed.py`](../../../data_collection/src/engines/indeed.py)
- Scripts de reparo: [`data_collection/repair_indeed.py`](../../../data_collection/repair_indeed.py), [`data_collection/backfill_indeed.py`](../../../data_collection/backfill_indeed.py)
- Persistência (3 sinks): [[scraper-persistence]]

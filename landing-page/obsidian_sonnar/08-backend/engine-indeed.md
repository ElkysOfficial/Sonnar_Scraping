---
title: Engine Indeed — listing JSON + enrichment opcional
tags: [backend, scraper, engines, indeed]
updated: 2026-05-06
---

# Engine Indeed

Implementação em `data_collection/src/engines/indeed.py`.

## Estratégia

Híbrida em 2 camadas:

1. **Listing JSON (caminho rápido)** — extrai todas as vagas do blob
   `window.mosaic.providerData['mosaic-provider-jobcards']` que o Indeed
   embute no HTML do listing. Cada `(stack, variante)` retorna ~15 vagas
   com `title`, `company`, `location`, `work_type`, `hiring_regime`,
   `salary`, `pubDate` e `snippet` (descrição preview).

2. **Detail enrichment (best-effort)** — para cada vaga já extraída do
   listing, tenta GET na página de detalhe e substituir o snippet pela
   descrição completa (3000+ chars). Concorrência baixa (2). Auto-disable
   após 8 falhas seguidas — vagas restantes ficam com snippet.

Detalhes em [[../12-decisions/ADR-003-indeed-listing-json-extraction]].

## Variantes do listing

Indeed BR exige login a partir da página 2 (`start=50` redireciona).
Compensamos com 3 buscas por stack, cada uma traz uma "primeira página"
diferente:

| Variante | Filtro |
|---|---|
| `&sort=date` | mais recentes |
| `&jt=fulltime` | tempo integral |
| `&jt=contract` | PJ/contractor |

## Heurísticas de `hiring_regime`

Pipeline em 3 camadas no `_infer_regime_with_heuristics`:

1. **Sinais explícitos** (`_REGIME_PATTERNS`): CLT, PJ, contractor,
   full-time contract, part-time, estágio, jovem aprendiz, temporário.
2. **Sinais derivados**:
   - ≥ 2 benefícios trabalhistas (VR, VA, VT, plano, 13º, FGTS) → CLT.
   - Moeda estrangeira / salário anualizado (USD, `/year`) → PJ.
3. **Default por `work_type`** (apenas quando silente):
   - Presencial / Híbrido → CLT (padrão legal BR).
   - Remoto → vazio (ambíguo demais).

Ordem de prioridade na regex de PJ: `Full-time Contract` casa **antes** de
`full-time` sozinho — evita classificar contractor como CLT.

## Defesas anti-Cloudflare

- `_BLOCK_TITLE_RE`: detecta `Security Check`, `Just a moment`,
  `Attention Required`, `Acessar | Contas Indeed`, `Cloudflare`,
  `Checking your browser`.
- `_BLOCK_BODY_RE`: pega challenge body mesmo quando o `<title>` é
  enganoso.
- `_is_invalid_title()`: rejeita títulos que claramente não são vagas
  (challenge, login, erro 404/403/503). Aplicado nos dois parsers
  (JSON-LD e HTML fallback) — garantia de que lixo nunca chega ao banco.
- Fallback Playwright via `src/utils/browser_fetch.py` (lazy-import,
  Playwright é dependência opcional).

## `country_code` sempre presente

Indeed BR é, por construção, vagas no Brasil. O parser garante que mesmo
remotas e silentes recebam `country_code='BR'` via sentinel
`location=["Remoto", "Brasil"]` que o `location_normalizer` resolve por
substring match contra `COUNTRY_NAMES`.

## Scripts de operação

- `data_collection/repair_indeed.py` — re-fetch das vagas com
  `job_title='Security Check'` ou outros sinais de challenge. Substitui
  no JSON e no Supabase; remove se não conseguir recuperar.
- `data_collection/backfill_indeed.py` — preenche campos vazios
  (`location_raw`, `country_code`, `hiring_regime`) em vagas Indeed
  já persistidas, usando o engine atualizado.

Ambos rodam isoladamente:

```bash
cd data_collection
python repair_indeed.py
python backfill_indeed.py
```

## Cobertura medida (auditoria de 88 vagas pós-mudança)

| Campo | Cobertura |
|---|---:|
| `location_raw` | 100% |
| `country_code` | 100% |
| `state_code` (não-remoto) | 100% |
| `hiring_regime` | 90.9% |
| `description` | 100% (94% completa, 6% snippet) |
| `skills`, `company`, `job_title`, `work_type` | 100% |

## Referências

- Código: [`data_collection/src/engines/indeed.py`](../../../data_collection/src/engines/indeed.py)
- Persistência: [[scraper-persistence]]
- Decisão arquitetural: [[../12-decisions/ADR-003-indeed-listing-json-extraction]]

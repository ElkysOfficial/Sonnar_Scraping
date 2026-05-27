---
title: Redução de vCPU pico (73% → 50%) — roteiro de PRs
tags: [issue, performance, vps, infra]
severity: high
status: open
---

# Redução de vCPU pico (73% → 50%) — roteiro de PRs

## Contexto

Issue operacional de acompanhamento do objetivo formalizado em [[../12-decisions/ADR-006-vps-load-reduction-target]]. Centraliza o status de execução dos PRs e o progresso vs meta.

**Baseline (27/05/2026):**

- vCPU médio: 50%
- vCPU pico: **73%**
- RAM: 28%
- Processos PM2 ativos: 4 (`sonnar-core`, `sonnar-wa-formatter`, `sonnar-wa-sender`, `sonnar-scraper`). O `sonnar-backfill` está parado.

**Meta:** vCPU pico ≤ 50%, RAM em queda relevante.

## Reprodução / como medir

```bash
pm2 monit                # painel ao vivo CPU/RAM por processo
pm2 status               # snapshot com restarts
free -m                  # RAM total (Linux)
```

Janela de pico observada: ciclo VIP do `sonnar-wa-sender` (a cada 30min em `vipJobSender.js:61`) coincidindo com lote ativo do `sonnar-scraper`.

## Impacto

- Margem atual (27pp) é fictícia frente à fila de features (Plus + CV em [[../03-features/plus-match-breakdown-cv]], v3.0.0 com Telegram + Discord + Sentry).
- Risco real de `max_memory_restart` em loop se feature nova entrar sem otimização prévia.
- Bloqueia possibilidade de **downgrade** futuro da VPS (8GB → 4GB).

## Roteiro de PRs

### PR1 — Canvas (formatter)

**Decisão pendente entre dois níveis:**

| | Nível 1 — Cache em disco local | Nível 2 — `@vercel/og` |
| --- | --- | --- |
| Esforço | ~1 dia | 1–2 dias |
| Mudança | Salva PNG em `assets/cache/<job_id>.png` na primeira render; próximas leem do disco | Função no portal Vercel; CDN cacheia por URL; sender aponta para URL pública |
| Ganho CPU formatter no pico (estimativa) | -90% | -100% (processo sai da VPS) |
| Ganho RAM teto | 0 (processo continua) | -500MB (processo deletado do PM2) |
| Disco extra | ~1,8GB (100KB × 18k vagas) | 0 |
| Latência primeira render | inalterada | +200–400ms (cacheado depois) |
| Reversibilidade | trivial | exige rollback de integração no sender |

**Status:** ⏸️ Aguardando decisão de Lucelho entre Nível 1 e Nível 2 antes de abrir branch.

### PR2 — Scraper

Itens independentes, podem virar PRs separados ou um único:

- **Pool de browser único** entre engines que usam Playwright (`linkedin.py`, `indeed.py`, `simplyhired.py`, `bne.py`). Hoje cada uma sobe seu Chromium → até 4 processos filhos fora do `max_memory_restart`. Estimativa: -450–600MB RAM, -CPU de spin-up por ciclo.
- **`--disable-images --disable-css`** no Chromium. Extração usa JSON-LD / HTML — layout/imagens não são necessários. Estimativa: -30–50% CPU do Chromium por página.
- **Tier de engines por frequência**: BNE, michaelpage, weworkremotely, programathor rodam 1×/dia em cron noturno em vez de todo ciclo. Estimativa: -30–40% trabalho médio em horário comercial.
- **Cron de restart 2×/dia** (4h e 16h) em vez de só 4h. Defrag mais frequente da heap CPython.
- **Reduzir `CAREERJET_COUNTRY_BATCH_SIZE`** (alavanca já existente em `.env`).

**Status:** ⏸️ Aguardando PR1 entrar para liberar foco.

### PR3 — Core

- Investigar se ainda há parse pesado por request além da migração `jobs.json` → SQLite da v3.1.0 (ver [[../12-decisions/ADR-005-message-formatting-core-jobs-json]]).
- Verificar `/jobs/pending` e `/cards/generate` para re-leituras desnecessárias.

**Status:** ⏸️ Pode ser pequeno; vale 1 leitura focada depois de PR1+PR2.

## Mitigação atual

- `max_memory_restart` por processo no `ecosystem.config.cjs` reinicia individualmente em vez de derrubar a máquina.
- Cron diário de restart do scraper às 4h (defrag de heap CPython — documentado em `OPERACAO.md:167`).
- Swap de 2GB como rede de segurança (`OPERACAO.md:149`).

## Plano

1. Decidir Nível 1 vs Nível 2 do PR1 (bloqueador atual).
2. Medir baseline detalhado por processo em janela de pico real (`pm2 monit`).
3. Abrir branch do PR1 seguindo padrão `feature/<descricao-kebab>` ([[../12-decisions/ADR-006-vps-load-reduction-target]]).
4. Cada PR registra ganho medido na descrição. Atualizar esta nota com progresso vs meta após merge.
5. Quando meta atingida, mover para `_resolved/` e atualizar [[../11-performance/index]].

## Relações

- [[../12-decisions/ADR-006-vps-load-reduction-target]] — decisão formal (este issue é o tracker operacional).
- [[../12-decisions/ADR-007-translation-inline-policy]] — política complementar que limita o teto de economia de RAM no scraper.
- [[../03-features/plus-match-breakdown-cv]] — feature em espera deste roteiro.
- [[untranslated-jobs-gap]] — gap relacionado.
- [[../09-infra/index]] — visão de infra.

## Referências

- `OPERACAO.md:113-198` — orçamento de RAM e operação do PM2.
- `ecosystem.config.cjs` — tetos atuais de `max_memory_restart`.
- `apps/whatsapp/formatter/src/services/cardGenerator.js` — alvo do PR1.
- `apps/scraper/src/engines/{linkedin,indeed,simplyhired,bne}.py` — alvos do PR2 (pool de browser).

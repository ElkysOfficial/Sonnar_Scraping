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

> ⚠️ Após o merge do PR de texto-only (v3.6.0) os processos ativos passam a ser **3**: `sonnar-core`, `sonnar-wa-sender`, `sonnar-scraper`. Baseline pós-deploy a ser remedido.

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

### PR1 — Canvas (formatter) ✅ resolvido pela via mais direta: removido

**Decisão final (v3.6.0):** geração de imagem foi **descontinuada** do produto. Todas as vagas passam a ser enviadas como **texto puro** no WhatsApp. As informações que ficavam no card visual (salário, modalidade, fonte, data) entram no próprio texto.

Caminho percorrido:
1. PR #100 (v3.5.0) tentou migrar canvas pra Vercel Edge Function (`@vercel/og`).
2. PR #101 (v3.5.1) corrigiu erro de runtime no `vercel.json`.
3. Antes de configurar Vercel/DNS, Lucelho decidiu que **com 1 cliente VIP** o card visual não justifica o custo de manter outro vendor + infra. Texto puro entrega a mesma informação, custa zero compute e elimina a dependência inteira.
4. PR de reversão + transição: `git revert` dos #100 e #101 + novo PR removendo o formatter de vez e refatorando o sender pra mandar texto.

**Mudanças resultantes na VPS:**
- Processo `sonnar-wa-formatter` removido do `ecosystem.config.cjs` (-1 PM2, -600MB de teto).
- `apps/whatsapp/formatter/` deletado do repo.
- `@napi-rs/canvas` sai do disco.
- `apps/whatsapp/sender/src/services/textBuilder.js` (novo) monta a mensagem completa em texto.
- `apps/whatsapp/sender/src/services/coreClient.js` (novo) — sender fala direto com o core, sem middleman.
- `vipJobSender.js` e `cardJobSender.js` enviam com `{ text }` em vez de `{ image, caption }`.

**Métrica:** rodar `pm2 monit` 24h pós-deploy em prod e atualizar esta nota com delta real de vCPU/RAM.

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

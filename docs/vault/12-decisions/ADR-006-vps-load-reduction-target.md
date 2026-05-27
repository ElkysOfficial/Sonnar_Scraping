---
title: ADR-006 — Meta de redução de carga na VPS (vCPU pico 73% → 50%)
tags: [adr, decisions, vps, infra, performance, scraper, formatter, core]
status: accepted
release: 2026-Q2
---

# ADR-006 — Meta de redução de carga na VPS (vCPU pico 73% → 50%)

## Contexto

A VPS de produção (8GB RAM, Ubuntu 24.04, PM2 com 5 processos definidos no [[../09-infra/index|ecosystem]]) opera hoje com baseline desconfortável:

- **vCPU médio:** 50%
- **vCPU em pico:** **73%**
- **RAM:** 28%

Picos vêm majoritariamente de três processos:

- **`sonnar-scraper`** — carrega Argos + Stanza + Torch + Playwright (Chromium). Teto `max_memory_restart` em 2048MB.
- **`sonnar-wa-formatter`** — `@napi-rs/canvas` gerando PNG 1080×1080 por delivery (`apps/whatsapp/formatter/src/services/cardGenerator.js`). Sem cache — cada delivery rasteriza a mesma vaga novamente. Teto 600MB.
- **`sonnar-core`** — `JSON.parse` do `jobs.db` (SQLite desde v3.1.0) por request. Já melhorou significativamente vs `jobs.json`, mas ainda oscila. Teto 512MB.

O `sonnar-backfill` (5º processo) **não está mais rodando** — entrou em desuso após estabilização de v3.x. Argos/Stanza/Torch só são carregados em `sonnar-scraper` agora.

A margem de 27pp de vCPU pode parecer confortável, mas é fictícia quando se considera a fila de features planejadas:

- **Plus** — match breakdown + CV upload (ver [[../03-features/plus-match-breakdown-cv]])
- **v3.0.0** — Telegram, Discord reativado, observabilidade (Sentry)
- **v4+** — recomendação IA, dashboard analítico

Qualquer feature nova tem risco real de empurrar pico além de 80–85% e acionar restart loop de `max_memory_restart`.

## Decisão

Estabelecer como **objetivo central e primordial** do trabalho de infra/performance da próxima onda:

- **Meta primária:** reduzir vCPU em pico de **73% → 50%** (queda mínima de 23pp).
- **Meta secundária:** reduzir uso de RAM (sem alvo numérico fixo — qualquer queda relevante conta).
- **Foco:** os três processos identificados (`sonnar-scraper`, `sonnar-wa-formatter`, `sonnar-core`). Em ordem de ROI: formatter (canvas) → scraper (Chromium/translation) → core (residual).

Qualquer decisão técnica nesta linha de trabalho é avaliada pela pergunta: **"isso me aproxima de 50% de pico?"** Se a resposta é "não" ou "marginal", desprioriza.

Encadeamento de PRs aprovado (detalhes em [[../13-issues/vps-cpu-peak-reduction]]):

1. **PR1 — Canvas:** dois caminhos avaliados (Nível 1: cache em disco local por `job_id` / Nível 2: migrar para `@vercel/og`). Decisão entre os dois ainda pendente.
2. **PR2 — Scraper:** pool de browser único entre engines Playwright, `--disable-images/css` no Chromium, tier de engines por frequência (rodar BNE/michaelpage/weworkremotely/programathor 1×/dia em cron noturno), cron de restart 2×/dia.
3. **PR3 — Core:** investigar se ainda há parse pesado por request além da migração `jobs.json` → SQLite da v3.1.0.

Features novas (incluindo [[../03-features/plus-match-breakdown-cv]]) **não entram** antes do roteiro avançar materialmente.

## Alternativas consideradas

1. **Upgrade da VPS para 16GB / mais vCPU** — rejeitada. Trata sintoma, não causa. Aumenta custo recorrente e mascara ineficiências estruturais (rasterização repetida, modelos NLP carregados sem necessidade contínua, Chromium sem otimização). Bloqueia o caminho oposto desejado: downgrade futuro para 4GB após otimização.
2. **Cortar features planejadas para caber na VPS atual** — rejeitada. Plus + CV é diferencial de produto importante; v3.0.0 já está parcialmente prometido. Bloquear roadmap por capacidade é solução defensiva quando a causa raiz (carga ineficiente) é tratável.
3. **Mover canvas para sender com `node-canvas` inline** — rejeitada. Não reduz carga total, só redistribui. E `sender` (Baileys) já tem perfil próprio de crescimento de RAM ao longo do tempo.
4. **Mover Argos para Edge Function** — rejeitada por inviabilidade técnica: Edge é Deno (JS/TS), Argos é Python puro; modelos 100–250MB cada vs limite de 10MB de bundle; cold-start de 2–5s para carregar modelo inviabiliza throughput.
5. **Substituir Argos por API gerenciada (DeepL/Google Translate)** — adiada, não rejeitada. Conflita com [[ADR-007-translation-inline-policy]] que mantém Argos como motor. Pode ser revisitada se a meta deste ADR não for atingida só com otimizações de scraper.
6. **Remover canvas e mandar texto puro no WhatsApp** — rejeitada. Card é o diferencial visual do Plus; descaracteriza produto.
7. **Cortar todas engines internacionais** ("só BR") — rejeitada. Perde público pagante de vaga remota internacional, segmento que valida ticket Plus.

## Consequências

**Positivas:**

- Ganho de orçamento real para a fila de features sem upgrade de hardware.
- Abre caminho para **downgrade** futuro da VPS (8GB → 4GB) com economia recorrente.
- Documenta um critério de aceite mensurável (`vCPU pico ≤ 50%`) para a frente de performance, que hoje é stub em [[../11-performance/index]].
- Reduz risco de incidente OOM/restart loop quando features novas entrarem em produção.

**Negativas / risco aceito:**

- **Custo de oportunidade**: PRs de otimização consomem 1–2 semanas que poderiam ir para feature. Aceito como pré-requisito.
- **Latência adicional em canvas migrado para Edge** (se Nível 2 for escolhido): primeira renderização +200–400ms; cacheado depois. Aceitável vs ganho de processo deletado da VPS.
- **Tier de engines noturnas** introduz atraso de até 24h em vagas dessas fontes — aceitável porque são engines de baixo turnover (BNE/michaelpage/weworkremotely/programathor).
- Métricas precisam ser **medidas com `pm2 monit` antes e depois** de cada PR — não confiar em estimativa. Custa disciplina operacional.

## Plano de follow-up

1. Decidir entre Nível 1 e Nível 2 do PR1 (Canvas) — bloqueador atual do início do roteiro.
2. Medir baseline detalhado por processo com `pm2 monit` em janela de pico real (não estimativa).
3. Cada PR registra ganho medido em sua descrição. [[../13-issues/vps-cpu-peak-reduction]] é o lugar único de acompanhamento do progresso vs meta.
4. Quando meta de 50% for atingida, atualizar [[../11-performance/index]] saindo do estado "stub" e abrir discussão de downgrade de VPS.

## Relações

- [[ADR-007-translation-inline-policy]] — política complementar; mantém Argos no scraper, o que limita até onde dá pra cortar memória do scraper.
- [[../13-issues/vps-cpu-peak-reduction]] — issue de acompanhamento operacional do roteiro de PRs.
- [[../13-issues/untranslated-jobs-gap]] — gap de produto que interage com ADR-007.
- [[../03-features/plus-match-breakdown-cv]] — feature que aguarda este roteiro avançar.
- [[../11-performance/index]] — MOC de performance (stub atual; será atualizado).
- [[../09-infra/index]] — visão de infra, PM2 e tetos de memória.

## Referências

- `OPERACAO.md:113` — orçamento de RAM por processo PM2 e justificativas dos tetos.
- `apps/whatsapp/formatter/src/services/cardGenerator.js:14-23` — uso atual do `@napi-rs/canvas` (PNG 1080×1080 sem cache).
- `apps/scraper/requirements.txt:28` — Argos + dependências transitivas (Stanza, Torch).
- `apps/whatsapp/sender/src/services/vipJobSender.js:1917` — caminho `POST /cards/generate` que dispara render por delivery.
- `packages/message-formatting-core` — core e migração para SQLite na v3.1.0.

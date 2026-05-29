---
title: Estratégias de redução de vCPU e RAM na VPS
tags: [performance, vps, infra, scraper, formatter, core, strategies, brainstorm]
---

# Estratégias de redução de vCPU e RAM na VPS

> **Catálogo completo** de alavancas avaliadas para atingir o objetivo central de [[../12-decisions/ADR-006-vps-load-reduction-target]] (vCPU pico 73% → 50%, RAM em queda). Inclui estratégias aceitas, em consideração e descartadas, com o "porquê" de cada uma. Mantida viva — quando uma estratégia evolui (testada, aplicada, descartada), atualizar aqui.

## Contexto

**Baseline (27/05/2026):**

- vCPU médio: 50% · pico: **73%** · RAM: 28%
- VPS: 8GB Ubuntu 24.04, PM2 com 4 processos ativos (`sonnar-core`, `sonnar-wa-formatter`, `sonnar-wa-sender`, `sonnar-scraper`; `sonnar-backfill` parado).
- Picos vêm de: `sonnar-scraper` (Argos + Chromium), `sonnar-wa-formatter` (canvas sem cache), `sonnar-core` (parse SQLite por request — menor que era).

**Pré-requisito de qualidade**: política de tradução inline obrigatória ([[../12-decisions/ADR-007-translation-inline-policy]]) está em vigor. Qualquer estratégia que envolva mexer em tradução deve respeitar isso — Argos fica no scraper; alternativas que conflitem precisam de ADR próprio.

---

## 1. Frente Canvas (formatter)

### 1.0 ✅ APLICADO: remover geração de imagem (texto puro)

Decisão final (v3.6.0): card visual descontinuado. Vagas passam a ir como **texto WhatsApp puro** com toda a informação que antes vivia na imagem (título, empresa, location, modalidade, salário em destaque, skills, responsabilidades, fonte e data no rodapé).

- **Ganho:** processo `sonnar-wa-formatter` **removido da VPS** (-1 PM2, -600MB de teto). Zero compute de rasterização. Zero dependência externa (vs Vercel Edge).
- **Trade-off de produto:** perde o apelo visual do card. Aceito porque (a) só há 1 cliente VIP hoje, (b) toda info crítica está no próprio texto, (c) elimina vendor novo e custos recorrentes.
- **Implementação:** `apps/whatsapp/sender/src/services/textBuilder.js` monta a mensagem completa local. `coreClient.js` busca vagas direto do core (sem middleman). `vipJobSender.js` e `cardJobSender.js` enviam com `{ text }`.

### 1.1 Cache em disco local por `job_id` ❌ descartado

Superado pela decisão 1.0 acima. Cache em disco só fazia sentido se o card visual fosse mantido.

### 1.2 Migrar para `@vercel/og` ❌ revertido (PR #100 e #101)

Tentado em v3.5.0 e revertido em v3.6.0. Motivo: introduzir Vercel como vendor + configurar DNS + manter HMAC compartilhado não se justifica pra 1 cliente quando texto puro entrega a mesma informação útil sem nenhuma dessas camadas. Mantemos a opção arquivada caso Sonnar volte a ter público amplo que se beneficie de card visual.

### 1.3 Reduzir resolução 1080→800 🟡 baixo ganho isolado

WhatsApp re-comprime acima de 800px. Render perceptualmente idêntico.

- **Ganho:** -45% CPU/RAM por render. Combinado com 1.1 ou 1.2 fica irrelevante.
- **Considerar apenas** se 1.1/1.2 não forem aplicados.

### 1.4 Pré-gerar cards no horário ocioso 🟡 baixo ganho marginal

Quando o sender termina o ciclo VIP (25min idle entre ciclos de 30min), o formatter pré-renderiza candidatos do próximo ciclo.

- **Ganho:** distribui pico em platô. Menos efetivo que cache, mais código.
- **Útil apenas se** decidir manter formatter sem cache (descartado).

### 1.5 Substituir gradient por flat color 🟡 estético

Gradient é caro no canvas. Cor única por header reduz CPU mas muda design.

- **Decisão de produto, não técnica.** Default: manter design.

### 1.6 Template PNG + overlay de texto (sharp/pdf-lib) 🟡 considerado e desencorajado

Pré-renderiza 1 PNG vazio com gradient/logo/layout; runtime escreve só texto por cima.

- **Ganho:** rasterização de gradient/ícones some.
- **Mas:** ainda renderiza por delivery. Menos eficiente que 1.1 ou 1.2 quando a mesma vaga vai pra vários assinantes.
- **Usar apenas se** quiser manter compute na VPS e cada vaga for entregue 1×.

### 1.7 ❌ Remover canvas e mandar texto puro

Perde diferencial visual do Plus. **Descartado.**

---

## 2. Frente Scraper

### 2.1 Pool de browser único entre engines Playwright 🟢 considerado

Hoje `linkedin.py`, `indeed.py`, `simplyhired.py`, `bne.py` instanciam Chromium próprio. Compartilhar 1 browser global, 1 BrowserContext por engine.

- **Ganho:** -3 processos Chromium = -450–600MB RAM (fora do `max_memory_restart`), -CPU de spin-up.
- **Risco:** acoplamento entre engines (crash de uma pode afetar contexto da outra — mitigável com try/finally).
- **Esforço:** médio (touch em 4 arquivos + lifecycle).

### 2.2 `--disable-images --disable-css` no Chromium 🟢 considerado

Extração usa JSON-LD/HTML. Layout/imagens não são necessários.

- **Ganho:** -30–50% CPU do Chromium por página.
- **Risco:** baixo (extração não depende de render visual). Cuidado com engines que esperam DOM ready após CSS.
- **Esforço:** 1 linha por engine.

### 2.3 Tier de engines por frequência 🟢 considerado

Engines de baixo turnover (BNE, michaelpage, weworkremotely, programathor) rodam 1×/dia em cron noturno em vez de todo ciclo.

- **Ganho:** -30–40% trabalho médio em horário comercial.
- **Custo:** vagas dessas fontes ganham até 24h de atraso.
- **Esforço:** ajuste no orquestrador + cron.

### 2.4 Cron de restart 2×/dia 🟢 considerado

Adicionar 16h ao restart de 4h. Defrag mais frequente da heap CPython.

- **Ganho:** picos secundários ficam menores.
- **Custo:** ~10s de gap na coleta.
- **Esforço:** 1 linha no crontab.

### 2.5 Reduzir `CAREERJET_COUNTRY_BATCH_SIZE` 🟢 alavanca já existente

Menos países por lote = menos modelos Argos carregados simultaneamente.

- **Ganho:** linear no consumo do careerjet.
- **Custo:** ciclo mais longo (mais ciclos pra cobrir todos os países).
- **Esforço:** mudança de `.env`.

### 2.6 Compartilhar modelos Argos entre engines 🟡 a investigar

`translator.py:148` tem `prepare()` por idioma. Garantir que cada par de idioma é carregado uma única vez no processo (não por engine).

- **Ganho:** estrutural quando ADR-007 espalhar tradução pra 8 engines novas.
- **Esforço:** auditoria + possível refator do singleton.

### 2.7 Headless mais agressivo: `chromium` → `playwright-firefox` ou HTTP puro 🔴 trade-off

Algumas engines (linkedin, indeed) podem ter alternativas via API/JSON-LD sem browser. Já há ADR-003 (indeed via listing JSON).

- **Ganho:** elimina Chromium daquela engine.
- **Risco:** maior — depende de cada engine. Quebra se a fonte mudar.
- **Esforço:** alto por engine, mas vale revisitar 1–2 candidatos.

### 2.8 ❌ Substituir Argos por DeepL/Google Translate

Adiada. Conflita com [[../12-decisions/ADR-007-translation-inline-policy]] que mantém Argos. Reabrir só se objetivo de ADR-006 não for atingido com 2.1–2.7.

---

## 3. Frente Core

### 3.1 Auditar parse por request 🟡 a investigar

Migração `jobs.json` → SQLite (v3.1.0 — [[../12-decisions/ADR-005-message-formatting-core-jobs-json]]) já cortou o pior. Verificar `/jobs/pending` e `/cards/generate`.

- **Ganho:** desconhecido até medir.
- **Esforço:** 1 leitura focada do `server.js`.

### 3.2 Prepared statements + better-sqlite3 em modo WAL 🟡 a verificar

Se ainda não está em WAL mode, ganho de concorrência leitura/escrita.

- **Ganho:** elimina locks no caminho de leitura.

---

## 4. 🆕 Frente Multi-banco / Cache / Fila

Estratégia levantada por Lucelho em 27/05/2026: **usar bancos adicionais se ajudar a derrubar o pico**.

> 🌟 **Princípio operacional (27/05/2026):** Tudo que puder rodar fora da VPS deve rodar fora. Mover workload para fora **remove** carga (vs apenas otimizar dentro). MySQL no Hostinger já está incluso no plano de hospedagem — uso livre, sem custo adicional.

### Recursos externos disponíveis

| Recurso | Custo | Bom para |
| --- | --- | --- |
| **MySQL Hostinger** | já pago | SQL transacional, estado de bot, tabelas de log/history, eventualmente `jobs.db` |
| **Supabase Postgres** | já pago (free/pro) | RLS, JSONB+GIN, pg_cron, Edge Function triggers |
| **Supabase Storage** | já pago | CVs, futuros uploads |
| **Supabase Edge Functions** | já pago | parse stateless, jobs sob demanda |
| **Vercel** (`@vercel/og`, Cron, KV) | free tier generoso | render edge, cron declarativo, KV |
| **Upstash Redis** | free tier | cache HTTP, estados efêmeros |

### 4.1 Cache em Redis (Upstash) na frente do core 🟢 alto ROI potencial

Hoje toda request ao core parseia SQLite. Pôr Redis (Upstash free tier, fora da VPS) na frente cacheando respostas idempotentes (`/jobs/pending` por critério, `/cards/preview`).

- **Ganho:** corta CPU do core no caminho quente. Egress idem.
- **Custo:** dependência externa (free tier cobre o volume; risco de upgrade $ se crescer).
- **Risco:** invalidação. Solução: TTL curto (60–300s) + invalidação em `POST /jobs/status`.
- **Esforço:** médio (cliente Redis + camada de cache).
- **Onde mora o Redis:** Upstash (HTTP, edge-friendly) ou Redis Cloud. **Não na VPS**.

### 4.2 Estados efêmeros do sender em Redis 🟡 considerado

Cooldown por subscriber, locks de ciclo, history de vagas enviadas recentemente — hoje em arquivos JSON locais ou Postgres. Migrar para Redis com TTL nativo.

- **Ganho:** menos I/O de arquivo, menos hits em Postgres.
- **Custo:** mesmo Redis de 4.1 (não adiciona dependência).
- **Esforço:** médio.

### 4.3 Read replica de Supabase Postgres 🟡 condicional

Só faz sentido **se** o gargalo for I/O de Postgres (a confirmar com `pm2 monit` + métricas Supabase). Sender e web leem da replica; scraper escreve no primário.

- **Ganho:** elimina contenção writer × readers.
- **Custo:** plano Supabase pago (read replica é feature paga).
- **Decisão pendente:** validar com métricas antes de pagar upgrade.

### 4.4 Cold storage para vagas antigas 🟡 considerado

Vagas com `expires_at < now() - 30 dias` movem para tabela `jobs_archive` (ou banco separado).

- **Ganho:** índices da `jobs` ativa ficam menores → queries mais leves no core e no scraper (dedup).
- **Risco:** complica analytics histórico. Mitigável com VIEW UNION.
- **Esforço:** médio (migration + cron mensal).

### 4.5 Fila intermediária scraper → core 🟡 considerado

Hoje scraper faz `POST /jobs/batch` direto no core (`OPERACAO.md:27`). Se o core está sob pico, ele "trava" o scraper.

- **Alternativas:** LISTEN/NOTIFY do Postgres, Redis stream, Upstash QStash.
- **Ganho:** desacopla picos. Scraper sempre tem para onde mandar.
- **Custo:** complexidade nova.
- **Considerar apenas** se o `POST /jobs/batch` for confirmado como gargalo (medir antes).

### 4.6 🆕 Migrar `jobs.db` (SQLite local) para MySQL Hostinger 🟢 alto ROI estrutural

Hoje `sonnar-core` é o único escritor do `jobs.db` SQLite local (ver [[../12-decisions/ADR-005-message-formatting-core-jobs-json]]). Migrar para MySQL no Hostinger.

- **Ganho:** core fica **stateless** em disco. Reduz I/O da VPS, libera disco, abre caminho para múltiplos cores no futuro (HA).
- **Custo:** latência por query passa de ~microssegundos (file) para ~1–5ms (rede intra-Hostinger). Aceitável no perfil de uso (poucas req/s).
- **Risco:** migração precisa ser cuidadosa — todo o pipeline `scraper → core → bots` depende deste banco. Janela de manutenção curta + script idempotente.
- **Dependência:** confirmar latência VPS↔MySQL Hostinger (devem estar no mesmo DC; se sim, ótimo).
- **Esforço:** médio. Schema migration + cliente MySQL no core + testes.

### 4.7 🆕 Estado do sender (Baileys) em MySQL Hostinger 🟢 alto ROI

Hoje sender mantém arquivos JSON locais (`database/prefix-groups.json`, `database/config.json`) e usa Supabase para outras tabelas (`vip_history`, `sender_state`, etc).

Migrar para MySQL Hostinger:
- `vip_history` (registro de vagas enviadas por subscriber + cooldown)
- `sender_state` (cycle locks, last_run timestamps)
- `prefix_groups`, `config` (atualmente JSON files)
- `group_features`, `auto_responders` (atualmente Supabase)

- **Ganho:** elimina I/O de arquivo JSON da VPS, reduz pressure no Supabase (libera row budget se em tier free), state survive restart do PM2 com latência menor que filesystem (rede local Hostinger).
- **Custo:** dois bancos a manter (Supabase + MySQL). Trade aceitável dado o princípio "fora da VPS".
- **Esforço:** médio-alto. Migrar 6 funções de `database.js` + JSON files.

### 4.8 🆕 Tabelas de log/analytics em MySQL Hostinger 🟡 considerado

`extraction_observability`, `vip_delivery_snapshot`, `extraction_queue`, `extraction_admin_actions` — tabelas de alta cardinalidade que vão crescer indefinidamente.

- **Ganho:** alivia Supabase Postgres (limite de rows no free, custo no pro). Mantém Supabase enxuto para o caminho transacional.
- **Custo:** queries analíticas cross-DB ficam mais complexas. Mitigável com export periódico para um DW eventualmente.
- **Considerar quando** essas tabelas passarem de N rows (a definir).

### 4.9 Vercel KV para cache do canvas (sinergia com 1.2) 🟢 zero-trabalho-extra

Se 1.2 (`@vercel/og`) for aplicado, o cache já está implícito na CDN. Não precisa configurar nada.

### 4.7 ❌ Banco local separado por bot (Discord vs WhatsApp)

Dividir o `jobs.db` em dois SQLites: um por canal. **Descartado** — multiplica complexidade sem ganho real; o problema não é o DB, é a rasterização.

---

## 5. Frente Workflows / Vercel Functions / Cloud

### 5.1 Match score em Edge Function ❌ descartado

Match roda em batch (a cada 30min, não por request). Mover para Edge significaria invocação por subscriber × por vaga em ciclo curto — não cabe no perfil edge.

### 5.2 ✅ CV parsing em Edge Function

Já decidido em [[../03-features/plus-match-breakdown-cv]] (Caminho B). Reforça a estratégia de "tudo que não precisa estar na VPS, sai".

### 5.3 Vercel Cron para o `pg_cron` mensal de breakdown 🟡 alternativa

`pg_cron` no Supabase já cobre. Vercel Cron seria redundante.

### 5.4 Workflow DevKit (WDK) para o ciclo VIP do sender 🟡 reescrita ambiciosa

Migrar o loop VIP (`vipJobSender.js`) para WDK do Vercel — durável, retries automáticos, fora da VPS. Bot Baileys permanece (precisa de conexão persistente), mas a orquestração de "quem recebe qual vaga e quando" fica fora.

- **Ganho:** processo `sonnar-wa-sender` fica mais magro (só Baileys + handlers de comando).
- **Custo:** reescrita não-trivial. Mudança arquitetural grande.
- **Status:** ideia para horizonte v4+.

---

## 6. Frente Hardware / Plano

### 6.1 Upgrade VPS para 16GB ❌ descartado

Trata sintoma, não causa. Mascara ineficiência estrutural. Bloqueia o caminho oposto (downgrade após otimização).

### 6.2 Downgrade VPS para 4GB 🟢 ✨ objetivo de longo prazo

Após meta de ADR-006 atingida, downgrade vira opção concreta com economia recorrente.

---

## 7. Estratégia recomendada (rollout faseado)

**Fase 1 — Ganho rápido sem mexer em arquitetura (1 semana):**

1. Aplicar **1.1 (cache disco) OU 1.2 (Vercel OG)** — decisão pendente.
2. Aplicar **2.2 (disable images Chromium)** — 1 linha por engine.
3. Aplicar **2.4 (cron 2×/dia)** — 1 linha em crontab.

**Medição esperada:** vCPU pico **73% → ~55%**.

**Fase 2 — Estrutural mas ainda local (1–2 semanas):**

4. Aplicar **2.1 (pool de browser)**.
5. Aplicar **2.3 (tier de engines noturno)**.
6. Aplicar **2.6 (auditoria Argos compartilhado)** se 8 engines novas (ADR-007) forem implementadas.

**Medição esperada:** vCPU pico **~55% → ~45%**. ✅ Meta de ADR-006 atingida.

**Fase 3 — Multi-banco / off-VPS estrutural:**

7. Aplicar **4.7 (estado do sender em MySQL Hostinger)** — alto ROI, MySQL já está pago no plano, remove arquivos JSON do disco da VPS.
8. Aplicar **4.6 (migrar `jobs.db` para MySQL Hostinger)** — core fica stateless em disco.
9. Aplicar **4.1 (Redis Upstash na frente do core)** — só se métricas após 4.6 indicarem que ainda há gargalo.
10. Aplicar **4.8 (logs/analytics em MySQL Hostinger)** — quando tabelas Supabase passarem de N rows.

A Fase 3 deixa de ser "condicional" e vira **caminho estrutural**, porque MySQL Hostinger é gasto sunk-cost (já pago no plano de hospedagem).

**Fase 4 — Reabertura de portas (condicional):**

9. Se Fase 2 não for suficiente, reabrir **2.8 (DeepL)** com ADR próprio.
10. Se feature Plus passar a sobrecarregar Postgres, considerar **4.3 (read replica)**.

---

## 8. Métrica de aceite

Cada PR deve declarar:

- **Antes:** snapshot `pm2 monit` na janela de pico observada.
- **Depois:** snapshot `pm2 monit` na mesma janela 24h após merge.
- **Delta de vCPU pico** atribuído ao PR.

Atualizar [[../13-issues/vps-cpu-peak-reduction]] com cada delta medido.

---

## Relações

- [[../12-decisions/ADR-006-vps-load-reduction-target]] — decisão formal e meta.
- [[../12-decisions/ADR-007-translation-inline-policy]] — política que mantém Argos.
- [[../13-issues/vps-cpu-peak-reduction]] — tracker operacional.
- [[../13-issues/untranslated-jobs-gap]] — gap relacionado.
- [[../03-features/plus-match-breakdown-cv]] — feature em espera.
- [[../09-infra/index]] — visão de infra.

## Referências

- `OPERACAO.md:113-198` — orçamento PM2 atual.
- `ecosystem.config.cjs` — tetos `max_memory_restart`.
- `apps/whatsapp/formatter/src/services/cardGenerator.js` — canvas sem cache.
- `apps/scraper/src/engines/{linkedin,indeed,simplyhired,bne}.py` — engines com Chromium.
- `apps/scraper/src/utils/translator.py` — Argos wrapper, fallback silencioso, cache LRU.
- `packages/message-formatting-core/src/server.js` — core (alvo de auditoria 3.1).

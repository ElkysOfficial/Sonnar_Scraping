---
title: ADR-008 — Vagas entregues como texto puro (descontinuação do card visual)
tags: [adr, decisions, whatsapp, product, performance]
status: accepted
release: v3.6.0
---

# ADR-008 — Vagas entregues como texto puro (descontinuação do card visual)

## Contexto

A v3.0.0 lançou cards visuais 1080×1080 (PNG) gerados pelo processo `sonnar-wa-formatter` (`@napi-rs/canvas`) na VPS. O processo:

- Consumia ~600MB de teto de RAM
- Acumulava ~6–8 restarts/dia por OOM (buffers canvas vazando)
- Era o maior contribuinte sustentado pro pico de vCPU
- Sem cache — rasterizava a mesma vaga repetidamente

Tentamos primeiro **migrar pra Vercel Edge Function** via `@vercel/og` (PRs #100/#101, v3.5.0/v3.5.1). Antes de configurar Vercel/DNS em prod, ficou claro que pra **1 cliente VIP** o card visual:

1. Não justificava adicionar vendor novo (Vercel) + DNS dedicado + segredo HMAC compartilhado
2. Toda a informação útil cabia no texto WhatsApp
3. Vagas estrangeiras (translation pipeline) já garantiam descrição em PT

## Decisão

**Descontinuar a geração de imagem.** Vagas passam a ser enviadas como **texto puro** com todos os campos (título, empresa, location, modalidade, salário em destaque, skills, responsabilidades, link, fonte/data).

Caminho concreto:

1. PRs #100 (v3.5.0) e #101 (v3.5.1) foram **revertidos** via `git revert` na v3.6.0
2. Processo `sonnar-wa-formatter` removido do `ecosystem.config.cjs`
3. `apps/whatsapp/formatter/` deletado do repo (`@napi-rs/canvas` sai do disco)
4. `apps/whatsapp/sender/src/services/textBuilder.js` (novo) monta a mensagem completa local
5. `coreClient.js` (novo) — sender fala direto com o `message-formatting-core`

## Alternativas consideradas

1. **Cache em disco local por `job_id`** (PR1 Nível 1) — rejeitado: mantém o formatter na VPS, ganho marginal com 1 cliente
2. **`@vercel/og`** (PR1 Nível 2) — implementado e revertido: introduz Vercel como vendor sem ganho proporcional ao custo
3. **Mover canvas pra Supabase Edge Function** — adiária o problema (Deno sem `@napi-rs/canvas`, exigia Satori = mesma reescrita do `@vercel/og`)
4. **Manter formatter, otimizar via cache** — sintoma vs causa raiz

## Consequências

**Positivas:**
- -1 processo PM2 (4 → 3) e -600MB de teto de RAM
- `@napi-rs/canvas` sai do disco da VPS
- Zero dependência de vendor externo (sem Vercel/DNS/HMAC)
- Estimativa: vCPU pico 73% → ~50-55% (parte do pacote da v3.6.0)
- Mensagens texto são mais leves no WhatsApp e melhor indexáveis em busca

**Negativas / risco aceito:**
- Perde o apelo visual do card 1080×1080
- Aceito porque (a) 1 cliente Plus ativo no momento, (b) toda info crítica no texto, (c) feature pode ser readicionada via Edge Function se voltar a ter público amplo

## Relações

- [[ADR-006-vps-load-reduction-target]] — meta de redução de carga que motivou esta decisão
- [[ADR-009-zero-llm-policy]] — política de zero custo recorrente (mesma família de decisão)
- [[../13-issues/_resolved/vps-cpu-peak-reduction]] — issue tracker resolvido

## Referências

- PR #100, #101, #102 (texto-only) — `git log --oneline | grep -E "v3\.5|v3\.6\.0"`
- `apps/whatsapp/sender/src/services/textBuilder.js` — implementação
- `CHANGELOG.md` — entrada 3.6.0

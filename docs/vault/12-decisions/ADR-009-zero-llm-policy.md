---
title: ADR-009 — Política zero LLM pago (Caminho A determinístico)
tags: [adr, decisions, plus, ai, cost]
status: accepted
release: v3.8.0
---

# ADR-009 — Política zero LLM pago (Caminho A determinístico)

## Contexto

O roadmap de funcionalidades Plus inclui features que historicamente seriam implementadas via LLM:

- **Plus #4** — parse de currículo (extrair skills, anos, seniority)
- **Plus #5** — match breakdown explicado (CV vs descrição da vaga)
- **Plus #10** — sugestões de melhoria do CV

Opções de LLM consideradas:

1. **APIs pagas** (OpenAI gpt-4o-mini, Anthropic Claude Haiku) — cobram por token, custo escala com base de clientes
2. **Free tier** (Groq, Gemini Flash) — gratuito até limite, mas vendor pode mudar política a qualquer momento
3. **Self-hosted** (Ollama com Llama/Phi) — exige GPU/RAM significativa, não cabe na VPS atual nem em free tiers

Lucelho declarou política explícita: **"tudo grátis, não vamos pagar nada, não vamos gerar mais custos"**.

## Decisão

**Caminho A — sem LLM, parser determinístico.** Todas as features que tradicionalmente exigem LLM passam a usar:

- **Regex** com vocabulário canônico (porto do `apps/scraper/src/utils/skills_vocabulary.py` — 1118 skills)
- **Set intersection** pra comparações (skills do CV vs skills da vaga)
- **Heurísticas por palavra-chave** pra seniority (lead/staff > senior > pleno > junior)
- **Pattern matching** pra anos de experiência (`5+ anos`, `pelo menos 3 anos`, intervalos `AAAA-AAAA`)

Implementação concreta:

- `supabase/functions/_shared/skills_vocabulary.ts` — vocabulário 1118 skills
- `supabase/functions/_shared/resumeParser.ts` — extractor (PDF/DOCX → texto via `pdfjs-dist` + `mammoth`)
- `supabase/functions/parse-resume/index.ts` — Edge Function principal
- `apps/whatsapp/sender/src/services/jobRequirementsParser.js` — equivalente JS pra rodar no sender

## Alternativas consideradas

1. **Caminho B — LLM grátis (Groq/Gemini free tier)** — rejeitado:
   - Cota de 14k req/dia Groq parece generosa, mas reservada/sujeita a mudança
   - Dependência de vendor que pode reduzir tier sem aviso (já aconteceu 2× em 2025)
   - Quando escalar pra 100+ Plus, pode degradar sem causa clara
2. **Caminho C — híbrido** (determinístico como fallback, LLM grátis como nice-to-have) — rejeitado: complexidade vs ganho marginal pra produto que precisa ser confiável
3. **APIs pagas** — descartado por restrição de negócio (zero custo recorrente)

## Consequências

**Positivas:**
- **Custo runtime = R$ 0** em todas as features de IA (parse CV, match breakdown, sugestões)
- Resultados determinísticos: mesma entrada → mesma saída, fácil de testar
- Escala infinita: 1 ou 10.000 clientes Plus tem o mesmo custo (zero)
- Sem lock-in: pdfjs/mammoth são MIT, podem rodar em qualquer Deno/Node/Vercel/Lambda
- Privacidade: dados do CV não saem da infra Supabase

**Negativas / trade-offs aceitos:**
- Match breakdown não tem prosa fluida — fica em formato estruturado `✓/✗/⚠`. Aceito porque informação acionável > prosa
- Sugestões de melhoria de CV ficam limitadas a "skills ausentes nas vagas que matchearam" — sem coaching narrativo
- Quando aparecer skill nova/emergente (ex: framework de 2026), exige PR pra atualizar vocabulário. Aceito pelo determinismo

**Implícitas no escopo:**
- Plus #10 (sugestões) redefinida: comparação de sets entre `extracted_skills` do CV e o histórico de matches, gerando lista determinística
- Plus #11/#12 (Consultoria LinkedIn / Templates de contato) ficam como **conteúdo estático** no `apps/web` — zero IA

## Relações

- [[ADR-006-vps-load-reduction-target]] — restrição de custo que originou a meta
- [[ADR-008-text-only-delivery]] — mesma família (descontinuação do que não justifica custo)
- [[ADR-010-plans-differentiation-strategy]] — estratégia comercial onde essa política se aplica
- [[../03-features/plus-resume-upload]] — feature Plus #4 (implementação)
- [[../03-features/plus-resume-match-breakdown]] — feature Plus #5 (implementação)

## Referências

- PRs #106 (Plus #4 v3.8.0), #107 (Plus #5 v3.8.1)
- `supabase/functions/_shared/skills_vocabulary.ts` — 1118 skills portados
- `supabase/functions/_shared/resumeParser.ts` — parser determinístico
- `apps/whatsapp/sender/src/services/jobRequirementsParser.js` — equivalente JS

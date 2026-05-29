---
title: Plus #5 — Match breakdown estruturado (CV vs vaga)
tags: [feature, plus, whatsapp, resume]
status: live
release: v3.8.1
---

# Plus #5 — Match breakdown estruturado (CV vs vaga)

## Contexto

Continuação direta de [[plus-resume-upload]] (Plus #4). O currículo parseado agora é **consumido pelo sender** pra gerar um bloco comparativo em cada vaga enviada na DM privada do Plus.

Zero LLM (ver [[../12-decisions/ADR-009-zero-llm-policy]]). Comparações via set intersection + regex sobre a description da vaga.

## User flow

1. Cliente Plus subiu CV (Plus #4) — `subscriber_resumes` tem registro com `is_active=true, parse_status='done'`
2. Scraper coleta nova vaga
3. Ciclo VIP do sender (30min) seleciona vaga compatível
4. `getPortalPlusSubscribers` carrega o subscriber **com o resume snapshot** (1 query batched extra)
5. `textBuilder.formatJobMessage` recebe `options.subscriberResume` e renderiza:

```
*🎯 Comparado com seu curriculo*
✓ Curriculo bate em 3 de 4 skills da vaga
✓ Vaga pede 5+ anos — seu curriculo indica ~7 anos
✓ Seu nivel (senior) bate com a vaga (senior)
```

## Componentes envolvidos

- `apps/whatsapp/sender/src/services/jobRequirementsParser.js` — extrai requisitos da vaga:
  - `extractRequiredYears(description)` — regex pra `5+ anos`, `pelo menos N anos`, etc.
  - `extractRequiredSeniority(title, description)` — heurística por keyword
  - `compareSeniority(candidate, required)` — `"match" | "under" | "over"`
- `apps/whatsapp/sender/src/services/textBuilder.js` — função `appendResumeBreakdown` monta as 3 linhas
- `apps/whatsapp/sender/src/utils/database.js` — `getPortalPlusSubscribers` faz 1 query batched extra em `subscriber_resumes`
- `apps/whatsapp/sender/src/services/vipJobSender.js` — `sendJobToSubscriber(lid, job, stack, resume)` propaga nos 3 callsites

## Estados

- **Plus com CV ativo**: vê o bloco completo
- **Plus sem CV** (não subiu ainda): bloco omitido (`subscriber.resume = null`)
- **Plus com CV mas sem dados úteis** (parse retornou tudo `null`): bloco omitido (lines vazias)
- **Pro/Free**: nunca vê o bloco (não cai no `getPortalPlusSubscribers`)

## Edge cases

- Vaga sem `description` rica (só título): `extractRequiredYears` retorna `null`, linha de anos omitida
- Title sem senioridade explícita: fallback no body da description
- Senioridade do CV é `junior` e vaga é `senior` → `⚠ Vaga e senior — seu curriculo indica junior`
- Senioridade do CV é `senior` e vaga é `pleno` → `✓ Vaga e pleno — voce ja esta senior`
- 0 skills em comum entre CV e vaga → `✗ Nenhuma skill da vaga aparece explicitamente no curriculo`

## Pontos de atenção

- 1 query batched a mais por ciclo VIP (não por subscriber) — desprezível em escala
- A senioridade do CV vem do `extractSeniority` do `resumeParser.ts` (Deno) e a da vaga vem do `jobRequirementsParser.js` (Node) — **mesmas heurísticas** mas implementações duplicadas. Eventual divergência exige atualizar ambos
- Bloco aparece **abaixo** do bloco do Plus #1 (✓/✗ stacks). Os dois coexistem

## Referências

- PR #107 — `git log --oneline | grep "Plus #5"`
- `CHANGELOG.md` — entrada 3.8.1
- 10 testes novos em `apps/whatsapp/sender/src/test/textBuilder.test.js` (`Plus #5: …`)
- [[plus-resume-upload]] — feature predecessora (Plus #4)
- [[plus-stack-compatibility]] — Plus #1 (bloco acima do match breakdown)

---
title: ADR-010 — Estratégia de diferenciação Free / Pro / Plus
tags: [adr, decisions, product, monetization]
status: accepted
release: v3.7.0
---

# ADR-010 — Estratégia de diferenciação Free / Pro / Plus

## Contexto

O produto tem 3 planos comerciais (Free / Pro R$5 / Plus R$10), mas a **diferenciação percebida** era fraca:

- **Pro vs Free**: Pro entregava "grupo exclusivo" — diferença que cliente não enxerga como valor por R$ 5
- **Plus vs Pro**: Plus entregava "DM privada + match score 0–100" — o score era um número solto, sem explicação, e Plus tinha só 1 cliente ativo

Diagnóstico (auditoria de 2026-05-29):
- Plus a R$ 10 entrega menos que LinkedIn Premium a R$ 130 (esperado), mas também menos que ferramentas grátis como CV.lol (problema)
- Falta o "wow" — algo que justifique R$ 10 e cria lock-in

## Decisão

Estabelecer **roadmap de 12 funcionalidades exclusivas do Plus** (era 10, adicionadas #11 e #12 por demanda do produto):

| # | Feature | Status |
|---|---|---|
| 1 | ✓/✗ stacks compatíveis na DM | ✅ v3.7.0 |
| 2 | DM privada filtrada por stack | ✅ pré-existente |
| 3 | Match score 0–100 | ✅ pré-existente |
| 4 | Upload de currículo + parse | ✅ v3.8.0 |
| 5 | Match breakdown estruturado (CV vs vaga) | ✅ v3.8.1 |
| 6 | Histórico de candidaturas + lembrete 7d | 🔜 |
| 7 | Estatísticas pessoais detalhadas | 🔜 |
| 8 | Alertas em tempo real (match alto) | 🔜 |
| 9 | Filtros avançados no dashboard | 🔜 |
| 10 | Sugestões de melhoria do CV (determinístico) | 🔜 |
| 11 | Consultoria LinkedIn (conteúdo estático) | 🔜 |
| 12 | Templates de contato com recrutador / email de candidatura | 🔜 |

E **10 funcionalidades pra Pro** + **10 pra Free** (Free atua como funil de aquisição):

**Pro (R$ 5)** ganha: grupo filtrado por estado/work_model, dashboard de vagas no portal, newsletter top 10 semanal, perfil de busca completo, 3 edições/mês, filtros de localidade/contratação, suporte priorizado WhatsApp, sistema de indicação, histórico de 90 dias.

**Free** ganha: grupo público (já existe), página `/vagas` indexável (SEO), newsletter top 5, perfil simplificado (1 stack + estado), 1 edição/mês, AdSense ativo, reações em vagas, compartilhar, favoritos (limite 10), web push opcional.

**Upsell automático Free → Plus** (v3.7.1) — email + WhatsApp semanal pra cada Free com 7+ dias, rate-limit 1 envio/canal a cada 30 dias. Roda 100% fora da VPS (Supabase Edge + Resend + sender `/send`).

## Restrições aplicadas

Toda feature deve respeitar:

1. **Zero custo recorrente** (ver [[ADR-009-zero-llm-policy]])
2. **Zero impacto em vCPU/RAM da VPS** (preferir Supabase Edge / Storage)
3. **Sem mudanças no banco existente** (exceção autorizada: tabela `subscriber_resumes` pro Plus #4)

## Alternativas consideradas

1. **Upgrade da VPS pra suportar features pagas** — rejeitado: mascara o problema, aumenta custo recorrente
2. **Aumentar preço do Plus** — rejeitado: cliente não pagaria mais sem ver mais valor
3. **Implementar tudo via LLM pago** — rejeitado por [[ADR-009-zero-llm-policy]]
4. **Cortar plano Pro** — rejeitado: degrau intermediário ajuda na conversão escalonada

## Consequências

**Positivas:**
- Plus deixa de ser "DM filtrada" → vira **ferramenta de carreira** (CV, match acionável, eventualmente histórico + sugestões)
- Cada plano tem diferenciação clara, cliente entende o que paga
- Upsell automático cria funil contínuo Free → Plus
- Tudo cabe em Supabase Edge + Storage (zero VPS extra)

**Negativas / a monitorar:**
- 12 features Plus é roadmap de meses — risco de não terminar antes da próxima onda
- Free tem AdSense (decisão atual) — pode irritar usuário, mas paga o funil
- Tabela `subscriber_resumes` é a primeira exceção à regra "não mudar banco" — pode pavimentar mais exceções

## Plano de follow-up

1. Manter [[../14-roadmap/index]] sincronizado com PR de cada feature
2. Cada Plus #N tem ADR só se introduzir decisão técnica não-óbvia (ex: ADR-009 já cobre #4-5-10)
3. Pós-deploy v3.7.0+: medir conversão Free → Plus em 60 dias (taxa atual: ~0 com 1 cliente; alvo: ≥5%)

## Relações

- [[ADR-006-vps-load-reduction-target]] — restrição de carga
- [[ADR-008-text-only-delivery]] — entrega via texto (Plus #1 depende disso)
- [[ADR-009-zero-llm-policy]] — política de zero custo
- [[../03-features/plus-stack-compatibility]] — Plus #1 implementado
- [[../03-features/plus-resume-upload]] — Plus #4 implementado
- [[../03-features/plus-resume-match-breakdown]] — Plus #5 implementado
- [[../03-features/free-to-plus-upsell]] — upsell automático
- [[../14-roadmap/index]] — roadmap detalhado

## Referências

- PRs #104 (Plus #1), #105 (Upsell), #106 (Plus #4), #107 (Plus #5)
- `CHANGELOG.md` — releases v3.7.0, v3.7.1, v3.8.0, v3.8.1

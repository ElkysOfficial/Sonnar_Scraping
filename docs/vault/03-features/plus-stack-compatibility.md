---
title: Plus #1 — ✓/✗ stacks compatíveis na DM WhatsApp
tags: [feature, plus, whatsapp]
status: live
release: v3.7.0
---

# Plus #1 — ✓/✗ stacks compatíveis na DM WhatsApp

## Contexto

Primeira funcionalidade de diferenciação do plano Plus (1 de 12 do roadmap — ver [[../12-decisions/ADR-010-plans-differentiation-strategy]]).

Antes da v3.7.0, a DM privada do Plus já filtrava vagas pelo stack do perfil + mostrava `match_score` 0–100, mas o cliente via apenas uma lista de skills sem **contexto acionável**.

## User flow

1. Scraper coleta vaga com skills (já existia)
2. Sender VIP, ao montar mensagem pra DM privada do Plus, **compara** as skills da vaga vs `subscriber_profiles.stack[]`
3. Mensagem ganha marcadores ✓ (no perfil) / ✗ (não está) + linha de sumário com porcentagem

Exemplo:

```
*🧩 Tecnologias*
✓ Node.js  ·  ✓ AWS  ·  ✗ Go  ·  ✓ TypeScript

📊 *Match:* 3 de 4 skills (75%)
```

## Componentes envolvidos

- `apps/whatsapp/sender/src/services/textBuilder.js` — `formatJobMessage(jobData, shortUrl, options)` aceita `options.subscriberStack`
- `apps/whatsapp/sender/src/services/vipJobSender.js` — propaga `subscriber.stacks` nos 3 callsites
- `apps/whatsapp/sender/src/utils/database.js` — `getPortalPlusSubscribers` já carregava `stack[]` (zero query nova)

## Estados

- **Subscriber Plus com stack populado**: vê marcadores ✓/✗
- **Subscriber Plus sem stack** (edge case): cai no fluxo legado (skills separadas por `•`, sem marcadores)
- **Subscriber Pro/Free**: recebe formato antigo (textBuilder chamado sem `subscriberStack`)

## Edge cases

- Match case-insensitive (`Node.js` no perfil bate com `node.js` da vaga)
- Skills com pontuação (`.NET`, `C++`, `Node.js`) — comparação via `set.has(normalize(s))`
- 0 skills em comum → `📊 *Match:* 0 de N skills (0%)`
- N skills em comum (todas) → `📊 *Match:* N de N skills (100%)`

## Pontos de atenção

- A linha `📊 *Match:* X de Y (Z%)` é o "trampolim" pro Plus #5 (breakdown contra CV) — depende dela visualmente
- Plus #5 adiciona um bloco extra **abaixo** dessa linha sem alterá-la

## Referências

- PR #104 — `git log --oneline | grep "Plus #1"`
- `CHANGELOG.md` — entrada 3.7.0
- 14 testes em `apps/whatsapp/sender/src/test/textBuilder.test.js` + `vipJobSender.test.js`
- [[plus-resume-match-breakdown]] — feature seguinte (Plus #5) que estende essa
- [[../12-decisions/ADR-010-plans-differentiation-strategy]] — estratégia comercial

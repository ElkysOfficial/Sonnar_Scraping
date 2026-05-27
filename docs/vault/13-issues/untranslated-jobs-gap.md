---
title: Vagas em EN/ES acumulando no banco sem tradução
tags: [issue, scraper, translation, data-quality]
severity: medium
status: open
---

# Vagas em EN/ES acumulando no banco sem tradução

## Contexto

Apenas a engine `careerjet` chama `translate_to_pt` inline (`apps/scraper/src/engines/careerjet.py:489-490`). As demais engines não-PT salvam no idioma original:

| Engine | Idioma | Traduz? |
| --- | --- | --- |
| `remoteok`, `remotive`, `weworkremotely`, `dice`, `simplyhired`, `ziprecruiter` | EN | ❌ |
| `bne`, `michaelpage` | ES | ❌ |

A cobertura era teoricamente provida pelo daemon `sonnar-backfill`, mas ele **não está rodando** em produção. Vagas em EN/ES vêm acumulando há tempo indeterminado.

A política para vagas **novas** foi formalizada em [[../12-decisions/ADR-007-translation-inline-policy]]: tradução vira parte do contrato de extração. Este issue cobre o **gap retroativo** — o que já está no banco hoje.

## Reprodução

Consulta para dimensionar o gap (a rodar contra Supabase):

```sql
SELECT source, COUNT(*) FILTER (WHERE description ~* '[a-zA-Z]') AS total
FROM public.jobs
WHERE source IN ('remoteok','remotive','weworkremotely','dice','simplyhired','ziprecruiter','bne','michaelpage')
GROUP BY source
ORDER BY total DESC;
```

Não rodado ainda — fazer parte do levantamento inicial deste issue.

## Impacto

- **UX**: usuários PT-BR recebem cards em inglês/espanhol (Discord, WhatsApp, web).
- **Match score do Plus** ([[../03-features/plus-match-breakdown-cv]]): `matchingEngine.js` tokeniza por palavra. Termos em idioma diferente reduzem precisão do match e do breakdown ✓Bate/✗Falta.
- **CV parsing futuro**: compara CV em PT com `description` em EN/ES → distorce extração de hard skills compartilhadas.
- **Confiança do produto**: inconsistência visível entre vagas é sinal de qualidade percebida baixa.

## Mitigação atual

Nenhuma — o gap segue crescendo a cada ciclo do scraper para as 8 engines listadas.

## Plano

**Etapa A — Estancar o gap (vagas novas):**

1. Estender o padrão `careerjet.py:489-490` às 8 engines acima. Aplicar [[../12-decisions/ADR-007-translation-inline-policy]].
2. Verificar warm-up de modelos: usar `translator.prepare()` (`translator.py:148`) no boot de cada engine para evitar latência da primeira vaga de cada idioma.

**Etapa B — Cobrir o gap retroativo (vagas já no banco):**

Três opções a avaliar:

| Opção | Esforço | Custo VPS | Risco |
| --- | --- | --- | --- |
| (a) Reativar `sonnar-backfill` por janela curta (1–7 dias), depois desligar de novo | baixo | alto temporário (Argos + Stanza + Torch ativos) | conflito temporário com [[../12-decisions/ADR-006-vps-load-reduction-target]] |
| (b) Script ad-hoc que reextrai apenas as vagas EN/ES afetadas | médio | médio (depende do volume) | URLs podem ter expirado nas fontes |
| (c) Deixar expirar naturalmente (vagas têm TTL no fluxo do produto) | nenhum | nenhum | gap visível por semanas/meses até rotação completa |

Decisão de etapa B pendente — depende do volume real do gap (consulta SQL acima) e da janela de tolerância de produto.

**Etapa C — Cobertura por testes:**

Adicionar smoke test por engine validando que vagas saem com `description` em PT (palavras-âncora português, ou heurística de idioma).

## Relações

- [[../12-decisions/ADR-007-translation-inline-policy]] — política que cobre vagas novas; esta issue cobre o legado.
- [[../12-decisions/ADR-006-vps-load-reduction-target]] — conflita levemente com a opção (a) de reativar backfill temporariamente.
- [[_resolved/careerjet-argostranslate-stanza|careerjet-argostranslate-stanza]] — restrição de Argos válida em qualquer cenário.
- [[../03-features/plus-match-breakdown-cv]] — feature degradada pelo gap.
- [[../08-backend/scraper-persistence]] — pipeline de persistência.

## Referências

- `apps/scraper/src/engines/careerjet.py:489-490` — padrão de referência (único caso com tradução inline hoje).
- `apps/scraper/src/utils/translator.py:128` — `translate_to_pt`.
- `apps/scraper/src/engines/{remoteok,remotive,weworkremotely,dice,simplyhired,ziprecruiter,bne,michaelpage}.py` — engines a corrigir.
- `OPERACAO.md:18` — descrição do `sonnar-backfill` no estado anterior.

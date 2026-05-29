---
title: ADR-007 — Tradução inline obrigatória na extração (backfill aposentado)
tags: [adr, decisions, scraper, translation, argos, careerjet]
status: accepted
release: 2026-Q2
---

# ADR-007 — Tradução inline obrigatória na extração (backfill aposentado)

## Contexto

O scraper coleta vagas em múltiplos idiomas:

| Engine | Idioma de saída atual | Traduz inline? |
| --- | --- | --- |
| `careerjet` (multi-país) | **PT** | ✅ Sim (`apps/scraper/src/engines/careerjet.py:489-490`) |
| `remoteok`, `remotive`, `weworkremotely`, `dice`, `simplyhired`, `ziprecruiter` | EN | ❌ Não |
| `bne`, `michaelpage` | ES | ❌ Não |
| `gupy`, `catho`, `infojobs`, `programathor`, `geekhunter` | PT (origem) | n/a |

Originalmente, o gap era coberto pelo daemon `sonnar-backfill`, descrito em [[../09-infra/index|operação]] como "garante que toda vaga no Supabase tenha description em português e responsibilities extraído". Esse daemon **não está mais rodando** em produção — entrou em desuso após estabilização da v3.x e nenhum substituto foi colocado no lugar.

Consequência observada: vagas em EN/ES vêm acumulando no banco sem tradução. Isso degrada:

- **UX no WhatsApp/Discord** — card chega em inglês/espanhol para usuários PT-BR.
- **Match score do Plus** (ver [[../03-features/plus-match-breakdown-cv]]) — o `matchingEngine.js` faz tokenização e match por palavra. Termos em idioma diferente reduzem precisão de `matchStacksWithScore` e do breakdown ✓Bate/✗Falta.
- **CV parsing futuro** — comparar CV em PT com descrição em EN distorce o cálculo de hard skills compartilhadas.

## Decisão

Estabelecer como política arquitetural do scraper:

**Toda vaga extraída em idioma ≠ português deve ser traduzida no momento da extração, antes de chegar no `sonnar-core` / `jobs.db`.**

Implicações operacionais:

1. Engines que retornam EN/ES devem replicar o padrão atual do `careerjet`:
   ```python
   title = await asyncio.to_thread(translate_to_pt, title, src_lang)
   description = await asyncio.to_thread(translate_to_pt, description, src_lang)
   ```
   Aplicar em `apps/scraper/src/engines/{remoteok,remotive,weworkremotely,dice,simplyhired,ziprecruiter,bne,michaelpage}.py`.
2. O daemon `sonnar-backfill` é **oficialmente aposentado**. Não deve ser referenciado como solução para idioma errado em vagas novas. Pode ser revivido pontualmente para cobertura retroativa do gap acumulado (ver [[../13-issues/untranslated-jobs-gap]]), mas não como dependência permanente.
3. A restrição técnica de [[../13-issues/_resolved/careerjet-argostranslate-stanza|careerjet-argostranslate-stanza]] continua válida enquanto Argos 1.10.1 estiver no projeto: **não remover `stanza` nem `torch`** do venv do scraper — o `import argostranslate.translate` quebra sem essas dependências.

## Alternativas consideradas

1. **Manter status quo (backfill teoricamente roda, na prática não)** — rejeitada. É a situação de hoje e justamente o que gerou o gap. Faz produto entregar conteúdo de qualidade variável dependendo da rota de extração.
2. **Reativar o `sonnar-backfill` como daemon permanente** — rejeitada. Adicionar 5º processo PM2 com Argos+Stanza+Torch carregados continuamente entra em conflito direto com [[ADR-006-vps-load-reduction-target]]. Tradução inline reusa o mesmo Argos que o scraper já carrega — não adiciona processo nem RAM.
3. **Substituir Argos por DeepL/Google Translate API** (chamada HTTP, sem modelo local) — adiada, não rejeitada. Atrativo: removeria Argos+Stanza+Torch do scraper (-1 a -1,5GB de RAM teto). Bloqueador: introduz dependência externa paga (~$1–5/mês no volume atual, mas escalonável) e ponto de falha de rede no caminho crítico de extração. Pode ser revisitada se ADR-006 não atingir a meta apenas com otimizações de Chromium/Canvas.
4. **Cortar engines internacionais (só BR)** — rejeitada (também em ADR-006). Perde público pagante de vaga remota internacional.
5. **Salvar bilíngue (texto original + traduzido)** — rejeitada para v1 desta decisão. Dobra o tamanho da `description` no banco sem caso de uso claro hoje. Pode ser feature futura se UX pedir.

## Consequências

**Positivas:**

- Garante qualidade uniforme de produto independente da fonte da vaga.
- Habilita matching de qualidade no Plus (match breakdown e CV parsing) — sem isso, o ROI da feature cai.
- Simplifica modelo mental: "saiu da engine, já está em PT". Não há etapa intermediária assíncrona com latência indefinida.
- Justifica manter Argos no scraper (mesmo processo, sem overhead adicional de daemon separado).

**Negativas / dívida aceita:**

- **Latência por vaga** em engines EN/ES sobe (Argos é CPU-bound; tradução de title+description ~100–500ms). Já é a realidade do `careerjet`; agora se espalha. Mitigação: `asyncio.to_thread` evita bloquear event loop.
- **Primeira vaga de cada idioma novo** força download do modelo Argos (~100–250MB). Já existe `prepare()` em `translator.py:148` para front-load no início do ciclo — replicar nas engines novas.
- **Gap retroativo**: vagas EN/ES já no banco continuam não traduzidas. Tratado separadamente em [[../13-issues/untranslated-jobs-gap]] — pode exigir reativação pontual do `sonnar-backfill` apenas para cobertura única, depois aposentadoria definitiva.
- **Acoplamento a Argos** persiste. Se Argos virar problema (versão nova quebrando compat, modelos indisponíveis), todas as engines não-PT param. Mitigação: `translate_to_pt` em `translator.py:128` já tem fallback silencioso (devolve texto original em vez de quebrar).

## Plano de follow-up

1. **Estender tradução inline às 8 engines listadas** — um PR por bloco lógico ou um PR único, definido na execução. Reaproveitar o padrão de `careerjet.py:489-490`.
2. **Cobertura retroativa do gap** — ver [[../13-issues/untranslated-jobs-gap]]. Decidir entre: (a) reativar `sonnar-backfill` por janela curta, (b) reextrair as vagas afetadas, (c) ignorar e deixar expirar naturalmente.
3. **Adicionar teste por engine** validando que vagas saem com `description` em PT. Hoje não há cobertura para isso.
4. **Reavaliar troca para DeepL/Google Translate** depois que [[ADR-006-vps-load-reduction-target]] for executado. Se a meta não for atingida e Argos for o gargalo restante, esta porta ainda está aberta.

## Relações

- [[ADR-006-vps-load-reduction-target]] — decisão complementar; este ADR mantém Argos, limitando o teto de economia de RAM no scraper.
- [[../13-issues/untranslated-jobs-gap]] — gap retroativo a fechar.
- [[../13-issues/_resolved/careerjet-argostranslate-stanza|careerjet-argostranslate-stanza]] — restrição técnica que segue válida enquanto Argos 1.10.1 estiver no projeto.
- [[../03-features/plus-match-breakdown-cv]] — feature que depende de qualidade de PT no banco.
- [[../08-backend/scraper-persistence]] — pipeline atual de persistência do scraper.

## Referências

- `apps/scraper/src/engines/careerjet.py:489-490` — padrão de tradução inline atualmente em uso.
- `apps/scraper/src/utils/translator.py:128` — `translate_to_pt`, fallback silencioso e cache LRU.
- `apps/scraper/src/utils/translator.py:148` — `prepare()` para front-load de modelos.
- `apps/scraper/requirements.txt:28` — `argostranslate>=1.9.0` (hoje pinado em 1.10.1).
- `OPERACAO.md:18` — descrição do `sonnar-backfill` no estado anterior (a aposentar formalmente).

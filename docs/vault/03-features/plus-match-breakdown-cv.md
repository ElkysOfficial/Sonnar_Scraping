---
title: Plus — match breakdown na DM + upload de CV
tags: [feature, plus, plano, matching, cv, edge-functions]
status: planned
branch: feature/plus-match-breakdown-cv
---

# Plus — match breakdown na DM + upload de CV

## Contexto

Feature do plano **Plus** (R$10/mês) com dois entregáveis encadeados. Justifica o salto de 2× sobre o **Pro** (R$5) transformando o "match score 0–100" em **insight de carreira**, e introduz o CV como fonte de verdade para hard/soft skills do assinante.

⚠️ **Não inicia antes do roteiro de [[../12-decisions/ADR-006-vps-load-reduction-target]] avançar materialmente** — feature pesada entrando com margem atual de 27pp de vCPU pico é risco operacional desnecessário.

## User flow

### Parte 1 — Match breakdown na DM

1. Assinante Plus recebe vaga no privado WhatsApp (fluxo atual).
2. Card vem com duas linhas novas abaixo do score:
   ```
   Match: 87%
   ✓ Bate: Python, AWS, Docker
   ✗ Falta: Kafka
   ```
3. Final do mês: card consolidado por DM — "vagas do seu match exigiram **Kafka** em 38% das ocorrências; **Terraform** em 22%. Sugestão de estudo."

### Parte 2 — Upload de CV

1. Dashboard Plus ganha campo de upload de PDF em `apps/web/src/pages/dashboard/DashboardSettings.vue` (ou nova rota dedicada).
2. PDF vai para Supabase Storage (bucket `cvs` com RLS por `user_id`).
3. Trigger dispara Edge Function (`supabase/functions/parse-cv/`) que:
   - Faz parse do PDF (`pdf-parse` ou equivalente Deno).
   - Extrai hard skills + soft skills contra dicionário.
   - Grava em `subscriber_profiles.cv_skills jsonb` (`{hard_skills: [...], soft_skills: [...], extracted_at, version}`).
4. Próximo ciclo VIP do `sonnar-wa-sender` usa `cv_skills.hard_skills` como input do `matchStacksWithScore`.

## Componentes envolvidos

- **Frontend (`apps/web`)** — componente de upload, validação client-side (PDF, max 5MB), feedback visual de status de parsing.
- **Supabase Storage** — bucket `cvs/<user_id>/<uuid>.pdf`. RLS: owner-only read/write.
- **Edge Function `parse-cv`** ([[../06-api/index]]) — Deno, runtime stateless, ~256MB RAM. Parse + extração + persistência em jsonb.
- **DB**:
  - Coluna nova `match_breakdown jsonb` em `public.vip_delivery_snapshot` (Parte 1).
  - Coluna nova `cv_skills jsonb` em `public.subscriber_profiles` (Parte 2).
  - `pg_cron` mensal agregando `match_breakdown` para o relatório consolidado.
- **Sender (`apps/whatsapp/sender`)** — `vipJobSender.js` passa a serializar o retorno completo do `matchStacksWithScore` no snapshot, e renderiza as 2 linhas extras na DM. Quando `cv_skills` existe no perfil, usa como `requestedStacks` (substitui ou complementa `stacks` manuais — ver decisões pendentes).
- **Matching (`apps/whatsapp/sender/src/utils/matchingEngine.js`)** — sem mudança de lógica. `matchStacksWithScore` em `matchingEngine.js:129` já retorna `matchedTerm`, `canonical`, `matchType`, `negativeConflicts`. Hoje o sender só usa `score` e descarta o resto. **Zero CPU novo** na VPS.

## Estados

| Estado | Origem | Comportamento |
| --- | --- | --- |
| Plus sem CV | default no signup | Match usa `subscriber_profiles.stacks` (manual). Breakdown mostra o que tem. |
| Plus com CV em parse | upload acabou de acontecer | UI mostra "Analisando CV…"; sender ainda usa `stacks` manual. |
| Plus com CV parseado | Edge Function gravou `cv_skills` | Sender usa `cv_skills.hard_skills`. UI mostra skills extraídas com opção de revisar. |
| Plus com CV rejeitado | PDF corrompido / não-CV | UI mostra erro; sender mantém `stacks` manual. |

## Decisões pendentes antes de implementar

1. **Dicionário de skills**:
   - Opção A: usar `STACK_RULES` de `matchingEngine.js:78` (apenas 4 stacks hoje: java/javascript/python/csharp).
   - Opção B: criar tabela `public.skill_taxonomy` com ~200 termos canônicos (linguagens, frameworks, clouds, ferramentas, soft skills).
2. **Soft skills no MVP** — incluir ou só hard? Soft skills no CV são ruidosas ("liderança", "comunicação" aparecem em quase todo currículo).
3. **CV vs `stacks` manual** — em conflito, qual prevalece? Substitui ou complementa?
4. **Versão do parser** — guardar `version` no jsonb permite re-parse futuro com taxonomia melhor.

## Edge cases

- **CV em PDF escaneado (imagem)**: parser texto-only não extrai. Mostrar erro pedindo PDF com texto selecionável (ou prever OCR como v2).
- **CV em inglês**: trad inline na Edge Function? Ou inferir e mapear inglês → canonical via dicionário multilingue?
- **CV muito grande**: limite client-side de 5MB, server-side de 10MB.
- **Vagas em EN/ES no banco** (ver [[../13-issues/untranslated-jobs-gap]]): match em idiomas diferentes degrada precisão. Dependência cruzada com [[../12-decisions/ADR-007-translation-inline-policy]].

## Custo de VPS

| Componente | Impacto VPS |
| --- | --- |
| Parte 1 — breakdown na DM | **Zero** CPU novo (resultado já calculado e descartado hoje). +~50 bytes por delivery em jsonb. |
| Parte 1 — relatório mensal | **Zero** VPS (roda como `pg_cron` no Supabase). |
| Parte 2 — upload CV | **Zero** VPS (Supabase Storage). |
| Parte 2 — parse CV | **Zero** VPS (Edge Function). |
| Parte 2 — match com `cv_skills` | **Zero** CPU novo (mesma chamada, input diferente). |

Caminho B (Edge Function) foi escolhido sobre Caminho C (parse na VPS) justamente para honrar [[../12-decisions/ADR-006-vps-load-reduction-target]].

## Relações

- [[../12-decisions/ADR-006-vps-load-reduction-target]] — bloqueador upstream (feature espera roteiro de otimização).
- [[../12-decisions/ADR-007-translation-inline-policy]] — pré-requisito de qualidade (match precisa de descrição em PT).
- [[../13-issues/vps-cpu-peak-reduction]] — tracker do bloqueador.
- [[../13-issues/untranslated-jobs-gap]] — pré-requisito de qualidade do match.
- [[../06-api/index]] — Edge Function `parse-cv` vai entrar aqui.
- [[../05-database/index]] — alteração de schema (`match_breakdown`, `cv_skills`).
- [[../08-backend/whatsapp-sender-bot]] — sender consumindo o breakdown.

## Referências

- `apps/whatsapp/sender/src/utils/matchingEngine.js:129` — `matchStacksWithScore` (já retorna o breakdown completo).
- `apps/whatsapp/sender/src/services/vipJobSender.js:61` — ciclo VIP atual onde o breakdown será serializado.
- `apps/whatsapp/sender/src/utils/matchingEngine.js:78` — `STACK_RULES` (candidato a substituição por taxonomia maior).
- `supabase/migrations/20260516120000_vip_delivery_snapshot.sql` — tabela onde `match_breakdown` será adicionado.
- `supabase/migrations/20260517010000_subscriber_profiles_areas.sql` — tabela onde `cv_skills` será adicionado.
- Padrão de branch: `.github/rulesets/feature-branches.json` (`feature/<descricao-kebab>`).

---
title: Plus #4 — Upload de currículo + parse determinístico
tags: [feature, plus, supabase, resume]
status: live
release: v3.8.0
---

# Plus #4 — Upload de currículo + parse determinístico (zero LLM)

## Contexto

Funcionalidade flagship do plano Plus. Cliente faz upload de PDF/DOCX no dashboard, sistema extrai **automaticamente** skills, anos de experiência, senioridade e idiomas — sem LLM pago, sem custo recorrente (ver [[../12-decisions/ADR-009-zero-llm-policy]]).

## User flow

1. Cliente Plus acessa `/dashboard` (futuramente em tab "Currículo")
2. Seleciona arquivo PDF ou DOCX (até 10MB)
3. Frontend faz upload direto pro Supabase Storage `resumes/<subscriber_id>/<uuid>.<ext>`
4. Frontend invoca Edge Function `parse-resume`
5. Edge Function:
   - Valida que subscriber pertence ao usuário autenticado + plano = Plus
   - Baixa arquivo do Storage
   - Extrai texto via `pdfjs-dist` (PDF) ou `mammoth` (DOCX)
   - Roda parser determinístico (`_shared/resumeParser.ts`)
   - Persiste em `subscriber_resumes` (trigger desativa CV anterior)
6. UI exibe resultado: chips de skills + anos + seniority + idiomas

## Componentes envolvidos

- **Banco**: tabela `subscriber_resumes`, RPC `get_my_active_resume()`, bucket Storage `resumes` privado, 3 RLS policies
- **Edge Function**: `supabase/functions/parse-resume/index.ts`
- **Shared**: `supabase/functions/_shared/skills_vocabulary.ts` (1118 skills), `_shared/resumeParser.ts` (regex extractors)
- **Frontend**: `apps/web/src/components/ResumeUpload.vue`

## Heurísticas do parser

- **Skills**: regex contra `SKILLS_VOCABULARY` (1118 termos canônicos portados do scraper Python), case-insensitive, com lookarounds que aceitam fronteira não-alfanumérica (cobre `Node.js`, `C#`, `.NET`)
- **Anos totais**: soma intervalos `AAAA-AAAA` da seção de experiência, mergeando sobrepostos (não conta 2× o mesmo período). Fallback: regex `X anos`
- **Senioridade**: ranking `lead/staff > principal > senior > pleno > junior` por keyword na ordem (primeira ocorrência ganha)
- **Idiomas**: dicionário fixo (`portugues`, `ingles`, `espanhol`, `frances`, `alemao`, `italiano`, `japones`, `mandarim`)

## Estados

- **`parse_status='pending'`**: criado na hora do upload, antes do parse
- **`parse_status='done'`**: parse concluído com sucesso, dados disponíveis
- **`parse_status='failed'`**: erro no parse (PDF corrompido, sem texto extraível) — guardado em `parse_error`
- **`is_active=true`**: trigger garante que só 1 ativo por subscriber (versões antigas viram histórico em `is_active=false`)

## Edge cases

- Cliente não-Plus tenta invocar Edge Function direto → **HTTP 402** `plan_not_eligible`
- Outro usuário tenta acessar Storage de subscriber_id alheio → bloqueado por Storage policy (folder = subscriber_id)
- PDF sem texto extraível (scan de imagem) → `parse_status='failed'`, UI mostra "Não foi possível processar"
- Cliente sobe novo CV → trigger move antigo pra `is_active=false`, novo vira ativo
- Arquivo > 10MB → bloqueado pelo bucket
- MIME diferente de PDF/DOCX → bloqueado pelo bucket + validação na Edge

## Pontos de atenção

- `parser_version='v1.0'` na tabela permite reprocessar quando heurística evoluir (`UPDATE` em massa por versão)
- `raw_text` está limitado a 100KB no banco — currículos gigantes ficam truncados (raro)
- O vocabulário em `_shared/skills_vocabulary.ts` é cópia manual do Python — quando adicionar skill nova no scraper, **regenerar** TS

## Referências

- PR #106 — `git log --oneline | grep "Plus #4"`
- `CHANGELOG.md` — entrada 3.8.0
- Migration `supabase/migrations/20260529150000_subscriber_resumes.sql`
- [[plus-resume-match-breakdown]] — consome os dados desta tabela (Plus #5)
- [[../12-decisions/ADR-009-zero-llm-policy]] — política que sustenta a abordagem

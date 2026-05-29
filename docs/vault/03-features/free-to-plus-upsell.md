---
title: Upsell automático Free → Plus (email + WhatsApp)
tags: [feature, free, conversion, supabase]
status: live
release: v3.7.1
---

# Upsell automático Free → Plus

## Contexto

Pipeline automático de conversão Free → Plus. Toda segunda 10h BRT, pra cada subscriber Free ativo com 7+ dias de cadastro e sem upsell recente do canal, dispara **email + WhatsApp** com pitch personalizado das vantagens do Plus.

Roda 100% fora da VPS (Supabase Edge Function + Resend + sender `/send`). Zero custo recorrente — Resend free tier (3000 emails/mês) cobre folgado.

## User flow

```
pg_cron (segunda 10h BRT)
       │
       ▼
Edge Function weekly-upsell-free-to-plus
       │
       ├─► RPC list_upsell_free_candidates('email')
       │        Filtra: plan=free + active + 7+ dias + sem envio email <30d
       │
       ├─► RPC list_upsell_free_candidates('whatsapp')
       │        Filtra: + tem wa_lid + sem envio wa <30d
       │
       ├─► Pra cada candidato email → Resend API
       │
       ├─► Pra cada candidato wa → POST /send do sender (token existente)
       │
       └─► upsell_log INSERT (audit + rate-limit)
```

## Componentes envolvidos

- **Banco**: tabela `upsell_log` (subscriber_id, channel, status, sent_at, metadata, error_message) + RPC `list_upsell_free_candidates(channel)`
- **Edge Function**: `supabase/functions/weekly-upsell-free-to-plus/index.ts`
- **Email**: Resend via `_shared/emailTemplate.ts` (template Sonnar)
- **WhatsApp**: `POST /send` no sender (endpoint pré-existente, autenticado por `WHATSAPP_API_TOKEN`)
- **Cron**: `pg_cron` no Supabase com `net.http_post`

## Estados

- **Subscriber Free + sem email + sem wa_lid**: ignorado pela RPC (sem canal de contato)
- **Subscriber Free + 7+ dias + email/wa válido + sem envio <30d**: elegível
- **Envio bem-sucedido**: `upsell_log.status='sent'`, rate-limit ativo por 30d
- **Envio falho** (Resend down, sender 500): `status='failed'`, **conta no rate-limit** (não tentamos de novo na mesma semana)
- **Subscriber upgrade pra Pro/Plus**: deixa de aparecer no `list_upsell_free_candidates` (filtro `plan='free'`)

## Anti-spam (rate-limit)

1 envio por canal por subscriber a cada 30 dias. Implementado no próprio RPC `list_upsell_free_candidates` via `NOT EXISTS (... upsell_log ... WHERE sent_at > now() - interval '30 days')`. **Idempotente**: rodar 2× no mesmo dia não duplica envio.

## Conteúdo personalizado

- **Estatística real**: lê últimos 7 dias da tabela `jobs`, calcula "N vagas total / M no grupo público (~30%) / X exclusivas Plus (~70%)"
- **3 exemplos**: títulos reais de vagas recentes
- **CTA**: link direto pra checkout do Plus (`/cadastro/plus`)
- **Email**: HTML do template Sonnar (`_shared/emailTemplate.ts`)
- **WhatsApp**: texto puro com markdown WA (`*bold*`, `_italic_`)

## Edge cases

- Free recém-cadastrado (< 7 dias): ignorado (evita assédio em quem acabou de chegar)
- Free sem email **e** sem wa_lid: ignorado em ambos os canais
- Plus que cancelou subscription e voltou a Free: começa contagem do zero (`upsell_log` persiste mas o filtro `> 7 dias` usa `subscribers.created_at`, não data do downgrade — pode reavaliar)
- Resend cota excedida: log com `status='failed'`, próxima semana tenta de novo

## Configuração pós-deploy

1. `supabase db push` aplica migration
2. Secrets na Edge Function: `RESEND_API_KEY`, `SENDER_API_URL`, `SENDER_API_TOKEN`, `CRON_TOKEN`
3. Postgres settings: `app.functions_url`, `app.upsell_cron_token`
4. `cron.schedule('weekly-upsell-free-to-plus', '0 13 * * 1', ...)`

(Detalhes completos no `CHANGELOG.md` entrada 3.7.1)

## Pontos de atenção

- **Não toca subscribers Pro/Plus** — feature do funil Free, não anti-churn de pagantes
- Status `failed` ainda conta no rate-limit (decisão de produto: pra evitar ressender mensagem repetida no mesmo dia se Resend voltar). Se quiser retry, mudar a query do RPC pra filtrar só `status='sent'`
- WhatsApp via endpoint do bot — se bot estiver offline na hora do cron, mensagens daquele cohort ficam `failed` e voltam só em 30d

## Referências

- PR #105 — `git log --oneline | grep "v3.7.1"`
- `CHANGELOG.md` — entrada 3.7.1
- Migration `supabase/migrations/20260529120000_upsell_log_free_to_plus.sql`
- [[../12-decisions/ADR-010-plans-differentiation-strategy]] — estratégia que motiva esta feature

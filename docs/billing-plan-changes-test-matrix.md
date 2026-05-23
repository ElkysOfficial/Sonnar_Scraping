# Matriz de testes — mudança de plano (v2.16.0)

Cenários a validar **no Stripe test mode** antes do merge da branch
`feature/v2.16.0-plan-changes`. Stripe oferece cartões de teste em
<https://docs.stripe.com/testing>; usar `4242 4242 4242 4242` para sucesso
e `4000 0000 0000 0341` para falha em renovação.

## Pré-requisitos

1. Stripe CLI logado (`stripe login`) e encaminhando webhooks para o ambiente
   local (`stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook`).
2. Variáveis `STRIPE_PRICE_PRO` e `STRIPE_PRICE_PLUS` configuradas no
   ambiente do edge functions.
3. Painel Stripe → Webhooks → endpoint atualizado para receber também:
   - `subscription_schedule.released`
   - `subscription_schedule.completed`
   - `subscription_schedule.canceled`
4. Painel Stripe → Customer Portal → **desabilitar** "Customers can switch
   plans" (forçar swap pela nossa UI).

## Convenções

- "→" = ação esperada na UI
- "✓" = checar resultado no banco (`subscribers` row do usuário) e no Stripe
- Quando aparecer `clock`, usar [test clocks](https://docs.stripe.com/billing/testing/test-clocks)
  para avançar tempo e simular renovação/expiração.

---

## 1. Free → Pro (checkout inicial)

- [ ] Cliente free clica "Assinar Pro" no DashboardSubscription
- [ ] Redirect para Checkout Stripe com `trial_period_days: 7`
- [ ] Preencher cartão `4242...` + CPF válido + endereço
- [ ] Pós-checkout → `/pagamento/confirmando`
- [ ] **Webhook:** `customer.subscription.created` (status=trialing)
- [ ] ✓ `subscribers.plan='pro'`, `status='active'`, `stripe_subscription_id` setado, `scheduled_plan=null`

## 2. Free → Plus (checkout inicial)

- [ ] Idem 1, mas plano Plus. `amount_total=0` durante trial.

## 3. Pro → Plus (upgrade imediato com proração)

- [ ] Cliente Pro active. Dashboard mostra card único "Plus" com CTA "Fazer upgrade agora"
- [ ] Click → loading no card → modal **não** aparece (upgrade é instantâneo)
- [ ] **Stripe:** `subscriptions.update` com `proration_behavior=always_invoice`
- [ ] **Webhook:** `customer.subscription.updated` com price novo
- [ ] ✓ `subscribers.plan='plus'`, sem `scheduled_*`
- [ ] **Stripe Invoices:** próxima invoice tem line item de proração positiva
- [ ] **Edge case A — em trial:** `trial_end` preservado, sem cobrança imediata, invoice fecha só no fim do trial

## 4. Plus → Pro (downgrade agendado)

- [ ] Cliente Plus active. Dashboard mostra card único "Pro" com CTA "Trocar pro Pro no fim do período"
- [ ] Click → modal de confirmação com a data
- [ ] **Stripe:** cria `subscription_schedule` (2 fases)
- [ ] ✓ `subscribers.scheduled_plan='pro'`, `scheduled_change_at=current_period_end`, `stripe_schedule_id` setado, `plan` continua 'plus'
- [ ] UI: banner amarelo "Sua assinatura mudará para Pro em ..."
- [ ] **Avança o clock:** chega no `current_period_end`
- [ ] **Webhook:** `subscription_schedule.completed` + `customer.subscription.updated`
- [ ] ✓ `subscribers.plan='pro'`, `scheduled_*` limpos

## 5. Plus → Pro com revert antes da virada

- [ ] Após cenário 4 (agendamento criado), clicar "Manter Plus" no banner
- [ ] **Stripe:** `subscription_schedules.release`
- [ ] **Webhook:** `subscription_schedule.released`
- [ ] ✓ `subscribers.scheduled_*` zerados, `plan='plus'` mantido

## 6. Pro → Free (cancelamento agendado)

- [ ] Cliente Pro active. Click "Cancelar assinatura"
- [ ] Modal explica que conta volta pra Comunidade em DD/MM
- [ ] **Stripe:** `subscriptions.update({ cancel_at_period_end: true })`
- [ ] ✓ `subscribers.scheduled_plan='free'`, `scheduled_change_at` setado, `stripe_schedule_id=null`
- [ ] Banner amarelo aparece; botão "Cancelar assinatura" some
- [ ] **Avança o clock:** chega no period end → `customer.subscription.deleted`
- [ ] ✓ `subscribers.plan='free'`, `status='active'`, `stripe_subscription_id=null`, `scheduled_*=null`

## 7. Plus → Free (cancelamento agendado)

- [ ] Idem 6, partindo de Plus.

## 8. Pro/Plus → Free com revert antes da virada

- [ ] Após 6 ou 7, clicar "Manter Pro"/"Manter Plus" no banner
- [ ] **Stripe:** `subscriptions.update({ cancel_at_period_end: false })`
- [ ] **Webhook:** `customer.subscription.updated` (sem cancel_at_period_end)
- [ ] ✓ `subscribers.scheduled_*` zerados via `clearScheduledFreeIfReverted`

## 9. Bloqueios

### 9.1 Tentar mudar de plano com past_due
- [ ] Forçar past_due (cartão `4000 0000 0000 0341` na renovação)
- [ ] ✓ `subscribers.status='past_due'`
- [ ] Dashboard: seção de mudança some; banner orienta atualizar pagamento
- [ ] API: `POST /change-plan` com qualquer targetPlan → 409 `status_not_active`

### 9.2 Tentar mudar para o mesmo plano
- [ ] `POST /change-plan` com `targetPlan === plan atual` → 400 "Voce ja esta neste plano"

### 9.3 Já existe agendamento
- [ ] Agendar downgrade (cenário 4), depois tentar agendar de novo
- [ ] `POST /change-plan` → 409 `scheduled_change_exists`

### 9.4 Free tenta change-plan (não passa por checkout)
- [ ] Cliente free hits `change-plan` diretamente (curl) com targetPlan='pro'
- [ ] → 400 `use_checkout`

## 10. Anti-tamper continua funcionando

- [ ] Modificar `STRIPE_PRICE_PLUS` para apontar pra um price com valor errado
- [ ] Tentar checkout → webhook detecta mismatch e loga `amount_mismatch`

## 11. Idempotência

- [ ] Reenviar um evento já processado via `stripe events resend <event_id>`
- [ ] ✓ webhook responde `already_processed`, sem efeito colateral

---

## Checagens cruzadas no Stripe Dashboard

Após qualquer cenário envolvendo schedule:
- Customer → Subscriptions: estado da assinatura confere
- Customer → Subscription schedules: schedule criado/released/completed
- Customer → Invoices: prorações e itens batem com o esperado

## Smoke test final pré-deploy

Antes de promover a branch para main e marcar release:

1. Cenário 1 (Free → Pro) com cartão real **em modo de teste**.
2. Cenário 3 (Pro → Plus imediato) e confere proração.
3. Cenário 4 (Plus → Pro agendado) + cenário 5 (revert).
4. Cenário 6 (Pro → Free agendado) + cenário 8 (revert).
5. Cenário 9.1 (bloqueio past_due).

Tudo OK → merge squash + tag `v2.16.0` + release notes.

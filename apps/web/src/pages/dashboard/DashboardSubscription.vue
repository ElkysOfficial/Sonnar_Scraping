<template>
  <div class="dsub">
    <div class="dsub-top">
      <!-- ============ HERO DE STATUS ============ -->
      <article class="dsub-card dsub-hero">
        <div class="dsub-hero__top">
          <div class="dsub-hero__id">
            <p class="dsub-eyebrow">Plano atual</p>
            <h2 class="dsub-plan">{{ planLabel }}</h2>
            <p class="dsub-price">
              <span class="dsub-price__value">{{ planPriceValue }}</span>
              <span v-if="planPriceSuffix" class="dsub-price__suffix">{{ planPriceSuffix }}</span>
            </p>
          </div>
          <span :class="['status-pill', `status-pill--${subscriber?.status}`]">
            <span class="status-dot" aria-hidden="true"></span>
            {{ statusLabel }}
          </span>
        </div>

        <!-- Banner de mudanca agendada -->
        <div v-if="hasScheduledChange" class="dsub-scheduled" role="status">
          <div class="dsub-scheduled__text">
            <strong>Mudanca agendada</strong>
            <p>Sua assinatura mudara para <strong>{{ scheduledPlanLabel }}</strong> em <strong>{{ formatDate(subscriber.scheduled_change_at) }}</strong>. Voce continua com o {{ planLabel }} ate la.</p>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            :disabled="loadingRevert"
            @click="onRevert"
          >
            {{ loadingRevert ? 'Cancelando...' : `Manter ${planLabel}` }}
          </button>
        </div>

        <p v-else class="dsub-hero__msg" :class="`dsub-hero__msg--${msgTone}`">{{ statusCopy }}</p>

        <dl class="dsub-meta">
          <div>
            <dt>E-mail de cobrança</dt>
            <dd>{{ subscriber?.email || '—' }}</dd>
          </div>
          <div>
            <dt>{{ subscriber?.current_period_end ? 'Próxima cobrança' : 'Renovação' }}</dt>
            <dd>{{ subscriber?.current_period_end ? formatDate(subscriber.current_period_end) : 'Sem cobrança recorrente' }}</dd>
          </div>
          <div v-if="subscriber?.created_at">
            <dt>Cliente desde</dt>
            <dd>{{ formatDate(subscriber.created_at) }}</dd>
          </div>
        </dl>

        <div class="dsub-actions">
          <button
            v-if="needsCheckout"
            class="btn btn-primary btn-lg"
            :disabled="loadingCheckout"
            @click="goCheckout"
          >
            {{ loadingCheckout ? 'Aguarde…' : 'Continuar pagamento' }}
          </button>
          <button
            v-if="canManage"
            class="btn btn-secondary"
            :disabled="loadingManage"
            @click="goManage"
          >
            {{ loadingManage ? 'Abrindo…' : 'Gerenciar pagamento' }}
          </button>
          <button
            v-if="canCancel"
            class="btn btn-ghost btn-danger-link"
            :disabled="loadingCancel"
            @click="onCancel"
          >
            {{ loadingCancel ? 'Cancelando…' : 'Cancelar assinatura' }}
          </button>
        </div>

        <p v-if="errorMessage" class="dsub-error" role="alert">{{ errorMessage }}</p>
      </article>

      <!-- ============ O QUE O PLANO INCLUI ============ -->
      <aside class="dsub-card dsub-includes">
        <header class="dsub-includes__head">
          <h3>O que o {{ planLabel }} inclui</h3>
          <p>{{ includesCopy }}</p>
        </header>
        <ul class="dsub-includes__list">
          <li v-for="f in planFeatures" :key="f">
            <span class="dsub-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span>{{ f }}</span>
          </li>
        </ul>
        <router-link
          v-if="subscriber?.plan !== 'free'"
          to="/dashboard/configuracoes"
          class="dsub-includes__link"
        >
          Ajustar perfil de busca →
        </router-link>
      </aside>
    </div>

    <!-- ============ MUDAR DE PLANO ============ -->
    <section v-if="canChangePlan && changeOptions.length > 0" class="dsub-upgrade">
      <header class="dsub-upgrade__head">
        <h3>{{ changeHeading }}</h3>
        <p>{{ changeCopy }}</p>
      </header>

      <div class="dsub-plans">
        <article
          v-for="p in changeOptions"
          :key="p.tier"
          class="dsub-plan-card"
          :class="{ 'dsub-plan-card--featured': p.featured }"
        >
          <header class="dsub-plan-card__head">
            <span class="dsub-plan-card__eyebrow">{{ p.label }}</span>
            <span class="dsub-plan-card__price">{{ p.price }}<small>/mês</small></span>
          </header>
          <p class="dsub-plan-card__sub">{{ p.sub }}</p>
          <ul class="dsub-plan-card__features">
            <li v-for="f in p.features" :key="f">
              <span class="dsub-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span>{{ f }}</span>
            </li>
          </ul>
          <button
            class="btn"
            :class="p.featured ? 'btn-primary' : 'btn-secondary'"
            :disabled="loadingChange === p.tier"
            @click="onChoose(p)"
          >
            {{ loadingChange === p.tier ? 'Aguarde...' : p.ctaLabel }}
          </button>
        </article>
      </div>
    </section>

    <!-- ============ NOTA DE SUPORTE ============ -->
    <p class="dsub-support">
      Cobrança processada com segurança via Stripe. Dúvidas sobre pagamento? Fale com o suporte.
    </p>

    <!-- ============ MODAL DE CONFIRMAÇÃO ============ -->
    <ConfirmDialog
      :open="confirmDialog.open"
      :title="confirmDialog.title"
      :subtitle="confirmDialog.subtitle"
      :tone="confirmDialog.tone"
      :bullets="confirmDialog.bullets"
      :confirm-label="confirmDialog.confirmLabel"
      :cancel-label="confirmDialog.cancelLabel"
      :loading-label="confirmDialog.loadingLabel"
      :loading="confirmDialog.loading"
      @confirm="onConfirmDialog"
      @cancel="onCancelDialog"
    >
      <p v-if="confirmDialog.lead" v-html="confirmDialog.lead" />
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/composables/useAuth'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const { subscriber, fetchUserRole } = useAuth()

// =====================================================
// Estado do modal de confirmacao (substitui window.confirm)
// =====================================================
type DialogTone = 'info' | 'warning' | 'danger'
interface DialogState {
  open: boolean
  title: string
  subtitle: string
  tone: DialogTone
  lead: string
  bullets: string[]
  confirmLabel: string
  cancelLabel: string
  loadingLabel: string
  loading: boolean
  resolve: ((v: boolean) => void) | null
}
const confirmDialog = reactive<DialogState>({
  open: false,
  title: '',
  subtitle: '',
  tone: 'info',
  lead: '',
  bullets: [],
  confirmLabel: 'Confirmar',
  cancelLabel: 'Voltar',
  loadingLabel: 'Aguarde...',
  loading: false,
  resolve: null
})

function askConfirmation(opts: Partial<Omit<DialogState, 'open' | 'resolve' | 'loading'>>): Promise<boolean> {
  return new Promise((resolve) => {
    confirmDialog.title = opts.title ?? ''
    confirmDialog.subtitle = opts.subtitle ?? ''
    confirmDialog.tone = opts.tone ?? 'info'
    confirmDialog.lead = opts.lead ?? ''
    confirmDialog.bullets = opts.bullets ?? []
    confirmDialog.confirmLabel = opts.confirmLabel ?? 'Confirmar'
    confirmDialog.cancelLabel = opts.cancelLabel ?? 'Voltar'
    confirmDialog.loadingLabel = opts.loadingLabel ?? 'Aguarde...'
    confirmDialog.loading = false
    confirmDialog.resolve = resolve
    confirmDialog.open = true
  })
}

function closeDialog(answer: boolean) {
  if (confirmDialog.resolve) confirmDialog.resolve(answer)
  confirmDialog.resolve = null
  confirmDialog.open = false
  confirmDialog.loading = false
}

function onConfirmDialog() { closeDialog(true) }
function onCancelDialog()  { closeDialog(false) }

type Plan = 'free' | 'pro' | 'plus'

const loadingCheckout = ref(false)
const loadingManage = ref(false)
const loadingCancel = ref(false)
const loadingRevert = ref(false)
const loadingChange = ref<Plan | null>(null)
const errorMessage = ref('')

async function startCheckout(plan: 'pro' | 'plus') {
  errorMessage.value = ''
  loadingCheckout.value = true
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', { body: { plan } })
    if (error) throw error
    if (!data?.checkoutUrl) throw new Error('URL de checkout não retornada')
    window.location.href = data.checkoutUrl
  } catch (err) {
    console.error('Checkout error:', err)
    errorMessage.value = err instanceof Error ? err.message : 'Não foi possível iniciar o pagamento.'
    loadingCheckout.value = false
  }
}

// Cliente ja pagante muda de plano (upgrade imediato ou downgrade agendado).
async function changePlan(targetPlan: Plan) {
  errorMessage.value = ''
  loadingChange.value = targetPlan
  try {
    const { data, error } = await supabase.functions.invoke('change-plan', { body: { targetPlan } })
    if (error) {
      const msg = (data as { error?: string })?.error
        ?? (error instanceof Error ? error.message : 'Não foi possível mudar de plano agora.')
      throw new Error(msg)
    }
    await fetchUserRole()
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Não foi possível mudar de plano agora.'
  } finally {
    loadingChange.value = null
  }
}

const planLabel = computed(() => ({
  free: 'Comunidade', pro: 'Pro', plus: 'Plus'
}[subscriber.value?.plan || 'free']))

const planPriceValue = computed(() => ({
  free: 'Grátis', pro: 'R$ 5,00', plus: 'R$ 10,00'
}[subscriber.value?.plan || 'free']))

const planPriceSuffix = computed(() =>
  subscriber.value?.plan === 'free' ? '' : 'por mês'
)

const statusLabel = computed(() => ({
  active: 'Ativo',
  pending: 'Aguardando pagamento',
  past_due: 'Pagamento em atraso',
  canceled: 'Cancelado'
}[subscriber.value?.status || 'pending']))

const statusCopy = computed(() => {
  const s = subscriber.value?.status
  const p = subscriber.value?.plan
  if (s === 'active' && p === 'free') return 'Você tem acesso aos canais públicos da Comunidade.'
  if (s === 'active') return 'Tudo em ordem. Você está recebendo as vagas do seu perfil no WhatsApp.'
  if (s === 'pending') return 'Estamos aguardando a confirmação do seu pagamento. Pode levar alguns minutos.'
  if (s === 'past_due') return 'Identificamos um pagamento em atraso. Atualize sua forma de pagamento para continuar recebendo vagas.'
  if (s === 'canceled') return 'Sua assinatura foi encerrada. Reative para voltar a receber vagas.'
  return ''
})

const msgTone = computed(() => {
  const s = subscriber.value?.status
  if (s === 'active') return 'ok'
  if (s === 'pending') return 'warn'
  return 'danger'
})

const needsCheckout = computed(() =>
  subscriber.value?.status === 'pending' && subscriber.value?.plan !== 'free'
)
const canManage = computed(() =>
  subscriber.value?.status === 'active' && subscriber.value?.plan !== 'free'
)
const canCancel = computed(() =>
  // 'Cancelar assinatura' so faz sentido para Pro/Plus active sem
  // agendamento ja em curso. past_due usa o Customer Portal.
  subscriber.value?.status === 'active'
  && subscriber.value?.plan !== 'free'
  && !subscriber.value?.scheduled_plan
)

const hasScheduledChange = computed(() => Boolean(subscriber.value?.scheduled_plan))
const scheduledPlanLabel = computed(() => ({
  free: 'Comunidade (Grátis)',
  pro: 'Pro',
  plus: 'Plus'
}[(subscriber.value?.scheduled_plan as Plan) || 'free']))

// Mudancas de plano so liberadas para clientes 'active' sem agendamento.
// past_due, pending e canceled precisam regularizar antes (Customer Portal).
const canChangePlan = computed(() =>
  subscriber.value?.status === 'active' && !subscriber.value?.scheduled_plan
)

// ----- O que o plano inclui -----
// Fonte de verdade: apps/whatsapp/sender/src/utils/database.js
//  - Plus: envio privado (DM) com filtro de IA pelo perfil
//  - Pro:  acesso ao grupo exclusivo do WhatsApp, todas as vagas de TI
//  - Free: nada do bot, só canais publicos da Comunidade
const planFeatures = computed<string[]>(() => {
  const p = subscriber.value?.plan
  if (p === 'plus') {
    return [
      'Vagas no seu WhatsApp privado (DM individual)',
      'IA analisa e filtra cada vaga pelo seu perfil',
      'Match score individual por vaga (0–100)',
      'Prioridade no recebimento das vagas novas',
      'Sem duplicatas e sem ruído'
    ]
  }
  if (p === 'pro') {
    return [
      'Acesso ao grupo exclusivo Pro no WhatsApp',
      'Todas as vagas de TI das principais plataformas',
      'Atualização contínua, sem duplicatas'
    ]
  }
  return [
    'Acesso aos canais públicos da Comunidade',
    'Vagas gerais sem filtro personalizado'
  ]
})

const includesCopy = computed(() => {
  const p = subscriber.value?.plan
  if (p === 'plus') return 'Você recebe no privado, com curadoria por IA do que combina com seu perfil.'
  if (p === 'pro') return 'Todas as vagas de TI no grupo exclusivo Pro, sem filtro personalizado.'
  return 'Faça upgrade para receber vagas direto no WhatsApp.'
})

// ----- Opcoes de mudanca de plano -----
type PlanOption = {
  tier: Plan
  label: string
  price: string
  featured: boolean
  sub: string
  ctaLabel: string
  features: string[]
  action: 'checkout' | 'change'
}

const changeHeading = computed(() => {
  const p = subscriber.value?.plan
  if (p === 'free') return 'Receba vagas direto no seu WhatsApp'
  if (p === 'pro') return 'Quer mudar de plano?'
  if (p === 'plus') return 'Quer mudar de plano?'
  return ''
})
const changeCopy = computed(() => {
  const p = subscriber.value?.plan
  if (p === 'free') return 'Os planos pagos entregam vagas curadas para o seu perfil, em tempo real. 7 dias grátis em qualquer um.'
  if (p === 'pro') return 'Upgrade pro Plus é imediato: você só paga a diferença prorateada. Downgrade pra Comunidade só acontece no fim do período já pago.'
  if (p === 'plus') return 'Downgrade pra Pro ou Comunidade acontece só no fim do período já pago. Sem reembolso, sem cobrança extra.'
  return ''
})

const PRO_OPTION = (action: 'checkout' | 'change', ctaLabel: string, sub: string, featured = false): PlanOption => ({
  tier: 'pro',
  label: 'Pro',
  price: 'R$ 5',
  featured,
  sub,
  ctaLabel,
  features: [
    'Grupo exclusivo Pro no WhatsApp',
    'Todas as vagas de TI, em tempo real',
    'Sem duplicatas, sem ruído'
  ],
  action
})
const PLUS_OPTION = (action: 'checkout' | 'change', ctaLabel: string, sub: string, featured = true): PlanOption => ({
  tier: 'plus',
  label: 'Plus',
  price: 'R$ 10',
  featured,
  sub,
  ctaLabel,
  features: [
    'Vagas direto no seu WhatsApp privado (DM)',
    'IA filtra cada vaga pelo seu perfil',
    'Match score 0–100 por vaga',
    'Prioridade no recebimento — sem ruído do grupo'
  ],
  action
})
const FREE_OPTION = (sub: string): PlanOption => ({
  tier: 'free',
  label: 'Comunidade',
  price: 'Grátis',
  featured: false,
  sub,
  ctaLabel: 'Voltar pra Comunidade no fim do período',
  features: [
    'Canais públicos da comunidade',
    'Vagas gerais sem filtro personalizado'
  ],
  action: 'change'
})

const changeOptions = computed<PlanOption[]>(() => {
  const p = subscriber.value?.plan
  if (p === 'free') {
    return [
      PRO_OPTION('checkout', 'Assinar Pro', '7 dias grátis. Cancele quando quiser.'),
      PLUS_OPTION('checkout', 'Assinar Plus', '7 dias grátis. Cancele quando quiser.', true)
    ]
  }
  if (p === 'pro') {
    return [
      PLUS_OPTION('change', 'Fazer upgrade agora', 'Imediato. Você paga só a diferença prorateada.', true)
    ]
  }
  if (p === 'plus') {
    return [
      PRO_OPTION('change', 'Trocar pro Pro no fim do período', 'A mudança vira efetiva em ' + formatDate(subscriber.value?.current_period_end || '') + '.', true)
    ]
  }
  return []
})

async function onChoose(option: PlanOption) {
  if (option.action === 'checkout' && (option.tier === 'pro' || option.tier === 'plus')) {
    await startCheckout(option.tier)
    return
  }
  // Upgrade Pro -> Plus: confirma o ganho de canal privado + IA.
  if (option.tier === 'plus' && subscriber.value?.plan === 'pro') {
    const ok = await askConfirmation({
      title: 'Fazer upgrade para o Plus?',
      subtitle: 'A mudança é imediata.',
      tone: 'info',
      lead: 'Você sai do <strong>grupo Pro</strong> e passa a receber as vagas no <strong>seu WhatsApp privado</strong>, filtradas pela IA conforme seu perfil.',
      bullets: [
        'Vagas filtradas pelo seu perfil, com match score 0–100',
        'Recebimento no seu WhatsApp privado (não no grupo)',
        'Você paga só a diferença prorateada do mês atual'
      ],
      confirmLabel: 'Sim, fazer upgrade',
      cancelLabel: 'Continuar no Pro',
      loadingLabel: 'Aplicando upgrade...'
    })
    if (!ok) return
  }
  // Downgrade Plus -> Pro: explica que sai do privado e vai pro grupo.
  if (option.tier === 'pro' && subscriber.value?.plan === 'plus') {
    const when = formatDate(subscriber.value?.current_period_end || '')
    const ok = await askConfirmation({
      title: 'Trocar para o plano Pro?',
      subtitle: `A mudança vira efetiva em ${when}.`,
      tone: 'warning',
      lead: 'Você está fazendo um downgrade. <strong>Você deixa de receber as vagas no seu WhatsApp privado e passa a receber no grupo exclusivo Pro</strong> — todas as vagas de TI, sem filtro pelo seu perfil e sem match score por IA.',
      bullets: [
        `Você continua no Plus (privado + IA) até ${when}`,
        'A partir dessa data você entra no grupo Pro do WhatsApp',
        'Pode reverter a qualquer momento antes da data'
      ],
      confirmLabel: 'Sim, agendar downgrade',
      cancelLabel: 'Continuar no Plus',
      loadingLabel: 'Agendando...'
    })
    if (!ok) return
  }
  confirmDialog.loading = true
  try {
    await changePlan(option.tier)
    closeDialog(true)
  } finally {
    confirmDialog.loading = false
  }
}

async function onRevert() {
  const planFriendly = planLabel.value
  const targetFriendly = scheduledPlanLabel.value
  const ok = await askConfirmation({
    title: `Manter o ${planFriendly}?`,
    subtitle: `Vamos cancelar a mudança agendada para ${targetFriendly}.`,
    tone: 'info',
    lead: `Sua assinatura volta ao estado normal e continua no <strong>${planFriendly}</strong> com renovação automática. Nada será cobrado a mais.`,
    confirmLabel: `Sim, manter ${planFriendly}`,
    cancelLabel: 'Voltar',
    loadingLabel: 'Cancelando agendamento...'
  })
  if (!ok) return

  confirmDialog.loading = true
  errorMessage.value = ''
  loadingRevert.value = true
  try {
    const { error } = await supabase.functions.invoke('revert-scheduled-change')
    if (error) throw error
    await fetchUserRole()
    closeDialog(true)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Não foi possível cancelar o agendamento.'
    confirmDialog.loading = false
  } finally {
    loadingRevert.value = false
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function goCheckout() {
  const plan = subscriber.value?.plan
  if (plan !== 'pro' && plan !== 'plus') return
  startCheckout(plan)
}

async function goManage() {
  errorMessage.value = ''
  loadingManage.value = true
  try {
    const { data, error } = await supabase.functions.invoke('create-portal-session')
    if (error) throw error
    if (!data?.portalUrl) throw new Error('Portal URL não retornada')
    window.location.href = data.portalUrl
  } catch (err) {
    console.error('Portal error:', err)
    errorMessage.value = err instanceof Error ? err.message : 'Não foi possível abrir o portal.'
    loadingManage.value = false
  }
}

async function onCancel() {
  const when = formatDate(subscriber.value?.current_period_end || '')
  const planFriendly = planLabel.value
  const isPlus = subscriber.value?.plan === 'plus'
  const channelNow = isPlus
    ? 'no seu WhatsApp privado, com IA filtrando pelo seu perfil'
    : 'no grupo Pro do WhatsApp, com todas as vagas de TI'
  const ok = await askConfirmation({
    title: 'Cancelar sua assinatura?',
    subtitle: `Você continua com o ${planFriendly} até ${when}.`,
    tone: 'danger',
    lead: `Sem cobrança extra, sem reembolso. Hoje você recebe vagas <strong>${channelNow}</strong>. Depois do fim do período, você <strong>sai do canal pago</strong> e volta para a Comunidade (apenas canais públicos do Discord e WhatsApp).`,
    bullets: [
      `Acesso ao ${planFriendly} mantido até ${when}`,
      'Depois sua conta vira Comunidade (gratuita)',
      'Pode reverter o cancelamento a qualquer momento antes dessa data'
    ],
    confirmLabel: 'Sim, cancelar',
    cancelLabel: 'Continuar assinando',
    loadingLabel: 'Cancelando...'
  })
  if (!ok) return

  confirmDialog.loading = true
  errorMessage.value = ''
  loadingCancel.value = true
  try {
    const { data, error } = await supabase.functions.invoke('change-plan', { body: { targetPlan: 'free' } })
    if (error) {
      const msg = (data as { error?: string })?.error
        ?? (error instanceof Error ? error.message : 'Não foi possível cancelar agora.')
      throw new Error(msg)
    }
    await fetchUserRole()
    closeDialog(true)
  } catch (err) {
    console.error('Cancel error:', err)
    errorMessage.value = err instanceof Error ? err.message : 'Não foi possível cancelar agora.'
    confirmDialog.loading = false
  } finally {
    loadingCancel.value = false
  }
}

</script>

<style scoped>
.dsub {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.dsub-top {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-5);
  align-items: stretch;
}
@media (min-width: 960px) {
  .dsub-top { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); }
}

.dsub-card {
  position: relative;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  overflow: hidden;
  isolation: isolate;
}

/* ---------- Hero ---------- */
.dsub-hero {
  border-color: color-mix(in srgb, var(--color-accent) 20%, var(--color-border));
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.dsub-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(70% 55% at 100% 0%, var(--color-accent-soft), transparent 65%);
  pointer-events: none;
  z-index: -1;
}

.dsub-hero__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
}

.dsub-eyebrow {
  font-size: var(--text-xs);
  letter-spacing: var(--ls-wide);
  text-transform: uppercase;
  color: var(--color-text-muted);
  font-weight: var(--font-semibold);
  margin: 0;
}
.dsub-plan {
  font-size: var(--text-4xl);
  letter-spacing: var(--ls-tight);
  font-weight: var(--font-bold);
  line-height: var(--lh-tight);
  margin: var(--space-1) 0 var(--space-1);
}
.dsub-price { margin: 0; display: flex; align-items: baseline; gap: var(--space-1); }
.dsub-price__value {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
}
.dsub-price__suffix { font-size: var(--text-sm); color: var(--color-text-muted); }

.status-pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-wide);
  text-transform: uppercase;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: currentColor;
}
.status-pill--active   { background: var(--color-success-soft); color: var(--color-success); border-color: color-mix(in srgb, var(--color-success) 30%, transparent); }
.status-pill--pending  { background: var(--color-warning-soft); color: var(--color-warning); border-color: color-mix(in srgb, var(--color-warning) 30%, transparent); }
.status-pill--past_due,
.status-pill--canceled { background: var(--color-error-soft);   color: var(--color-error);   border-color: color-mix(in srgb, var(--color-error) 30%, transparent); }

.dsub-hero__msg {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
  font-size: var(--text-sm);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-accent);
}
.dsub-hero__msg--ok     { border-left-color: var(--color-success); }
.dsub-hero__msg--warn   { border-left-color: var(--color-warning); }
.dsub-hero__msg--danger { border-left-color: var(--color-error); }

.dsub-scheduled {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-warning-soft);
  border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
  border-radius: var(--radius-md);
}
.dsub-scheduled__text { flex: 1 1 240px; min-width: 0; }
.dsub-scheduled__text strong { color: var(--color-warning); }
.dsub-scheduled__text p {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  line-height: var(--lh-body);
  color: var(--color-text-primary);
}

/* Meta */
.dsub-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--space-4);
  margin: 0;
  padding-top: var(--space-1);
  border-top: 1px solid var(--color-border-subtle);
}
.dsub-meta div { display: flex; flex-direction: column; gap: 2px; padding-top: var(--space-3); }
.dsub-meta dt {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  color: var(--color-text-muted);
  font-weight: var(--font-semibold);
}
.dsub-meta dd {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  margin: 0;
  font-weight: var(--font-medium);
  word-break: break-word;
}

.dsub-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}

.dsub-error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-error-soft);
  color: var(--color-error);
  font-size: var(--text-sm);
  border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
}

.btn-danger-link {
  color: var(--color-error);
  border-color: transparent;
  background: transparent;
}
.btn-danger-link:hover {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 8%, transparent);
}

/* ---------- Includes ---------- */
.dsub-includes {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.dsub-includes__head h3 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-tight);
}
.dsub-includes__head p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: var(--lh-body);
}
.dsub-includes__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
}
.dsub-includes__list li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  line-height: var(--lh-body);
}
.dsub-check {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.dsub-includes__link {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--color-accent);
  text-decoration: none;
}
.dsub-includes__link:hover { text-decoration: underline; }

/* ---------- Upgrade ---------- */
.dsub-upgrade { display: flex; flex-direction: column; gap: var(--space-4); }
.dsub-upgrade__head h3 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-tight);
  line-height: var(--lh-title);
}
.dsub-upgrade__head p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-base);
  line-height: var(--lh-body);
}

.dsub-plans {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}
@media (min-width: 720px) {
  .dsub-plans { grid-template-columns: repeat(2, 1fr); }
}

.dsub-plan-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  transition: box-shadow var(--transition-base);
}
.dsub-plan-card:hover { box-shadow: var(--shadow-md); }

.dsub-plan-card--featured {
  position: relative;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent) inset, var(--shadow-lg);
  background: linear-gradient(180deg, var(--color-accent-soft), transparent 50%), var(--color-background);
}
.dsub-plan-card--featured::before {
  content: 'Recomendado';
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  padding: 3px var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: var(--color-text-inverse);
  font-size: 10px;
  font-weight: var(--font-bold);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
}
.dsub-plan-card--featured:hover { box-shadow: 0 0 0 1px var(--color-accent) inset, var(--shadow-xl); }

.dsub-plan-card__head { display: flex; flex-direction: column; gap: var(--space-1); }
.dsub-plan-card__eyebrow {
  font-size: var(--text-xs);
  letter-spacing: var(--ls-wide);
  text-transform: uppercase;
  color: var(--color-accent);
  font-weight: var(--font-semibold);
}
.dsub-plan-card__price {
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  letter-spacing: var(--ls-tight);
  color: var(--color-text-primary);
}
.dsub-plan-card__sub {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
}
.dsub-plan-card__price small {
  font-size: var(--text-sm);
  font-weight: var(--font-normal);
  color: var(--color-text-muted);
  margin-left: var(--space-1);
}
.dsub-plan-card__features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
}
.dsub-plan-card__features li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  line-height: var(--lh-body);
}

/* ---------- Suporte ---------- */
.dsub-support {
  margin: 0;
  text-align: center;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
</style>

<template>
  <div class="dsub">
    <!-- Card de status -->
    <article class="dsub-card dsub-status">
      <div class="dsub-status__top">
        <div>
          <p class="dsub-eyebrow">Plano atual</p>
          <h2 class="dsub-plan">{{ planLabel }}</h2>
          <p class="dsub-price">{{ planPrice }}</p>
        </div>
        <span :class="['status-pill', `status-pill--${subscriber?.status}`]">
          {{ statusLabel }}
        </span>
      </div>

      <p class="dsub-status__msg">{{ statusCopy }}</p>

      <dl class="dsub-meta">
        <div>
          <dt>E-mail de cobrança</dt>
          <dd>{{ subscriber?.email }}</dd>
        </div>
        <div v-if="subscriber?.current_period_end">
          <dt>Próxima cobrança</dt>
          <dd>{{ formatDate(subscriber.current_period_end) }}</dd>
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
          @click="goCheckout"
          :disabled="loadingCheckout"
        >
          {{ loadingCheckout ? 'Aguarde…' : 'Continuar pagamento' }}
        </button>

        <button
          v-if="canManage"
          class="btn btn-secondary"
          @click="goManage"
          :disabled="loadingManage"
        >
          {{ loadingManage ? 'Abrindo…' : 'Gerenciar pagamento' }}
        </button>

        <button
          v-if="canCancel"
          class="btn btn-ghost btn-danger-link"
          @click="onCancel"
          :disabled="loadingCancel"
        >
          {{ loadingCancel ? 'Cancelando…' : 'Cancelar assinatura' }}
        </button>
      </div>

      <p v-if="errorMessage" class="dsub-error" role="alert">{{ errorMessage }}</p>
    </article>

    <!-- Comparativo dos planos -->
    <section v-if="subscriber?.plan !== 'plus'" class="dsub-upgrade">
      <header class="dsub-upgrade__head">
        <h3>{{ upgradeHeading }}</h3>
        <p>{{ upgradeCopy }}</p>
      </header>

      <div class="dsub-plans">
        <article
          v-for="p in upgradeOptions"
          :key="p.tier"
          class="dsub-plan-card"
          :class="{ 'dsub-plan-card--featured': p.featured }"
        >
          <header class="dsub-plan-card__head">
            <span class="dsub-plan-card__eyebrow">{{ p.label }}</span>
            <span class="dsub-plan-card__price">
              {{ p.price }}<small>/mês</small>
            </span>
          </header>
          <ul class="dsub-plan-card__features">
            <li v-for="f in p.features" :key="f">
              <svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="9" cy="9" r="7.5" opacity="0.35" />
                <circle cx="9" cy="9" r="4.5" opacity="0.7" />
                <circle cx="9" cy="9" r="2" fill="currentColor" stroke="none" />
              </svg>
              <span>{{ f }}</span>
            </li>
          </ul>
          <button class="btn" :class="p.featured ? 'btn-primary' : 'btn-secondary'" @click="upgrade(p.tier)">
            Escolher {{ p.label }}
          </button>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/composables/useAuth'

const { subscriber } = useAuth()

const loadingCheckout = ref(false)
const loadingManage = ref(false)
const loadingCancel = ref(false)
const errorMessage = ref('')

async function startCheckout(plan: 'pro' | 'plus') {
  errorMessage.value = ''
  loadingCheckout.value = true
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { plan }
    })
    if (error) throw error
    if (!data?.checkoutUrl) throw new Error('URL de checkout não retornada')
    window.location.href = data.checkoutUrl
  } catch (err) {
    console.error('Checkout error:', err)
    errorMessage.value = err instanceof Error ? err.message : 'Não foi possível iniciar o pagamento.'
    loadingCheckout.value = false
  }
}

const planLabel = computed(() => ({
  free: 'Comunidade',
  pro: 'Pro',
  plus: 'Plus'
}[subscriber.value?.plan || 'free']))

const planPrice = computed(() => ({
  free: 'Grátis',
  pro: 'R$ 5,00 por mês',
  plus: 'R$ 10,00 por mês'
}[subscriber.value?.plan || 'free']))

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
  if (s === 'active') return 'Tudo em ordem. Continue recebendo vagas no seu canal.'
  if (s === 'pending') return 'Estamos aguardando a confirmação do seu pagamento. Pode levar alguns minutos.'
  if (s === 'past_due') return 'Identificamos um pagamento em atraso. Atualize sua forma de pagamento para continuar recebendo vagas.'
  if (s === 'canceled') return 'Sua assinatura foi encerrada. Reative para voltar a receber vagas.'
  return ''
})

const needsCheckout = computed(() =>
  subscriber.value?.status === 'pending' && subscriber.value?.plan !== 'free'
)

const canManage = computed(() =>
  subscriber.value?.status === 'active' && subscriber.value?.plan !== 'free'
)

const canCancel = computed(() =>
  ['active', 'past_due'].includes(subscriber.value?.status || '') &&
  subscriber.value?.plan !== 'free'
)

const upgradeHeading = computed(() => {
  if (subscriber.value?.plan === 'free') return 'Receba vagas direto no seu WhatsApp'
  if (subscriber.value?.plan === 'pro') return 'Faça upgrade para o Plus'
  return 'Conheça os planos pagos'
})

const upgradeCopy = computed(() => {
  if (subscriber.value?.plan === 'free') return 'Os planos pagos entregam vagas curadas para o seu perfil, em tempo real.'
  if (subscriber.value?.plan === 'pro') return 'No Plus, a IA analisa cada vaga e calcula o match com o seu perfil.'
  return ''
})

const upgradeOptions = computed(() => {
  const p = subscriber.value?.plan
  const all = [
    {
      tier: 'pro' as const,
      label: 'Pro',
      price: 'R$ 5',
      featured: false,
      features: [
        'Vagas em tempo real no seu canal',
        'Filtro por stack e senioridade',
        'Sem duplicatas, sem ruído'
      ]
    },
    {
      tier: 'plus' as const,
      label: 'Plus',
      price: 'R$ 10',
      featured: true,
      features: [
        'Tudo do Pro',
        'IA filtra vagas pelo seu perfil',
        'Match score por vaga',
        'Prioridade nas vagas novas'
      ]
    }
  ]
  if (p === 'pro') return all.filter(o => o.tier === 'plus')
  return all
})

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
  if (!confirm('Tem certeza que deseja cancelar? Você continua recebendo vagas até o fim do período já pago.')) return
  errorMessage.value = ''
  loadingCancel.value = true
  try {
    const { error } = await supabase.functions.invoke('cancel-own-subscription')
    if (error) throw error
    window.location.reload()
  } catch (err) {
    console.error('Cancel error:', err)
    errorMessage.value = err instanceof Error ? err.message : 'Não foi possível cancelar agora.'
    loadingCancel.value = false
  }
}

function upgrade(tier: 'pro' | 'plus') {
  startCheckout(tier)
}
</script>

<style scoped>
.dsub {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-5);
  align-items: start;
}
@media (min-width: 1024px) {
  .dsub { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
}

.dsub-card {
  position: relative;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  overflow: hidden;
  isolation: isolate;
}

.dsub-status::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(80% 60% at 100% 0%, var(--color-accent-soft), transparent 60%),
    radial-gradient(60% 40% at 0% 100%, color-mix(in srgb, var(--color-accent) 8%, transparent), transparent 70%);
  pointer-events: none;
  z-index: -1;
}

.dsub-status {
  border-color: color-mix(in srgb, var(--color-accent) 18%, var(--color-border));
}

/* Status card */
.dsub-status__top {
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
  margin: var(--space-1) 0 2px;
}

.dsub-price {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-base);
}

.status-pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
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
.status-pill--active   { background: var(--color-success-soft); color: var(--color-success); border-color: color-mix(in srgb, var(--color-success) 30%, transparent); }
.status-pill--pending  { background: var(--color-warning-soft); color: var(--color-warning); border-color: color-mix(in srgb, var(--color-warning) 30%, transparent); }
.status-pill--past_due,
.status-pill--canceled { background: var(--color-error-soft);   color: var(--color-error);   border-color: color-mix(in srgb, var(--color-error) 30%, transparent); }

.dsub-status__msg {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-accent);
}

/* Meta */
.dsub-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
  margin: 0;
}
.dsub-meta div { display: flex; flex-direction: column; gap: 2px; }
.dsub-meta dt {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  color: var(--color-text-muted);
  font-weight: var(--font-semibold);
}
.dsub-meta dd {
  font-size: var(--text-base);
  color: var(--color-text-primary);
  margin: 0;
  font-weight: var(--font-medium);
}

.dsub-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}

.dsub-error {
  margin: var(--space-2) 0 0;
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

/* Upgrade */
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
  box-shadow:
    0 0 0 1px var(--color-accent) inset,
    var(--shadow-lg);
  background:
    linear-gradient(180deg, var(--color-accent-soft), transparent 50%),
    var(--color-background);
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
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-base);
  color: var(--color-text-primary);
}
.dsub-plan-card__features svg {
  flex-shrink: 0;
  color: var(--color-accent);
}
</style>

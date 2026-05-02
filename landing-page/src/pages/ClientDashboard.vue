<template>
  <main class="dash">
    <header class="dash-bar">
      <router-link to="/" class="dash-brand" aria-label="Sonnar - Início">
        <span class="dash-logo">S</span>
        <span class="dash-name">Sonnar</span>
      </router-link>

      <button class="dash-logout" @click="onLogout">Sair</button>
    </header>

    <section class="dash-content">
      <div class="dash-greet">
        <p class="dash-eyebrow">{{ planLabel }}</p>
        <h1 class="dash-title">Olá, {{ firstName }} 👋</h1>
        <p class="dash-sub">{{ statusCopy }}</p>
      </div>

      <div class="dash-grid">
        <article class="dash-card">
          <header class="dash-card__head">
            <h2>Sua assinatura</h2>
            <span :class="['status-pill', `status-pill--${subscriber?.status}`]">
              {{ statusLabel }}
            </span>
          </header>
          <dl class="dash-meta">
            <div><dt>Plano</dt><dd>{{ planLabel }}</dd></div>
            <div><dt>E-mail</dt><dd>{{ subscriber?.email }}</dd></div>
            <div v-if="subscriber?.current_period_end">
              <dt>Próxima renovação</dt>
              <dd>{{ formatDate(subscriber.current_period_end) }}</dd>
            </div>
          </dl>
        </article>

        <article v-if="profile" class="dash-card">
          <header class="dash-card__head">
            <h2>Seu perfil de busca</h2>
          </header>
          <dl class="dash-meta">
            <div><dt>WhatsApp</dt><dd>{{ formatWhatsApp(profile.whatsapp) }}</dd></div>
            <div><dt>Senioridade</dt><dd>{{ seniorityLabel }}</dd></div>
            <div><dt>Modelo</dt><dd>{{ workModelLabel }}</dd></div>
            <div v-if="profile.location"><dt>Local</dt><dd>{{ profile.location }}</dd></div>
            <div v-if="profile.min_salary">
              <dt>Salário mínimo</dt>
              <dd>R$ {{ profile.min_salary.toLocaleString('pt-BR') }}</dd>
            </div>
            <div class="dash-meta__full">
              <dt>Stack</dt>
              <dd class="stack-list">
                <span v-for="t in profile.stack" :key="t" class="stack-tag">{{ t }}</span>
              </dd>
            </div>
          </dl>
        </article>

        <article v-if="needsCheckout" class="dash-card dash-card--cta">
          <h2>Finalize seu pagamento</h2>
          <p>
            Sua conta está aguardando pagamento para começar a receber vagas no seu canal.
          </p>
          <button class="btn btn-primary btn-lg" @click="goCheckout" :disabled="loadingCheckout">
            {{ loadingCheckout ? 'Aguarde…' : 'Continuar para o pagamento' }}
          </button>
        </article>

        <article v-else-if="subscriber?.plan === 'free'" class="dash-card dash-card--cta">
          <h2>Acesse a Comunidade</h2>
          <p>
            Seu plano Comunidade dá acesso aos canais públicos do Sonnar.
          </p>
          <a class="btn btn-secondary btn-lg" href="https://discord.gg/sonnar" target="_blank" rel="noopener">
            Entrar no Discord
          </a>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { supabase } from '@/integrations/supabase/client'
import type { Database } from '@/integrations/supabase/types'

type Profile = Database['public']['Tables']['subscriber_profiles']['Row']

const router = useRouter()
const { user, subscriber, signOut } = useAuth()

const profile = ref<Profile | null>(null)
const loadingCheckout = ref(false)

const firstName = computed(() => {
  const name = subscriber.value?.name || user.value?.email?.split('@')[0] || 'pessoa'
  return name.split(' ')[0]
})

const planLabel = computed(() => ({
  free: 'Comunidade',
  pro: 'Pro',
  plus: 'Plus'
}[subscriber.value?.plan || 'free']))

const statusLabel = computed(() => ({
  active: 'Ativo',
  pending: 'Aguardando pagamento',
  past_due: 'Pagamento em atraso',
  canceled: 'Cancelado'
}[subscriber.value?.status || 'pending']))

const statusCopy = computed(() => {
  const s = subscriber.value?.status
  if (s === 'pending') return 'Sua conta está aguardando o pagamento ser confirmado.'
  if (s === 'past_due') return 'Identificamos um pagamento em atraso. Atualize sua forma de pagamento.'
  if (s === 'canceled') return 'Sua assinatura foi cancelada. Reative quando quiser.'
  return 'Suas vagas estão chegando direto onde você prefere.'
})

const needsCheckout = computed(() =>
  subscriber.value?.status === 'pending' && subscriber.value?.plan !== 'free'
)

const seniorityLabel = computed(() => ({
  junior: 'Júnior',
  pleno: 'Pleno',
  senior: 'Sênior',
  staff_lead: 'Staff / Lead'
}[profile.value?.seniority || 'pleno']))

const workModelLabel = computed(() => {
  const map: Record<string, string> = { remote: 'Remoto', hybrid: 'Híbrido', onsite: 'Presencial' }
  return (profile.value?.work_models || []).map(m => map[m] || m).join(' · ')
})

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatWhatsApp(e164: string) {
  if (!e164) return ''
  if (e164.startsWith('55') && e164.length >= 12) {
    const ddd = e164.slice(2, 4)
    const rest = e164.slice(4)
    return `+55 (${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`
  }
  return `+${e164}`
}

async function fetchProfile() {
  if (!subscriber.value?.id) return
  const { data } = await supabase
    .from('subscriber_profiles')
    .select('*')
    .eq('subscriber_id', subscriber.value.id)
    .maybeSingle()
  profile.value = data ?? null
}

function goCheckout() {
  // Placeholder até o passo 7 (integração Stripe)
  loadingCheckout.value = true
  setTimeout(() => {
    loadingCheckout.value = false
    alert('Integração com Stripe será implementada no próximo passo.')
  }, 600)
}

async function onLogout() {
  await signOut()
  router.push('/login')
}

onMounted(async () => {
  // Auth garantida pelo authGuard do router.
  await fetchProfile()
})
</script>

<style scoped>
.dash {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--color-background);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
}

.dash-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) clamp(var(--space-4), 4vw, var(--space-8));
  border-bottom: 1px solid var(--color-border);
  background: var(--header-bg);
  backdrop-filter: blur(8px);
}

.dash-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  text-decoration: none;
  color: var(--color-text-primary);
}

.dash-logo {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  background: var(--color-accent);
  color: var(--color-text-inverse);
  border-radius: var(--radius-md);
  font-weight: var(--font-bold);
  box-shadow: var(--shadow-sm);
}

.dash-name {
  font-weight: var(--font-bold);
  font-size: var(--text-lg);
  letter-spacing: var(--ls-tight);
}

.dash-logout {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-button);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  min-height: var(--control-height-md);
}
.dash-logout:hover {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}

.dash-content {
  flex: 1;
  width: 100%;
  max-width: var(--container-max);
  margin: 0 auto;
  padding: clamp(var(--space-6), 5vw, var(--space-12)) clamp(var(--space-4), 4vw, var(--space-8));
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.dash-greet {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.dash-eyebrow {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-wide);
  text-transform: uppercase;
  color: var(--color-accent);
  margin: 0;
}

.dash-title {
  font-size: var(--text-5xl);
  font-weight: var(--font-bold);
  letter-spacing: var(--ls-tight);
  line-height: var(--lh-tight);
  margin: 0;
}

.dash-sub {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  margin: 0;
  max-width: 560px;
  line-height: var(--lh-body);
}

.dash-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
  align-items: start;
}
@media (min-width: 720px) {
  .dash-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1280px) {
  .dash-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.dash-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  transition: box-shadow var(--transition-base);
}
.dash-card:hover { box-shadow: var(--shadow-md); }

.dash-card h2 {
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-tight);
  line-height: var(--lh-title);
  margin: 0;
}

.dash-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.status-pill {
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
.status-pill--active {
  background: var(--color-success-soft);
  color: var(--color-success);
  border-color: color-mix(in srgb, var(--color-success) 30%, transparent);
}
.status-pill--pending {
  background: var(--color-warning-soft);
  color: var(--color-warning);
  border-color: color-mix(in srgb, var(--color-warning) 30%, transparent);
}
.status-pill--past_due,
.status-pill--canceled {
  background: var(--color-error-soft);
  color: var(--color-error);
  border-color: color-mix(in srgb, var(--color-error) 30%, transparent);
}

.dash-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3) var(--space-4);
  margin: 0;
}
.dash-meta div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dash-meta__full { grid-column: 1 / -1; }
.dash-meta dt {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  color: var(--color-text-muted);
  font-weight: var(--font-semibold);
}
.dash-meta dd {
  font-size: var(--text-base);
  color: var(--color-text-primary);
  margin: 0;
  font-weight: var(--font-medium);
  word-break: break-word;
}

.stack-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
}
.stack-tag {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent-muted);
  color: var(--color-accent);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}

.dash-card--cta {
  background: linear-gradient(180deg, var(--color-accent-soft), var(--color-background));
  border-color: var(--color-accent);
  align-items: flex-start;
}
.dash-card--cta h2 {
  font-size: var(--text-2xl);
}
.dash-card--cta p {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
}
.dash-card--cta .btn {
  align-self: flex-start;
}
</style>

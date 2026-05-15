<template>
  <main class="pay-page">
    <section class="pay-card">
      <div class="pay-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="32" cy="32" r="6" fill="currentColor" stroke="none" />
          <circle cx="32" cy="32" r="14" opacity="0.6" />
          <circle cx="32" cy="32" r="22" opacity="0.35" />
          <circle cx="32" cy="32" r="30" opacity="0.18" />
        </svg>
      </div>

      <p class="pay-eyebrow">Quase lá</p>
      <h1 class="pay-title">Ative seu plano {{ planLabel }}</h1>
      <p class="pay-lead">Falta só configurar a forma de pagamento para começar.</p>

      <p v-if="errorMessage" class="pay-error" role="alert">{{ errorMessage }}</p>
      <p v-if="canceledMessage" class="pay-info" role="status">
        Pagamento não concluído. Tente novamente quando quiser.
      </p>

      <div class="pay-actions">
        <button class="btn btn-primary btn-lg" :disabled="loading" @click="goCheckout">
          <span v-if="!loading">Ir para pagamento</span>
          <span v-else>Aguarde…</span>
        </button>
        <button class="btn btn-ghost" :disabled="loading" @click="logout">
          Sair da conta
        </button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const router = useRouter()
const { subscriber } = useAuth()

const loading = ref(false)
const errorMessage = ref('')
const canceledMessage = computed(() => route.query.canceled === 'true')

const planLabel = computed(() => {
  const p = subscriber.value?.plan
  if (p === 'pro') return 'Pro'
  if (p === 'plus') return 'Plus'
  return ''
})

onMounted(() => {
  if (subscriber.value?.plan === 'free' || subscriber.value?.status === 'active') {
    router.replace('/dashboard')
  }
})

async function goCheckout() {
  errorMessage.value = ''
  const plan = subscriber.value?.plan
  if (plan !== 'pro' && plan !== 'plus') {
    errorMessage.value = 'Plano inválido. Escolha Pro ou Plus.'
    return
  }

  loading.value = true
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
    loading.value = false
  }
}

async function logout() {
  await supabase.auth.signOut()
  router.replace('/login')
}
</script>

<style scoped>
.pay-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: var(--space-6) var(--space-4);
  background:
    radial-gradient(60% 50% at 50% 0%, var(--color-accent-soft), transparent 60%),
    var(--color-background);
}

.pay-card {
  width: 100%;
  max-width: 520px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: clamp(var(--space-5), 4vw, var(--space-7));
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  box-shadow: var(--shadow-lg);
}

.pay-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto;
  color: var(--color-accent);
  animation: pay-pulse 2.4s ease-in-out infinite;
}
.pay-icon svg { width: 100%; height: 100%; }
@keyframes pay-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.06); opacity: 0.85; }
}

.pay-eyebrow {
  margin: 0;
  text-align: center;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: var(--font-semibold);
  color: var(--color-accent);
}

.pay-title {
  margin: 0;
  text-align: center;
  font-size: clamp(var(--text-2xl), 4vw, var(--text-3xl));
  font-weight: var(--font-bold);
  letter-spacing: var(--ls-tight);
  line-height: var(--lh-title);
}

.pay-lead {
  margin: 0;
  text-align: center;
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
}

.pay-error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-error-soft);
  color: var(--color-error);
  border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.pay-info {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-warning-soft);
  color: var(--color-warning);
  border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.pay-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.pay-actions .btn { width: 100%; justify-content: center; }
</style>

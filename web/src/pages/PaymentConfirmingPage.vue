<template>
  <main class="confirm-page">
    <section class="confirm-card">
      <div class="confirm-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="32" cy="32" r="6" fill="currentColor" stroke="none" />
          <circle cx="32" cy="32" r="14" opacity="0.6" />
          <circle cx="32" cy="32" r="22" opacity="0.35" />
          <circle cx="32" cy="32" r="30" opacity="0.18" />
        </svg>
      </div>

      <template v-if="phase === 'pending'">
        <p class="confirm-eyebrow">Quase lá</p>
        <h1 class="confirm-title">Confirmando seu pagamento</h1>
        <p class="confirm-lead">
          A Stripe está validando sua assinatura. Isso costuma levar poucos
          segundos - não feche essa janela.
        </p>
        <div class="confirm-progress" role="status" aria-live="polite">
          <span class="confirm-spinner" aria-hidden="true"></span>
          <span>Aguardando confirmação… ({{ elapsed }}s)</span>
        </div>
      </template>

      <template v-else-if="phase === 'success'">
        <p class="confirm-eyebrow">Tudo certo</p>
        <h1 class="confirm-title">Pagamento confirmado!</h1>
        <p class="confirm-lead">Levando você para o painel…</p>
      </template>

      <template v-else-if="phase === 'timeout'">
        <p class="confirm-eyebrow confirm-eyebrow--warn">Demorou mais que o esperado</p>
        <h1 class="confirm-title">Ainda não recebemos a confirmação</h1>
        <p class="confirm-lead">
          A Stripe pode estar processando. Você pode esperar mais um pouco ou
          tentar novamente - qualquer cobrança já feita não será duplicada.
        </p>

        <div class="confirm-actions">
          <button class="btn btn-primary btn-lg" :disabled="checkingNow" @click="manualCheck">
            <span v-if="!checkingNow">Verificar novamente</span>
            <span v-else>Verificando…</span>
          </button>
          <router-link to="/pagar" class="btn btn-ghost">Refazer pagamento</router-link>
        </div>
      </template>

      <template v-else-if="phase === 'unauth'">
        <p class="confirm-eyebrow confirm-eyebrow--warn">Sessão expirada</p>
        <h1 class="confirm-title">Faça login para continuar</h1>
        <p class="confirm-lead">
          Sua sessão expirou enquanto você estava no checkout. Entre de novo -
          se o pagamento foi concluído, sua assinatura já está ativa.
        </p>
        <div class="confirm-actions">
          <router-link to="/login" class="btn btn-primary btn-lg">Ir para login</router-link>
        </div>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/integrations/supabase/client'

type Phase = 'pending' | 'success' | 'timeout' | 'unauth'

const router = useRouter()
const phase = ref<Phase>('pending')
const elapsed = ref(0)
const checkingNow = ref(false)

const POLL_INTERVAL_MS = 1500
const TIMEOUT_MS = 60_000

let pollTimer: ReturnType<typeof setInterval> | null = null
let timeoutHandle: ReturnType<typeof setTimeout> | null = null
let elapsedTimer: ReturnType<typeof setInterval> | null = null
let startedAt = 0

function stopAll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null }
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
}

async function checkStatus(): Promise<'active' | 'pending' | 'unauth'> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return 'unauth'
  const { data } = await supabase
    .from('subscribers')
    .select('status')
    .eq('user_id', session.user.id)
    .maybeSingle()
  return data?.status === 'active' ? 'active' : 'pending'
}

async function tick() {
  const result = await checkStatus()
  if (result === 'active') {
    phase.value = 'success'
    stopAll()
    setTimeout(() => router.replace('/dashboard?upgrade=success'), 800)
    return
  }
  if (result === 'unauth') {
    phase.value = 'unauth'
    stopAll()
  }
}

async function manualCheck() {
  if (checkingNow.value) return
  checkingNow.value = true
  try {
    const result = await checkStatus()
    if (result === 'active') {
      phase.value = 'success'
      setTimeout(() => router.replace('/dashboard?upgrade=success'), 800)
      return
    }
    if (result === 'unauth') {
      phase.value = 'unauth'
      return
    }
    // ainda pendente - reinicia o polling por mais 60s
    phase.value = 'pending'
    elapsed.value = 0
    startPolling()
  } finally {
    checkingNow.value = false
  }
}

function startPolling() {
  stopAll()
  startedAt = Date.now()
  elapsed.value = 0

  elapsedTimer = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startedAt) / 1000)
  }, 1000)

  pollTimer = setInterval(tick, POLL_INTERVAL_MS)
  timeoutHandle = setTimeout(() => {
    if (phase.value === 'pending') {
      phase.value = 'timeout'
      stopAll()
    }
  }, TIMEOUT_MS)

  // Faz o primeiro check imediatamente, sem esperar o intervalo
  tick()
}

onMounted(startPolling)
onUnmounted(stopAll)
</script>

<style scoped>
.confirm-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: var(--space-6) var(--space-4);
  background:
    radial-gradient(60% 50% at 50% 0%, var(--color-accent-soft), transparent 60%),
    var(--color-background);
}

.confirm-card {
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
  text-align: center;
}

.confirm-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto;
  color: var(--color-accent);
  animation: confirm-pulse 2.4s ease-in-out infinite;
}
.confirm-icon svg { width: 100%; height: 100%; }
@keyframes confirm-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.06); opacity: 0.85; }
}

.confirm-eyebrow {
  margin: 0;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: var(--font-semibold);
  color: var(--color-accent);
}
.confirm-eyebrow--warn { color: var(--color-warning); }

.confirm-title {
  margin: 0;
  font-size: clamp(var(--text-2xl), 4vw, var(--text-3xl));
  font-weight: var(--font-bold);
  letter-spacing: var(--ls-tight);
  line-height: var(--lh-title);
}

.confirm-lead {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
}

.confirm-progress {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  margin: 0 auto;
  border-radius: 999px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}
.confirm-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: confirm-spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes confirm-spin { to { transform: rotate(360deg); } }

.confirm-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.confirm-actions .btn { width: 100%; justify-content: center; }
</style>

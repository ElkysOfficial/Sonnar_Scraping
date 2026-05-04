<template>
  <Teleport to="body">
    <transition name="sn-fade">
      <div
        v-if="visible"
        class="sn-toast"
        :class="`sn-toast--${kind}`"
        role="status"
        aria-live="polite"
      >
        <div class="sn-toast__body">
          <strong class="sn-toast__title">{{ title }}</strong>
          <span class="sn-toast__msg">{{ message }}</span>
        </div>
        <div class="sn-toast__actions">
          <button v-if="primaryLabel" type="button" class="sn-btn sn-btn--primary" @click="onPrimary">
            {{ primaryLabel }}
          </button>
          <button type="button" class="sn-btn" @click="dismiss" aria-label="Dispensar">
            ×
          </button>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

type Kind = 'info' | 'warn' | 'error'
type ToastState = {
  kind: Kind
  title: string
  message: string
  primaryLabel?: string
  primaryAction?: () => void | Promise<void>
}

const router = useRouter()
const { signOut } = useAuth()

const state = ref<ToastState | null>(null)
const visible = computed(() => !!state.value)
const kind = computed(() => state.value?.kind ?? 'info')
const title = computed(() => state.value?.title ?? '')
const message = computed(() => state.value?.message ?? '')
const primaryLabel = computed(() => state.value?.primaryLabel)

let autoDismissId: number | null = null

function show(s: ToastState, ttlMs?: number) {
  if (autoDismissId !== null) { window.clearTimeout(autoDismissId); autoDismissId = null }
  state.value = s
  if (ttlMs) {
    autoDismissId = window.setTimeout(() => { state.value = null; autoDismissId = null }, ttlMs)
  }
}

function dismiss() {
  state.value = null
  if (autoDismissId !== null) { window.clearTimeout(autoDismissId); autoDismissId = null }
}

async function onPrimary() {
  const action = state.value?.primaryAction
  dismiss()
  if (action) await action()
}

// ===== Handlers =====
function onSessionExpiring(ev: Event) {
  const detail = (ev as CustomEvent).detail as { remainingMs?: number } | undefined
  const minutes = detail?.remainingMs ? Math.round(detail.remainingMs / 60000) : 2
  show({
    kind: 'warn',
    title: 'Sessão prestes a expirar',
    message: `Por inatividade, você será desconectado em ${minutes} min. Mexa o mouse ou clique pra continuar.`,
    primaryLabel: 'Continuar conectado',
    // Mover o mouse já reseta — botão é só uma forma explícita de fazer isso.
    primaryAction: () => { /* atividade do clique já reseta o timer */ }
  })
}

async function onSessionExpired() {
  show({
    kind: 'error',
    title: 'Sessão expirada',
    message: 'Você foi desconectado por inatividade. Entre novamente pra continuar.',
    primaryLabel: 'Ir pro login',
    primaryAction: async () => { await router.push('/login') }
  }, 12000)
  // Garantia: signOut foi chamado pelo timer; se algo falhar, força aqui também.
  try { await signOut() } catch { /* já pode ter sido limpo */ }
}

function onNoAccess(ev: Event) {
  const detail = (ev as CustomEvent).detail as { reason?: 'no-role' | 'transient-error' } | undefined
  if (detail?.reason === 'transient-error') {
    show({
      kind: 'warn',
      title: 'Não conseguimos validar suas permissões',
      message: 'Falha de rede ao consultar sua conta. Sua sessão foi preservada — tente recarregar a página.',
      primaryLabel: 'Recarregar',
      primaryAction: () => { window.location.reload() }
    }, 10000)
    return
  }
  show({
    kind: 'error',
    title: 'Acesso não autorizado',
    message: 'Sua conta não tem permissão pra acessar essa área. Se acha que é um erro, fale com o suporte.',
    primaryLabel: 'Sair',
    primaryAction: async () => { await signOut(); await router.push('/login') }
  }, 10000)
}

onMounted(() => {
  window.addEventListener('session-expiring', onSessionExpiring as EventListener)
  window.addEventListener('session-expired', onSessionExpired as EventListener)
  window.addEventListener('auth-no-access', onNoAccess as EventListener)
})

onBeforeUnmount(() => {
  window.removeEventListener('session-expiring', onSessionExpiring as EventListener)
  window.removeEventListener('session-expired', onSessionExpired as EventListener)
  window.removeEventListener('auth-no-access', onNoAccess as EventListener)
  if (autoDismissId !== null) window.clearTimeout(autoDismissId)
})
</script>

<style scoped>
.sn-toast {
  position: fixed;
  right: var(--space-4, 16px);
  bottom: var(--space-4, 16px);
  z-index: var(--z-toast, 1100);
  max-width: 380px;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border-radius: var(--radius-lg, 12px);
  background: var(--color-surface, #fff);
  color: var(--color-text-primary, #111);
  border: 1px solid var(--color-border, #e5e7eb);
  box-shadow: var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.12));
  font-family: var(--font-family, system-ui, sans-serif);
}

.sn-toast--warn { border-left: 3px solid var(--color-warning, #d97706); }
.sn-toast--error { border-left: 3px solid var(--color-error, #dc2626); }
.sn-toast--info { border-left: 3px solid var(--color-accent, #2563eb); }

.sn-toast__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.sn-toast__title {
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  line-height: 1.3;
}
.sn-toast__msg {
  font-size: var(--text-xs, 12px);
  color: var(--color-text-secondary, #4b5563);
  line-height: 1.4;
}

.sn-toast__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-shrink: 0;
}

.sn-btn {
  background: transparent;
  border: 1px solid var(--color-border, #e5e7eb);
  color: var(--color-text-secondary, #4b5563);
  border-radius: var(--radius-md, 8px);
  font-size: var(--text-xs, 12px);
  padding: 4px 10px;
  cursor: pointer;
  line-height: 1.4;
}
.sn-btn:hover { color: var(--color-text-primary, #111); }
.sn-btn--primary {
  background: var(--color-accent, #2563eb);
  color: var(--color-text-inverse, #fff);
  border-color: transparent;
}
.sn-btn--primary:hover { filter: brightness(0.95); }

.sn-fade-enter-active, .sn-fade-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.sn-fade-enter-from, .sn-fade-leave-to { opacity: 0; transform: translateY(8px); }

@media (max-width: 480px) {
  .sn-toast { left: var(--space-4, 16px); right: var(--space-4, 16px); max-width: none; }
}
</style>

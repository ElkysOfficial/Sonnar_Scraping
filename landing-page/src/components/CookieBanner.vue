<template>
  <Transition name="cookie-fade">
    <div
      v-if="visible"
      class="cookie-banner"
      role="dialog"
      aria-live="polite"
      aria-label="Política de Cookies"
    >
      <div class="cookie-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-9-9c.06 0 .12 0 .18.001A3 3 0 0015 6a3 3 0 003 3 3 3 0 003 3zM9.75 9.75h.008v.008H9.75V9.75zM15 14.25h.008v.008H15v-.008zM9 15h.008v.008H9V15zM12 12.75h.008v.008H12v-.008z" />
        </svg>
      </div>

      <div class="cookie-content">
        <h2 class="cookie-title">Política de Cookies</h2>
        <p class="cookie-text">
          Este site utiliza cookies para análise de tráfego e melhoria da experiência de navegação.
          Ao continuar, você concorda com o uso de cookies conforme nossa
          <router-link to="/cookies" class="cookie-link">Política de Cookies</router-link>
          e
          <router-link to="/privacidade" class="cookie-link">Política de Privacidade</router-link>.
        </p>
      </div>

      <div class="cookie-actions">
        <button type="button" class="btn-decline" @click="decline">Recusar</button>
        <button type="button" class="btn-accept" @click="accept">Aceitar Cookies</button>
      </div>

      <button
        type="button"
        class="cookie-close"
        aria-label="Fechar banner de cookies"
        @click="dismiss"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const STORAGE_KEY = 'sonnar.cookie-consent'
const visible = ref(false)

onMounted(() => {
  try {
    if (!localStorage.getItem(STORAGE_KEY)) visible.value = true
  } catch {
    visible.value = true
  }
})

function persist(value: 'accepted' | 'declined' | 'dismissed') {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ value, at: new Date().toISOString() }))
  } catch {
    // storage indisponível — segue sem persistir
  }
  visible.value = false
}

function accept() { persist('accepted') }
function decline() { persist('declined') }
function dismiss() { persist('dismissed') }
</script>

<style scoped>
.cookie-banner {
  position: fixed;
  left: var(--space-4);
  right: var(--space-4);
  bottom: var(--space-4);
  z-index: var(--z-modal, 1000);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.18));
  backdrop-filter: blur(8px);
}

.cookie-icon {
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  border-radius: var(--radius-full, 999px);
}

.cookie-icon svg { width: 1.25rem; height: 1.25rem; }

.cookie-content { flex: 1; min-width: 0; }

.cookie-title {
  font-size: var(--text-base);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin: 0 0 var(--space-1);
}

.cookie-text {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}

.cookie-link {
  color: var(--color-accent);
  font-weight: var(--font-medium);
  text-decoration: none;
}

.cookie-link:hover { text-decoration: underline; }

.cookie-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.btn-decline,
.btn-accept {
  appearance: none;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  padding: 0.55rem 1.1rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.btn-decline {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-decline:hover {
  background: var(--color-surface-low, var(--color-surface));
  border-color: var(--color-text-muted);
}

.btn-accept {
  background: var(--color-accent);
  color: var(--color-on-accent);
  border: 1px solid var(--color-accent);
  box-shadow: 0 4px 12px var(--color-primary-glow);
}

.btn-accept:hover { background: var(--color-accent-hover); border-color: var(--color-accent-hover); }

.cookie-close {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.cookie-close svg { width: 1.125rem; height: 1.125rem; }
.cookie-close:hover { color: var(--color-text-primary); background: var(--color-surface); }

.cookie-fade-enter-active,
.cookie-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.cookie-fade-enter-from,
.cookie-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 768px) {
  .cookie-banner {
    flex-wrap: wrap;
    padding: var(--space-4);
  }
  .cookie-content { flex-basis: calc(100% - 3.5rem); }
  .cookie-actions {
    width: 100%;
    justify-content: flex-end;
  }
  .cookie-close {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
  }
}

@media (max-width: 480px) {
  .cookie-banner {
    left: var(--space-2);
    right: var(--space-2);
    bottom: var(--space-2);
  }
  .btn-decline,
  .btn-accept {
    flex: 1;
  }
}
</style>

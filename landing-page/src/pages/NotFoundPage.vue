<template>
  <main class="nf-page">
    <div class="nf-container">
      <p class="nf-eyebrow">Erro 404</p>
      <h1 class="nf-title">Essa rota não existe.</h1>
      <p class="nf-subtitle">
        A URL pode ter sido renomeada, removida ou ter algum erro de digitação.
        Volte pra home e tente de novo.
      </p>

      <div class="nf-actions">
        <router-link to="/" class="nf-btn nf-btn--primary">
          Voltar pra home
        </router-link>
        <button type="button" class="nf-btn" @click="goBack">
          Voltar pra página anterior
        </button>
      </div>

      <p class="nf-hint" v-if="attemptedPath">
        URL acessada: <code>{{ attemptedPath }}</code>
      </p>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const attemptedPath = computed(() => route.fullPath)

function goBack() {
  // Se houver histórico, volta; senão, vai pra home.
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace('/')
  }
}
</script>

<style scoped>
.nf-page {
  min-height: calc(100dvh - 56px);
  display: grid;
  place-items: center;
  padding: var(--space-8, 48px) var(--space-4, 16px);
  background: var(--color-background);
  color: var(--color-text-primary);
}

.nf-container {
  max-width: 560px;
  text-align: center;
}

.nf-eyebrow {
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-semibold, 600);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide, 0.1em);
  color: var(--color-accent);
  margin: 0 0 var(--space-3, 12px);
}

.nf-title {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: var(--font-bold, 700);
  line-height: 1.15;
  letter-spacing: var(--ls-tight, -0.01em);
  margin: 0 0 var(--space-4, 16px);
}

.nf-subtitle {
  font-size: var(--text-base, 16px);
  line-height: 1.55;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-6, 24px);
}

.nf-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-3, 12px);
  justify-content: center;
}

.nf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3, 12px) var(--space-5, 20px);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--text-sm, 14px);
  font-weight: var(--font-medium, 500);
  text-decoration: none;
  cursor: pointer;
  transition: background var(--transition-fast, 120ms ease),
              border-color var(--transition-fast, 120ms ease),
              color var(--transition-fast, 120ms ease);
}

.nf-btn:hover {
  background: var(--color-surface);
  border-color: var(--color-text-muted, #9ca3af);
}

.nf-btn--primary {
  background: var(--color-accent);
  color: var(--color-text-inverse, #fff);
  border-color: transparent;
}

.nf-btn--primary:hover {
  background: var(--color-accent-hover, var(--color-accent));
  filter: brightness(0.95);
  border-color: transparent;
}

.nf-hint {
  margin: var(--space-6, 24px) 0 0;
  font-size: var(--text-xs, 12px);
  color: var(--color-text-muted);
}

.nf-hint code {
  background: var(--color-surface);
  padding: 2px 6px;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--color-border);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.95em;
  word-break: break-all;
}
</style>

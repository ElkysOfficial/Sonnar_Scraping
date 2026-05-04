<template>
  <button
    type="button"
    class="theme-toggle"
    :aria-label="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'"
    :title="isDark ? 'Tema claro' : 'Tema escuro'"
    @click="toggle"
  >
    <Transition name="theme-icon" mode="out-in">
      <svg
        v-if="isDark"
        key="sun"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg
        v-else
        key="moon"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </Transition>
  </button>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const STORAGE_KEY = 'sonnar.theme'
const isDark = ref(false)

function apply(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme)
  isDark.value = theme === 'dark'
}

function detectInitial(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* sem storage */ }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function toggle() {
  const next = isDark.value ? 'light' : 'dark'
  apply(next)
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* no-op */ }
}

onMounted(() => apply(detectInitial()))
</script>

<style scoped>
.theme-toggle {
  width: 36px;
  height: 36px;
  display: inline-grid;
  place-items: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
}

.theme-toggle:hover {
  background: var(--color-glass-bg);
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.theme-icon-enter-active,
.theme-icon-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.theme-icon-enter-from { opacity: 0; transform: rotate(-45deg) scale(0.7); }
.theme-icon-leave-to   { opacity: 0; transform: rotate(45deg) scale(0.7); }
</style>

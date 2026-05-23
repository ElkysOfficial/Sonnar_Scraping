<template>
  <Teleport to="body">
    <Transition name="cdlg-fade">
      <div
        v-if="open"
        class="cdlg-overlay"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="bodyId"
        @click.self="onCancel"
      >
        <Transition name="cdlg-pop" appear>
          <article
            v-if="open"
            class="cdlg-card"
            :class="`cdlg-card--${tone}`"
            @keydown.esc.stop="onCancel"
          >
            <header class="cdlg-head">
              <div class="cdlg-icon" :class="`cdlg-icon--${tone}`" aria-hidden="true">
                <svg v-if="tone === 'danger'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <svg v-else-if="tone === 'warning'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
              </div>
              <div class="cdlg-head__text">
                <h2 :id="titleId" class="cdlg-title">{{ title }}</h2>
                <p v-if="subtitle" class="cdlg-subtitle">{{ subtitle }}</p>
              </div>
            </header>

            <div :id="bodyId" class="cdlg-body">
              <slot>
                <p v-if="message">{{ message }}</p>
              </slot>

              <div v-if="bullets && bullets.length" class="cdlg-bullets">
                <div v-for="(b, i) in bullets" :key="i" class="cdlg-bullet">
                  <span class="cdlg-bullet__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                  <span>{{ b }}</span>
                </div>
              </div>
            </div>

            <footer class="cdlg-actions">
              <button
                type="button"
                class="cdlg-btn cdlg-btn--ghost"
                :disabled="loading"
                @click="onCancel"
              >
                {{ cancelLabel }}
              </button>
              <button
                type="button"
                class="cdlg-btn"
                :class="`cdlg-btn--${tone}`"
                :disabled="loading"
                @click="onConfirm"
              >
                <span v-if="loading" class="cdlg-spinner" aria-hidden="true"></span>
                <span>{{ loading ? loadingLabel : confirmLabel }}</span>
              </button>
            </footer>
          </article>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'

type Tone = 'info' | 'warning' | 'danger'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  subtitle?: string
  message?: string
  bullets?: string[]
  confirmLabel?: string
  cancelLabel?: string
  loadingLabel?: string
  loading?: boolean
  tone?: Tone
}>(), {
  confirmLabel: 'Confirmar',
  cancelLabel: 'Voltar',
  loadingLabel: 'Aguarde...',
  loading: false,
  tone: 'info'
})

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()

const uid = Math.random().toString(36).slice(2, 9)
const titleId = computed(() => `cdlg-title-${uid}`)
const bodyId = computed(() => `cdlg-body-${uid}`)

function onConfirm() { if (!props.loading) emit('confirm') }
function onCancel()  { if (!props.loading) emit('cancel') }

function setBodyLock(locked: boolean) {
  if (typeof document === 'undefined') return
  document.body.style.overflow = locked ? 'hidden' : ''
}
watch(() => props.open, (v) => setBodyLock(v), { immediate: true })
onBeforeUnmount(() => setBodyLock(false))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) onCancel()
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
</script>

<style scoped>
/* ==========================================================================
   ConfirmDialog — segue o design system Sonnar (apps/web/src/assets/styles.css)
   Tokens usados: --color-*, --space-*, --radius-*, --text-*, --shadow-*,
                  --font-*, --lh-*, --transition-*
   ========================================================================== */

.cdlg-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: color-mix(in srgb, var(--color-text-primary) 55%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.cdlg-card {
  width: min(560px, 100%);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - var(--space-16));
  transition: var(--theme-transition);
}
.cdlg-card--info    { border-top: 3px solid var(--color-accent); }
.cdlg-card--warning { border-top: 3px solid var(--color-warning); }
.cdlg-card--danger  { border-top: 3px solid var(--color-error); }

.cdlg-head {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-6) 0;
}
.cdlg-icon {
  flex-shrink: 0;
  width: var(--space-11);
  height: var(--space-11);
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
}
.cdlg-icon--info    { background: var(--color-accent-soft);  color: var(--color-accent); }
.cdlg-icon--warning { background: var(--color-warning-soft); color: var(--color-warning); }
.cdlg-icon--danger  { background: var(--color-error-soft);   color: var(--color-error); }

.cdlg-head__text { flex: 1; min-width: 0; }
.cdlg-title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  line-height: var(--lh-title);
  letter-spacing: var(--ls-tight);
  color: var(--color-text-primary);
}
.cdlg-subtitle {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--lh-body);
}

.cdlg-body {
  padding: var(--space-4) var(--space-6) var(--space-2);
  overflow-y: auto;
  font-size: var(--text-sm);
  line-height: var(--lh-body);
  color: var(--color-text-secondary);
}
.cdlg-body :deep(p) { margin: 0 0 var(--space-3); }
.cdlg-body :deep(p:last-child) { margin: 0; }
.cdlg-body :deep(strong) {
  color: var(--color-text-primary);
  font-weight: var(--font-semibold);
}

.cdlg-bullets {
  margin: var(--space-3) 0 var(--space-1);
  padding: var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.cdlg-bullet {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  font-size: var(--text-sm);
  line-height: var(--lh-body);
  color: var(--color-text-primary);
}
.cdlg-bullet__icon {
  flex-shrink: 0;
  width: var(--space-5);
  height: var(--space-5);
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  display: grid;
  place-items: center;
  margin-top: 2px;
}

.cdlg-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6) var(--space-6);
  border-top: 1px solid var(--color-border-subtle);
  margin-top: var(--space-4);
  background: var(--color-background);
}

.cdlg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-width: 120px;
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-button);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  line-height: 1;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background-color var(--transition-base),
    border-color var(--transition-base),
    color var(--transition-base),
    transform var(--transition-fast),
    box-shadow var(--transition-base),
    filter var(--transition-base);
}
.cdlg-btn:active:not(:disabled) { transform: translateY(1px); }
.cdlg-btn:disabled { opacity: 0.6; cursor: progress; }

.cdlg-btn--ghost {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text-primary);
}
.cdlg-btn--ghost:hover:not(:disabled) {
  background: var(--color-surface);
}

.cdlg-btn--info {
  background: var(--color-accent);
  color: var(--color-on-accent);
  box-shadow: var(--shadow-sm);
}
.cdlg-btn--info:hover:not(:disabled) {
  background: var(--color-accent-hover);
  box-shadow: var(--shadow-md);
}

.cdlg-btn--warning {
  background: var(--color-warning);
  color: var(--color-text-inverse);
  box-shadow: var(--shadow-sm);
}
.cdlg-btn--warning:hover:not(:disabled) {
  filter: brightness(1.05);
  box-shadow: var(--shadow-md);
}

.cdlg-btn--danger {
  background: var(--color-error);
  color: var(--color-text-inverse);
  box-shadow: var(--shadow-sm);
}
.cdlg-btn--danger:hover:not(:disabled) {
  background: var(--color-error-hover);
  box-shadow: var(--shadow-md);
}

.cdlg-spinner {
  width: var(--space-4);
  height: var(--space-4);
  border-radius: var(--radius-full);
  border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
  border-top-color: currentColor;
  animation: cdlg-spin var(--transition-slow) linear infinite;
}
@keyframes cdlg-spin { to { transform: rotate(360deg); } }

/* Transitions */
.cdlg-fade-enter-active,
.cdlg-fade-leave-active { transition: opacity var(--transition-base); }
.cdlg-fade-enter-from,
.cdlg-fade-leave-to { opacity: 0; }

.cdlg-pop-enter-active {
  transition:
    transform var(--transition-slow) cubic-bezier(0.16, 1, 0.3, 1),
    opacity var(--transition-base);
}
.cdlg-pop-leave-active {
  transition:
    transform var(--transition-base),
    opacity var(--transition-base);
}
.cdlg-pop-enter-from { transform: translateY(8px) scale(0.97); opacity: 0; }
.cdlg-pop-leave-to   { transform: translateY(4px) scale(0.98); opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .cdlg-fade-enter-active, .cdlg-fade-leave-active,
  .cdlg-pop-enter-active,  .cdlg-pop-leave-active {
    transition-duration: 0.01ms !important;
  }
}

@media (max-width: 520px) {
  .cdlg-head {
    padding: var(--space-5) var(--space-5) 0;
    gap: var(--space-3);
  }
  .cdlg-body { padding: var(--space-3) var(--space-5) var(--space-1); }
  .cdlg-actions {
    padding: var(--space-3) var(--space-5) var(--space-5);
    flex-direction: column-reverse;
  }
  .cdlg-btn {
    width: 100%;
    min-width: 0;
  }
}
</style>

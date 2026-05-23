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

              <p v-if="footnote" class="cdlg-footnote">{{ footnote }}</p>
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
  footnote?: string
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

// Trava scroll do body quando aberto
function setBodyLock(locked: boolean) {
  if (typeof document === 'undefined') return
  document.body.style.overflow = locked ? 'hidden' : ''
}
watch(() => props.open, (v) => setBodyLock(v), { immediate: true })
onBeforeUnmount(() => setBodyLock(false))

// ESC global enquanto aberto
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) onCancel()
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
</script>

<style scoped>
.cdlg-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: clamp(12px, 4vw, 32px);
  background: color-mix(in srgb, #000 60%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.cdlg-card {
  width: min(560px, 100%);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.35),
    0 0 0 1px color-mix(in srgb, var(--color-accent) 8%, transparent);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 64px);
}
.cdlg-card--danger  { border-top: 4px solid var(--color-error); }
.cdlg-card--warning { border-top: 4px solid var(--color-warning); }
.cdlg-card--info    { border-top: 4px solid var(--color-accent); }

.cdlg-head {
  display: flex;
  gap: 16px;
  padding: 24px 24px 0;
}
.cdlg-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
}
.cdlg-icon--info    { background: var(--color-accent-soft);  color: var(--color-accent); }
.cdlg-icon--warning { background: var(--color-warning-soft); color: var(--color-warning); }
.cdlg-icon--danger  { background: var(--color-error-soft);   color: var(--color-error); }

.cdlg-head__text { flex: 1; min-width: 0; }
.cdlg-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--color-text-primary);
}
.cdlg-subtitle {
  margin: 4px 0 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.cdlg-body {
  padding: 16px 24px 8px;
  overflow-y: auto;
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--color-text-secondary);
}
.cdlg-body :deep(p) { margin: 0 0 12px; }
.cdlg-body :deep(p:last-child) { margin: 0; }
.cdlg-body :deep(strong) { color: var(--color-text-primary); }

.cdlg-bullets {
  margin: 12px 0 4px;
  padding: 14px 16px;
  background: var(--color-surface);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cdlg-bullet {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--color-text-primary);
}
.cdlg-bullet__icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  display: grid;
  place-items: center;
  margin-top: 1px;
}

.cdlg-footnote {
  margin: 12px 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.cdlg-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 24px;
  border-top: 1px solid var(--color-border-subtle);
  margin-top: 16px;
  background: var(--color-background);
}

.cdlg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 120px;
  padding: 11px 18px;
  border-radius: 10px;
  font-size: 0.9375rem;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    transform 80ms ease,
    box-shadow 160ms ease;
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
  border-color: var(--color-border);
}

.cdlg-btn--info {
  background: var(--color-accent);
  color: var(--color-on-accent, #fff);
  box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--color-accent) 60%, transparent);
}
.cdlg-btn--info:hover:not(:disabled) {
  background: var(--color-accent-hover, var(--color-accent));
  box-shadow: 0 8px 18px -6px color-mix(in srgb, var(--color-accent) 60%, transparent);
}

.cdlg-btn--warning {
  background: var(--color-warning);
  color: #1a1300;
  box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--color-warning) 60%, transparent);
}
.cdlg-btn--warning:hover:not(:disabled) {
  filter: brightness(1.05);
  box-shadow: 0 8px 18px -6px color-mix(in srgb, var(--color-warning) 60%, transparent);
}

.cdlg-btn--danger {
  background: var(--color-error);
  color: #fff;
  box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--color-error) 60%, transparent);
}
.cdlg-btn--danger:hover:not(:disabled) {
  filter: brightness(1.05);
  box-shadow: 0 8px 18px -6px color-mix(in srgb, var(--color-error) 60%, transparent);
}

.cdlg-spinner {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
  border-top-color: currentColor;
  animation: cdlg-spin 0.7s linear infinite;
}
@keyframes cdlg-spin { to { transform: rotate(360deg); } }

/* Transitions */
.cdlg-fade-enter-active, .cdlg-fade-leave-active { transition: opacity 180ms ease; }
.cdlg-fade-enter-from, .cdlg-fade-leave-to { opacity: 0; }
.cdlg-pop-enter-active { transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease; }
.cdlg-pop-leave-active { transition: transform 160ms ease, opacity 160ms ease; }
.cdlg-pop-enter-from { transform: translateY(10px) scale(0.97); opacity: 0; }
.cdlg-pop-leave-to   { transform: translateY(6px)  scale(0.98); opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .cdlg-fade-enter-active, .cdlg-fade-leave-active,
  .cdlg-pop-enter-active,  .cdlg-pop-leave-active {
    transition-duration: 0.01ms !important;
  }
}

@media (max-width: 520px) {
  .cdlg-head { padding: 20px 18px 0; gap: 12px; }
  .cdlg-body { padding: 14px 18px 6px; }
  .cdlg-actions { padding: 14px 18px 20px; flex-direction: column-reverse; }
  .cdlg-btn { width: 100%; min-width: 0; }
}
</style>

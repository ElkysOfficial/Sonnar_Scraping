<template>
  <div class="pwd-strength" :aria-live="'polite'">
    <div class="pwd-bar" :data-level="level">
      <span v-for="i in 4" :key="i" class="pwd-bar__seg" :class="{ 'pwd-bar__seg--on': i <= filledSegments }" />
    </div>
    <p class="pwd-bar__label" :class="`pwd-bar__label--${level}`">{{ levelLabel }}</p>

    <ul class="pwd-rules">
      <li v-for="r in rules" :key="r.key" :class="r.ok ? 'pwd-rule--ok' : 'pwd-rule--fail'">
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
          <path
            v-if="r.ok"
            d="M4 10L8 14L16 6"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <g v-else stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <line x1="5" y1="5" x2="15" y2="15" />
            <line x1="15" y1="5" x2="5" y2="15" />
          </g>
        </svg>
        <span>{{ r.label }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ password: string }>()

const rules = computed(() => [
  { key: 'len',     label: 'Pelo menos 8 caracteres', ok: props.password.length >= 8 },
  { key: 'upper',   label: 'Uma letra maiúscula (A–Z)', ok: /[A-Z]/.test(props.password) },
  { key: 'lower',   label: 'Uma letra minúscula (a–z)', ok: /[a-z]/.test(props.password) },
  { key: 'number',  label: 'Um número (0–9)', ok: /[0-9]/.test(props.password) },
  { key: 'special', label: 'Um caractere especial (!@#$…)', ok: /[^A-Za-z0-9]/.test(props.password) }
])

const passedCount = computed(() => rules.value.filter(r => r.ok).length)

const filledSegments = computed(() => {
  const c = passedCount.value
  if (c <= 1) return 1
  if (c === 2) return 2
  if (c === 3) return 2
  if (c === 4) return 3
  return 4 // 5 = forte
})

const level = computed<'weak' | 'medium' | 'good' | 'strong'>(() => {
  const c = passedCount.value
  if (c <= 2) return 'weak'
  if (c === 3) return 'medium'
  if (c === 4) return 'good'
  return 'strong'
})

const levelLabel = computed(() => ({
  weak: 'Senha fraca',
  medium: 'Senha razoável',
  good: 'Senha boa',
  strong: 'Senha forte'
}[level.value]))
</script>

<style scoped>
.pwd-strength {
  margin-top: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.pwd-bar {
  display: flex;
  gap: 4px;
  height: 4px;
}
.pwd-bar__seg {
  flex: 1;
  border-radius: 999px;
  background: var(--color-border);
  transition: background-color var(--transition-fast);
}
.pwd-bar[data-level="weak"]   .pwd-bar__seg--on { background: var(--color-error); }
.pwd-bar[data-level="medium"] .pwd-bar__seg--on { background: var(--color-warning); }
.pwd-bar[data-level="good"]   .pwd-bar__seg--on { background: var(--color-accent); }
.pwd-bar[data-level="strong"] .pwd-bar__seg--on { background: var(--color-accent); }

.pwd-bar__label {
  margin: 0;
  font-size: 0.75rem;
  font-weight: var(--font-semibold);
  letter-spacing: 0.04em;
}
.pwd-bar__label--weak   { color: var(--color-error); }
.pwd-bar__label--medium { color: var(--color-warning); }
.pwd-bar__label--good   { color: var(--color-accent); }
.pwd-bar__label--strong { color: var(--color-accent); }

.pwd-rules {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
}
@media (min-width: 480px) {
  .pwd-rules { grid-template-columns: 1fr 1fr; }
}
.pwd-rules li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  transition: color var(--transition-fast);
}
.pwd-rule--ok { color: var(--color-accent); }
.pwd-rule--fail { color: var(--color-error); }
</style>

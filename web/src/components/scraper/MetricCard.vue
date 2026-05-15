<template>
  <article
    class="metric"
    :class="[`metric--${tone}`, { 'metric--clickable': clickable, 'metric--alert': alert }]"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    @click="clickable && $emit('click')"
    @keydown.enter="clickable && $emit('click')"
  >
    <header class="metric-head">
      <span class="metric-label">{{ label }}</span>
      <span v-if="trend != null" class="metric-trend" :class="trendClass">
        <svg v-if="trend > 0" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M2 8 L6 4 L10 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <svg v-else-if="trend < 0" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M2 4 L6 8 L10 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span v-else aria-hidden="true">·</span>
        {{ trendLabel }}
      </span>
    </header>

    <div class="metric-value-row">
      <span class="metric-value" :title="String(rawValue)">{{ displayValue }}</span>
      <span v-if="suffix" class="metric-suffix">{{ suffix }}</span>
    </div>

    <p v-if="hint" class="metric-hint">{{ hint }}</p>

    <!-- Sparkline (apenas se tiver dados) -->
    <div v-if="hasSeries" class="metric-spark" aria-hidden="true">
      <svg :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`" preserveAspectRatio="none" class="spark-svg">
        <defs>
          <linearGradient :id="`grad-${uid}`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.25" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path :d="areaPath" :fill="`url(#grad-${uid})`" />
        <path :d="linePath" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="spark-line" />
      </svg>
    </div>
  </article>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'

const props = defineProps({
  label:    { type: String, required: true },
  value:    { type: [Number, String], default: 0 },
  suffix:   { type: String, default: '' },
  hint:     { type: String, default: '' },
  series:   { type: Array,  default: () => [] },        // [n, n, n, ...] últimos N pontos
  trend:    { type: Number, default: null },             // % (-100..+inf), null = sem trend
  tone:     { type: String, default: 'neutral' },        // neutral | success | warn | danger | accent
  alert:    { type: Boolean, default: false },           // pulse sutil quando true
  clickable:{ type: Boolean, default: false },
  format:   { type: String, default: 'int' },            // int | float | money | duration_ms | pct
  duration: { type: Number, default: 800 },              // ms da animação do counter
})

defineEmits(['click'])

const SPARK_W = 200
const SPARK_H = 36

const uid = `mc${Math.random().toString(36).slice(2, 8)}`

// Animação de contagem
const displayedNum = ref(0)
const rawValue = computed(() => props.value)

function formatValue(v) {
  if (v == null || v === '') return '-'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  if (props.format === 'money')        return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (props.format === 'pct')          return n.toFixed(1)
  if (props.format === 'float')        return n.toFixed(2)
  if (props.format === 'duration_ms') {
    if (n < 1000) return Math.round(n) + ''
    return (n / 1000).toFixed(1)
  }
  return Math.round(n).toLocaleString('pt-BR')
}

const displayValue = computed(() => {
  if (typeof props.value === 'string') return props.value
  return formatValue(displayedNum.value)
})

function animateTo(target) {
  const start = displayedNum.value
  const delta = target - start
  if (delta === 0 || props.duration <= 0) {
    displayedNum.value = target
    return
  }
  const t0 = performance.now()
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / props.duration)
    // ease-out cubic
    const eased = 1 - Math.pow(1 - t, 3)
    displayedNum.value = start + delta * eased
    if (t < 1) requestAnimationFrame(tick)
    else displayedNum.value = target
  }
  requestAnimationFrame(tick)
}

watch(() => Number(props.value) || 0, (n) => animateTo(n), { immediate: false })
onMounted(() => animateTo(Number(props.value) || 0))

// Trend label
const trendLabel = computed(() => {
  if (props.trend == null) return ''
  const abs = Math.abs(props.trend)
  if (!Number.isFinite(abs)) return '-'
  return `${abs.toFixed(0)}%`
})
const trendClass = computed(() => {
  if (props.trend == null) return ''
  if (props.trend > 1) return 'metric-trend--up'
  if (props.trend < -1) return 'metric-trend--down'
  return 'metric-trend--flat'
})

// Sparkline path
const hasSeries = computed(() => Array.isArray(props.series) && props.series.length >= 2)

const linePath = computed(() => buildPath(false))
const areaPath = computed(() => buildPath(true))

function buildPath(fillBelow) {
  const pts = props.series.map(Number).filter(v => Number.isFinite(v))
  if (pts.length < 2) return ''
  const max = Math.max(...pts, 1)
  const min = Math.min(...pts, 0)
  const range = max - min || 1
  const stepX = SPARK_W / (pts.length - 1)
  let d = ''
  pts.forEach((y, i) => {
    const px = i * stepX
    const py = SPARK_H - ((y - min) / range) * SPARK_H * 0.85 - 2
    d += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ',' + py.toFixed(1) + ' '
  })
  if (fillBelow) {
    d += `L ${SPARK_W} ${SPARK_H} L 0 ${SPARK_H} Z`
  }
  return d
}
</script>

<style scoped>
.metric {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
  min-height: 8.625rem;
  /* Tone color via var */
  --tone: var(--color-text-primary);
}
.metric--success { --tone: var(--metric-tone-success); }
.metric--warn    { --tone: var(--metric-tone-warning); }
.metric--danger  { --tone: var(--metric-tone-danger); }
.metric--accent  { --tone: var(--metric-tone-accent); }

.metric--clickable { cursor: pointer; }
.metric--clickable:hover {
  border-color: var(--tone);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--tone) 12%, transparent);
}
.metric--clickable:focus-visible {
  outline: 2px solid var(--tone);
  outline-offset: 2px;
}

.metric--alert::after {
  content: '';
  position: absolute;
  top: var(--space-3); right: var(--space-3);
  width: 6px; height: 6px;
  background: var(--color-error);
  border-radius: var(--radius-full);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-error) 50%, transparent);
  animation: pulse 1.6s ease-out infinite;
}
@keyframes pulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-error) 50%, transparent); }
  100% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--color-error) 0%, transparent); }
}

.metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.metric-label {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
}

.metric-trend {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.metric-trend--up   { color: var(--color-success); }
.metric-trend--down { color: var(--color-error); }
.metric-trend--flat { color: var(--color-text-muted); }

.metric-value-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  margin-top: 2px;
}
.metric-value {
  font-size: clamp(1.5rem, 2.6vw, 2rem);
  font-weight: var(--font-bold);
  color: var(--tone);
  line-height: 1.05;
  letter-spacing: var(--ls-tight);
  font-variant-numeric: tabular-nums;
}
.metric-suffix {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-muted);
}
.metric-hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: 1.35;
}

/* Sparkline */
.metric-spark {
  margin-top: var(--space-2);
  height: 36px;
  color: var(--tone);
}
.spark-svg { width: 100%; height: 100%; display: block; }
.spark-line {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: drawLine 1.2s ease-out forwards;
}
@keyframes drawLine { to { stroke-dashoffset: 0; } }

@media (max-width: 480px) {
  .metric { padding: var(--space-3) var(--space-3) var(--space-2); min-height: 7.5rem; }
  .metric-value { font-size: var(--text-2xl); }
  .metric-spark { height: 28px; }
}

/* Reduce motion */
@media (prefers-reduced-motion: reduce) {
  .spark-line { animation: none; stroke-dashoffset: 0; }
  .metric--alert::after { animation: none; }
}
</style>

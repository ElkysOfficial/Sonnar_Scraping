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
  if (!Number.isFinite(abs)) return '—'
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
  gap: 6px;
  padding: 16px 18px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  overflow: hidden;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  min-height: 138px;
  /* Tone color via var */
  --tone: var(--color-text-primary);
}
.metric--success { --tone: #16a34a; }
.metric--warn    { --tone: #d97706; }
.metric--danger  { --tone: #dc2626; }
.metric--accent  { --tone: var(--color-accent); }

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
  top: 14px; right: 14px;
  width: 6px; height: 6px;
  background: #dc2626;
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5);
  animation: pulse 1.6s ease-out infinite;
}
@keyframes pulse {
  0%   { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); }
  100% { box-shadow: 0 0 0 8px rgba(220, 38, 38, 0); }
}

.metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.metric-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.metric-trend {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.metric-trend--up   { color: #16a34a; }
.metric-trend--down { color: #dc2626; }
.metric-trend--flat { color: var(--color-text-muted); }

.metric-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 2px;
}
.metric-value {
  font-size: clamp(1.5rem, 2.6vw, 2rem);
  font-weight: 700;
  color: var(--tone);
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.metric-suffix {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-muted);
}
.metric-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.35;
}

/* Sparkline */
.metric-spark {
  margin-top: 6px;
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
  .metric { padding: 14px 14px 10px; min-height: 120px; }
  .metric-value { font-size: 1.5rem; }
  .metric-spark { height: 28px; }
}

/* Reduce motion */
@media (prefers-reduced-motion: reduce) {
  .spark-line { animation: none; stroke-dashoffset: 0; }
  .metric--alert::after { animation: none; }
}
</style>

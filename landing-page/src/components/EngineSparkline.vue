<template>
  <div class="sparkline-wrap">
    <div class="legend">
      <span v-for="(_, key) in series" :key="key" class="legend-item">
        <span class="legend-dot" :class="`s-${key}`" />
        {{ legendLabel(key) }}
        <span class="legend-stats">
          (atual: {{ formatVal(lastValue(series[key])) }}<span v-if="unit">{{ unit }}</span>,
          máx: {{ formatVal(maxValue(series[key])) }}<span v-if="unit">{{ unit }}</span>)
        </span>
      </span>
    </div>
    <svg
      v-if="hasData"
      :viewBox="`0 0 ${width} ${height}`"
      preserveAspectRatio="none"
      class="sparkline-svg"
      :style="{ height: height + 'px' }"
    >
      <!-- gridlines -->
      <line v-for="i in 4" :key="`g${i}`" :x1="0" :x2="width" :y1="(height/4)*i" :y2="(height/4)*i" class="grid" />
      <!-- bars / lines -->
      <polyline
        v-for="(pts, key) in normalizedSeries"
        :key="key"
        :points="pts"
        :class="`series s-${key}`"
        fill="none"
        stroke-width="1.5"
      />
    </svg>
    <div v-else class="empty-svg">Sem dados.</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  series: { type: Object, required: true }, // { key: [{x, y}, ...] }
  unit: { type: String, default: '' },
  height: { type: Number, default: 100 },
  width: { type: Number, default: 800 },
})

const SERIES_LABELS = {
  p50: 'Mediana (p50)',
  p95: 'Pior caso (p95)',
  req: 'Acessos',
  err: 'Erros (429+5xx)',
}

const allPoints = computed(() => {
  const out = []
  for (const arr of Object.values(props.series)) {
    for (const p of arr) out.push(p)
  }
  return out
})

const hasData = computed(() => allPoints.value.length > 0)

const xExtent = computed(() => {
  if (!hasData.value) return [0, 1]
  let min = Infinity, max = -Infinity
  for (const p of allPoints.value) {
    const t = new Date(p.x).getTime()
    if (t < min) min = t
    if (t > max) max = t
  }
  if (min === max) max = min + 1
  return [min, max]
})

const yExtent = computed(() => {
  if (!hasData.value) return [0, 1]
  let max = -Infinity
  for (const p of allPoints.value) if (p.y > max) max = p.y
  if (!isFinite(max) || max <= 0) max = 1
  return [0, max * 1.1]
})

const normalizedSeries = computed(() => {
  const [x0, x1] = xExtent.value
  const [y0, y1] = yExtent.value
  const dx = x1 - x0
  const dy = y1 - y0
  const out = {}
  for (const [key, points] of Object.entries(props.series)) {
    if (!points.length) { out[key] = ''; continue }
    const sorted = [...points].sort((a, b) => new Date(a.x) - new Date(b.x))
    out[key] = sorted.map(p => {
      const t = new Date(p.x).getTime()
      const px = ((t - x0) / dx) * props.width
      const py = props.height - (((p.y || 0) - y0) / dy) * props.height
      return `${px.toFixed(1)},${py.toFixed(1)}`
    }).join(' ')
  }
  return out
})

function legendLabel (key) { return SERIES_LABELS[key] || key }
function lastValue (arr) { return arr.length ? arr[arr.length - 1].y : 0 }
function maxValue (arr) { return arr.length ? Math.max(...arr.map(p => p.y || 0)) : 0 }
function formatVal (v) {
  if (v == null) return '-'
  const n = Number(v)
  if (n >= 1000) return Math.round(n).toLocaleString('pt-BR')
  if (n >= 100) return Math.round(n)
  return n.toFixed(1)
}
</script>

<style scoped>
.sparkline-wrap { display: flex; flex-direction: column; gap: 8px; }
.legend {
  display: flex; gap: 16px; flex-wrap: wrap;
  font-size: 12px; color: var(--color-text-secondary);
}
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.legend-dot {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
}
.legend-stats { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.sparkline-svg { width: 100%; display: block; }
.grid { stroke: var(--color-border); stroke-width: 0.5; }

.series.s-p50 { stroke: #2563eb; }
.series.s-p95 { stroke: #d97706; }
.series.s-req { stroke: #16a34a; }
.series.s-err { stroke: #dc2626; }

.legend-dot.s-p50 { background: #2563eb; }
.legend-dot.s-p95 { background: #d97706; }
.legend-dot.s-req { background: #16a34a; }
.legend-dot.s-err { background: #dc2626; }

.empty-svg {
  height: 100px; display: grid; place-items: center;
  color: var(--color-text-muted); font-size: 13px;
}
</style>

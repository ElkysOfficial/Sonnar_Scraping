<template>
  <section class="hero" :class="`hero--${tone}`">
    <!-- Status -->
    <div class="hero-status">
      <div class="hero-text">
        <h2 class="hero-headline">{{ headline }}</h2>
        <p class="hero-sub">{{ subline }}</p>
      </div>
    </div>

    <!-- Gauge de saúde (taxa de sucesso) — peça central do hero -->
    <div class="hero-gauge">
      <h3 class="hero-gauge-title">Taxa de sucesso</h3>
      <SuccessRateGauge
        :rate="successRate"
        :total-requests="totalRequests"
        :total-ok="totalOk"
        :total-429="total429"
        :total4xx="total4xx"
        :total5xx="total5xx"
        :tone="tone"
        :threshold="95"
      />
    </div>

    <!-- Mini area chart de tráfego -->
    <div class="hero-area">
      <div class="hero-area-head">
        <span class="hero-area-label">Acessos no período</span>
        <span class="hero-area-value">{{ formatInt(totalRequests) }}</span>
      </div>
      <VChart
        v-if="hasTrafficData"
        ref="areaRef"
        class="echart"
        :option="areaOption"
        :init-options="{ renderer: 'svg' }"
        autoresize
      />
      <div v-else class="hero-area-empty">
        <span>Sem dados suficientes para o gráfico nessa janela.</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import SuccessRateGauge from './SuccessRateGauge.vue'

use([LineChart, GridComponent, TooltipComponent, SVGRenderer])

const props = defineProps({
  tone:           { type: String,  default: 'success' },
  headline:       { type: String,  required: true },
  subline:        { type: String,  default: '' },
  successRate:    { type: Number,  default: 100 },
  totalRequests:  { type: Number,  default: 0 },
  totalOk:        { type: Number,  default: 0 },
  total429:       { type: Number,  default: 0 },
  total4xx:       { type: Number,  default: 0 },
  total5xx:       { type: Number,  default: 0 },
  trafficSeries:  { type: Array,   default: () => [] },
})

const TONE_COLOR = {
  success: '#16a34a',
  warn:    '#d97706',
  danger:  '#dc2626',
  idle:    '#94a3b8',
}

const accentColor = computed(() => TONE_COLOR[props.tone] || TONE_COLOR.success)

const hasTrafficData = computed(() => (props.trafficSeries || []).length >= 2)

const areaOption = computed(() => {
  const data = (props.trafficSeries || []).map((p) => [p.ts, Number(p.value) || 0])
  return {
    grid: { left: 0, right: 0, top: 8, bottom: 0 },
    xAxis: {
      type: 'time',
      show: false,
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      show: false,
      min: 0,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params) => {
        const p = params[0]
        const ts = new Date(p.value[0])
        const time = ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        return `${time} · ${formatInt(p.value[1])} acessos`
      },
    },
    series: [{
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2, color: accentColor.value },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: accentColor.value + 'aa' },
            { offset: 1, color: accentColor.value + '00' },
          ],
        },
      },
      data,
      animationDuration: 900,
      animationEasing: 'cubicOut',
    }],
  }
})

function formatInt(n) {
  if (n == null) return '-'
  return Number(n).toLocaleString('pt-BR')
}
</script>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 1fr) minmax(0, 1.1fr);
  gap: 24px;
  padding: 24px 28px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 18px;
  align-items: stretch;
  position: relative;
  overflow: hidden;
}
.hero::before {
  /* Gradiente sutil no topo (Apple-like accent) */
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent, #16a34a), transparent);
  opacity: 0.5;
}
.hero--success { --accent: #16a34a; }
.hero--warn    { --accent: #d97706; }
.hero--danger  { --accent: #dc2626; }
.hero--idle    { --accent: #94a3b8; }

.hero-status {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.hero-dot {
  position: relative;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.hero-dot-pulse {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.25;
  animation: heroPulse 2s ease-out infinite;
}
@keyframes heroPulse {
  0%   { transform: scale(1);   opacity: 0.4; }
  100% { transform: scale(2.4); opacity: 0; }
}

.hero-text { min-width: 0; }
.hero-headline {
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  line-height: 1.2;
}
.hero-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

/* Gauge — peça central */
.hero-gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  text-align: center;
  gap: 4px;
}
.hero-gauge-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Area chart */
.hero-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.hero-area-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.hero-area-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.hero-area-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.hero-area .echart { flex: 1; min-height: 80px; }
.hero-area-empty {
  flex: 1;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  color: var(--color-text-muted);
  font-size: 11px;
  font-style: italic;
  padding: 8px 12px;
  text-align: center;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--accent, #16a34a) 4%, transparent));
}

/* Responsivo */
@media (max-width: 1024px) {
  .hero { grid-template-columns: 1fr 1fr; padding: 20px; }
  .hero-status { grid-column: 1 / -1; }
}
@media (max-width: 640px) {
  .hero { grid-template-columns: 1fr; gap: 16px; padding: 18px; }
  .hero-area .echart { min-height: 60px; }
  .hero-gauge .echart { height: 96px; }
}

@media (prefers-reduced-motion: reduce) {
  .hero-dot-pulse { animation: none; }
}
</style>

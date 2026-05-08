<template>
  <div class="gauge-wrap" :class="`gauge-wrap--${tone}`">
    <!-- Halo de fundo (sutil, segue a cor do tone) -->
    <div class="gauge-halo" aria-hidden="true"></div>

    <!-- Gauge principal -->
    <VChart
      class="gauge-chart"
      :option="gaugeOption"
      :init-options="{ renderer: 'svg' }"
      autoresize
    />

    <!-- Caption central (fica DENTRO do gauge, sobreposta) -->
    <div class="gauge-center" aria-live="polite">
      <span class="gauge-suffix">{{ centerCaption }}</span>
    </div>

    <!-- Breakdown row (chips por status) -->
    <ul class="gauge-breakdown" v-if="breakdown.length">
      <li v-for="b in breakdown" :key="b.label" :class="`bk bk--${b.tone}`">
        <span class="bk-dot" aria-hidden="true"></span>
        <span class="bk-label">{{ b.label }}</span>
        <span class="bk-value">{{ formatInt(b.value) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

use([GaugeChart, TooltipComponent, SVGRenderer])

const props = defineProps({
  rate:           { type: Number, default: 0 },           // 0..100
  totalRequests:  { type: Number, default: 0 },           // total no período
  totalOk:        { type: Number, default: 0 },           // 2xx
  total429:       { type: Number, default: 0 },
  total4xx:       { type: Number, default: 0 },
  total5xx:       { type: Number, default: 0 },
  threshold:      { type: Number, default: 95 },          // SLA target
  tone:           { type: String, default: 'success' },   // success | warn | danger | idle
})

// Cor do arco principal: gradiente do vermelho (0%) ao verde (100%)
// Usa color stops de gauge ECharts (axisLine.lineStyle.color como array)
const ARC_COLORS = [
  [0.5,  '#dc2626'],  // 0..50 vermelho
  [0.75, '#f59e0b'],  // 50..75 âmbar
  [0.9,  '#facc15'],  // 75..90 amarelo
  [1.0,  '#16a34a'],  // 90..100 verde
]

const TONE_COLOR = {
  success: '#16a34a',
  warn:    '#d97706',
  danger:  '#dc2626',
  idle:    '#94a3b8',
}

// Cor do ponteiro/progresso baseada no valor real
const progressColor = computed(() => {
  const v = props.rate / 100
  for (const [stop, color] of ARC_COLORS) {
    if (v <= stop) return color
  }
  return '#16a34a'
})

const gaugeOption = computed(() => ({
  series: [
    // Background ring (faixas coloridas — orientação visual)
    {
      type: 'gauge',
      radius: '94%',
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      progress: { show: false },
      pointer: { show: false },
      anchor: { show: false },
      axisLine: {
        lineStyle: {
          width: 6,
          color: ARC_COLORS.map(([s, c]) => [s, c + '22']),  // versão muito sutil
        },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title: { show: false },
      detail: { show: false },
      data: [{ value: 100 }],
      silent: true,
      animation: false,
    },
    // Arco de progresso (a estrela)
    {
      type: 'gauge',
      radius: '88%',
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      progress: {
        show: true,
        width: 14,
        roundCap: true,
        itemStyle: {
          color: progressColor.value,
          shadowColor: progressColor.value + '55',
          shadowBlur: 8,
        },
      },
      pointer: { show: false },
      anchor: { show: false },
      axisLine: {
        lineStyle: {
          width: 14,
          color: [[1, 'rgba(148, 163, 184, 0.14)']],
        },
      },
      axisTick: {
        show: true,
        distance: -22,
        length: 6,
        splitNumber: 5,
        lineStyle: { color: 'rgba(148, 163, 184, 0.5)', width: 1 },
      },
      splitLine: {
        show: true,
        distance: -24,
        length: 10,
        lineStyle: { color: 'rgba(148, 163, 184, 0.7)', width: 1.5 },
      },
      axisLabel: {
        show: true,
        distance: -42,
        fontSize: 10,
        color: 'rgba(148, 163, 184, 0.85)',
        formatter: (v) => {
          if (v === 0 || v === 100) return v + '%'
          if (v === 50) return '50'
          return ''
        },
      },
      title: { show: false },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '-12%'],
        formatter: (v) => `${v.toFixed(1)}%`,
        fontSize: 36,
        fontWeight: 700,
        color: progressColor.value,
        // ECharts permite letterspacing via rich
        rich: {},
      },
      data: [{ value: Number(props.rate) || 0 }],
      animationDuration: 1100,
      animationEasing: 'cubicOut',
    },
    // Marcador de SLA (linha pequena no threshold)
    {
      type: 'gauge',
      radius: '88%',
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      progress: { show: false },
      pointer: {
        show: true,
        showAbove: true,
        length: '100%',
        width: 2,
        offsetCenter: [0, '-78%'],
        itemStyle: { color: progressColor.value, shadowBlur: 4, shadowColor: progressColor.value + 'aa' },
      },
      // Renderiza só uma linha curta no exato ponto do threshold
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      anchor: { show: false },
      title: { show: false },
      detail: { show: false },
      data: [{ value: props.threshold }],
      silent: true,
      animation: false,
    },
  ],
}))

const centerCaption = computed(() => {
  if ((props.totalRequests || 0) === 0) return 'sem acessos'
  const ok = props.totalOk || 0
  return `${formatInt(ok)} de ${formatInt(props.totalRequests)} OK`
})

const breakdown = computed(() => {
  const list = []
  if ((props.totalOk || 0) > 0)   list.push({ label: 'Sucesso (2xx)', value: props.totalOk,  tone: 'success' })
  if ((props.total429 || 0) > 0)  list.push({ label: 'Excesso (429)', value: props.total429, tone: 'warn' })
  if ((props.total4xx || 0) > 0)  list.push({ label: 'Cliente (4xx)', value: props.total4xx, tone: 'warn' })
  if ((props.total5xx || 0) > 0)  list.push({ label: 'Servidor (5xx)', value: props.total5xx, tone: 'danger' })
  return list
})

function formatInt(n) {
  if (n == null) return '-'
  return Number(n).toLocaleString('pt-BR')
}
</script>

<style scoped>
.gauge-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 4px;
}

/* Halo */
.gauge-halo {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  height: 100px;
  border-radius: 50%;
  filter: blur(28px);
  opacity: 0.18;
  z-index: 0;
  pointer-events: none;
  transition: background 320ms ease, opacity 320ms ease;
}
.gauge-wrap--success .gauge-halo { background: radial-gradient(circle, #16a34a, transparent 70%); }
.gauge-wrap--warn    .gauge-halo { background: radial-gradient(circle, #d97706, transparent 70%); }
.gauge-wrap--danger  .gauge-halo {
  background: radial-gradient(circle, #dc2626, transparent 70%);
  opacity: 0.28;
  animation: haloPulse 2s ease-in-out infinite;
}
.gauge-wrap--idle    .gauge-halo { opacity: 0; }
@keyframes haloPulse {
  0%, 100% { opacity: 0.22; }
  50%      { opacity: 0.4; }
}

/* Gauge */
.gauge-chart {
  width: 100%;
  height: 200px;
  position: relative;
  z-index: 1;
}

/* Caption central (sob o número grande do ECharts) */
.gauge-center {
  position: absolute;
  top: 56%;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
  z-index: 2;
}
.gauge-suffix {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

/* Breakdown row */
.gauge-breakdown {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  z-index: 1;
  position: relative;
}
.bk {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-glass-bg, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--color-border);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
.bk-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.bk--success .bk-dot { background: #16a34a; }
.bk--warn    .bk-dot { background: #d97706; }
.bk--danger  .bk-dot { background: #dc2626; }
.bk-label {
  color: var(--color-text-muted);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
}
.bk-value {
  color: var(--color-text-primary);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
  .gauge-chart { height: 170px; }
  .gauge-suffix { font-size: 10px; }
  .bk { padding: 3px 8px; font-size: 10px; }
}

@media (prefers-reduced-motion: reduce) {
  .gauge-wrap--danger .gauge-halo { animation: none; }
}
</style>

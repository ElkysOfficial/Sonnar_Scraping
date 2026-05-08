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
      <span class="gauge-sla" :title="`Meta de SLA: ${threshold}%`">
        <span class="gauge-sla-dot" aria-hidden="true"></span>
        Meta SLA · {{ threshold }}%
      </span>
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
      radius: '92%',
      center: ['50%', '55%'],
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
      radius: '85%',
      center: ['50%', '55%'],
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      progress: {
        show: true,
        width: 16,
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
          width: 16,
          color: [[1, 'rgba(148, 163, 184, 0.14)']],
        },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title: { show: false },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '-6%'],
        formatter: (v) => `${v.toFixed(1)}%`,
        fontSize: 34,
        fontWeight: 700,
        color: progressColor.value,
        rich: {},
      },
      data: [{ value: Number(props.rate) || 0 }],
      animationDuration: 1100,
      animationEasing: 'cubicOut',
    },
    // Zona SLA — faixa amber sutil de threshold→100% (no perímetro externo)
    {
      type: 'gauge',
      radius: '95%',
      center: ['50%', '55%'],
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      progress: { show: false },
      pointer: { show: false },
      anchor: { show: false },
      axisLine: {
        lineStyle: {
          width: 3,
          color: [
            [props.threshold / 100, 'rgba(0,0,0,0)'],
            [1.0, 'rgba(251, 191, 36, 0.55)'],
          ],
        },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title: { show: false },
      detail: { show: false },
      data: [{ value: 0 }],
      silent: true,
      animation: false,
    },
    // Marcador de SLA — dot luminoso amber sentado sobre o arco no threshold
    {
      type: 'gauge',
      radius: '85%',
      center: ['50%', '55%'],
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      progress: { show: false },
      pointer: {
        show: true,
        showAbove: true,
        icon: 'circle',
        length: 12,
        width: 12,
        offsetCenter: [0, '-87%'],
        itemStyle: {
          color: '#fbbf24',
          borderColor: '#0f172a',
          borderWidth: 2,
          shadowBlur: 12,
          shadowColor: 'rgba(251, 191, 36, 0.85)',
        },
      },
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
    // Halo externo do dot (anel concêntrico amber suave)
    {
      type: 'gauge',
      radius: '85%',
      center: ['50%', '55%'],
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      progress: { show: false },
      pointer: {
        show: true,
        showAbove: false,
        icon: 'circle',
        length: 22,
        width: 22,
        offsetCenter: [0, '-87%'],
        itemStyle: {
          color: 'transparent',
          borderColor: 'rgba(251, 191, 36, 0.35)',
          borderWidth: 1.5,
        },
      },
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
  height: 240px;
  max-width: 280px;
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

/* Caption logo abaixo do gauge — não invade o arco */
.gauge-center {
  position: relative;
  margin-top: -8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
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
.gauge-sla {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.35);
  color: #fbbf24;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  pointer-events: auto;
  cursor: help;
}
.gauge-sla-dot {
  width: 6px; height: 6px;
  border-radius: 2px;
  background: #fbbf24;
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.7);
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

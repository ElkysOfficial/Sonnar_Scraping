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

// Helper para ler tokens do design system em runtime (charts ECharts).
function cssVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

// Stops do gauge derivados de tokens semânticos (error → warning → chart-5 → success)
const ARC_STOPS = [
  [0.5,  '--color-error',   '#DC2626'],
  [0.75, '--color-warning', '#D97706'],
  [0.9,  '--chart-5',       '#D97706'],
  [1.0,  '--color-success', '#059669'],
]
const arcColors = () => ARC_STOPS.map(([stop, token, fb]) => [stop, cssVar(token, fb)])

const TONE_TOKEN = {
  success: ['--color-success', '#059669'],
  warn:    ['--color-warning', '#D97706'],
  danger:  ['--color-error',   '#DC2626'],
  idle:    ['--color-text-muted', '#94a3b8'],
}

// Cor do ponteiro/progresso baseada no valor real
const progressColor = computed(() => {
  const v = props.rate / 100
  for (const [stop, token, fb] of ARC_STOPS) {
    if (v <= stop) return cssVar(token, fb)
  }
  return cssVar('--color-success', '#059669')
})

const gaugeOption = computed(() => ({
  series: [
    // Background ring (faixas coloridas - orientação visual)
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
          color: arcColors().map(([s, c]) => [s, `color-mix(in srgb, ${c} 13%, transparent)`]),
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
          color: [[1, `color-mix(in srgb, ${cssVar('--color-text-muted', '#94a3b8')} 14%, transparent)`]],
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
    // Marcador de SLA - tick radial fino na posição do threshold.
    // Convenção de gauges profissionais (Datadog, Grafana): uma barra estreita
    // perpendicular ao arco indica claramente "aqui está a meta".
    // Substitui o arco amber + dot + halo da versão anterior, que poluíam
    // visualmente sem agregar leitura. O texto "SLA 95%" abaixo do gauge dá
    // o contexto numérico.
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
        // ECharts usa o icon como caminho SVG; um retângulo fino dá o tick.
        icon: 'path://M-1,-9 L1,-9 L1,9 L-1,9 Z',
        length: 18,
        width: 4,
        offsetCenter: [0, '-87%'],
        itemStyle: {
          color: cssVar('--color-secondary', '#0891B2'),
          borderColor: cssVar('--color-background', '#FFFFFF'),
          borderWidth: 1,
          shadowBlur: 6,
          shadowColor: `color-mix(in srgb, ${cssVar('--color-secondary', '#0891B2')} 60%, transparent)`,
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
.gauge-wrap--success .gauge-halo { background: radial-gradient(circle, var(--color-success), transparent 70%); }
.gauge-wrap--warn    .gauge-halo { background: radial-gradient(circle, var(--color-warning), transparent 70%); }
.gauge-wrap--danger  .gauge-halo {
  background: radial-gradient(circle, var(--color-error), transparent 70%);
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

/* Caption logo abaixo do gauge - não invade o arco */
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
  background: color-mix(in srgb, var(--color-secondary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-secondary) 35%, transparent);
  color: var(--color-secondary);
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
  background: var(--color-secondary);
  box-shadow: 0 0 6px color-mix(in srgb, var(--color-secondary) 70%, transparent);
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
.bk--success .bk-dot { background: var(--color-success); }
.bk--warn    .bk-dot { background: var(--color-warning); }
.bk--danger  .bk-dot { background: var(--color-error); }
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

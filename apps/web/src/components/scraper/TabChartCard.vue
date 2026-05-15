<template>
  <section class="tab-chart-card" :class="`tab-chart-card--${tone}`">
    <header class="tab-chart-card__head">
      <div>
        <span class="tab-chart-card__eyebrow">{{ eyebrow }}</span>
        <h3 class="tab-chart-card__title">{{ title }}</h3>
      </div>
      <div v-if="$slots.aside" class="tab-chart-card__aside">
        <slot name="aside" />
      </div>
    </header>

    <VChart
      v-if="hasData"
      class="tab-chart-card__chart"
      :option="option"
      :init-options="{ renderer: 'svg' }"
      autoresize
    />
    <div v-else class="tab-chart-card__empty">
      <span>{{ emptyLabel || 'Sem dados suficientes para o gráfico nessa janela.' }}</span>
    </div>
  </section>
</template>

<script setup>
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart, PieChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

use([BarChart, PieChart, LineChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent, SVGRenderer])

defineProps({
  title:       { type: String, required: true },
  eyebrow:     { type: String, default: 'Visão geral' },
  tone:        { type: String, default: 'success' },
  option:      { type: Object, required: true },
  hasData:     { type: Boolean, default: true },
  emptyLabel:  { type: String, default: '' },
})
</script>

<style scoped>
.tab-chart-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 18px 20px 12px;
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
}
.tab-chart-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent, var(--color-accent)), transparent);
  opacity: 0.4;
}
.tab-chart-card--success { --accent: var(--color-success); }
.tab-chart-card--warn    { --accent: var(--color-warning); }
.tab-chart-card--danger  { --accent: var(--color-error); }
.tab-chart-card--info    { --accent: var(--color-accent); }
.tab-chart-card--neutral { --accent: var(--color-text-muted); }

.tab-chart-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}
.tab-chart-card__eyebrow {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 2px;
}
.tab-chart-card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
}
.tab-chart-card__aside {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.tab-chart-card__chart {
  width: 100%;
  height: 220px;
}

.tab-chart-card__empty {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  color: var(--color-text-muted);
  font-size: 12px;
  font-style: italic;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--accent) 4%, transparent));
}
</style>

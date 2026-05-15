<template>
  <div class="admin-dashboard">
    <TopProgressBar :active="refreshing" />

    <!-- Skeleton enquanto a página inteira carrega pela primeira vez. Mantemos
         o mesmo container e gap, então a transição p/ conteúdo real é suave. -->
    <AdminPageSkeleton
      v-if="initialLoading"
      variant="dashboard"
      :show-header="false"
      :kpi-count="6"
      :rows="5"
      :columns="4"
    />

    <template v-else>
    <!-- Indicador de data (título e subtítulo vêm da topbar) -->
    <div class="page-meta animate-fade-in-up">
      <span class="page-meta__date">{{ currentDate }}</span>
    </div>

    <!-- Hero Card (MRR no período + seletor) -->
    <section class="hero-card animate-fade-in-up stagger-1">
      <div class="hero-top">
        <div class="hero-headline">
          <span class="hero-label">MRR nos últimos {{ periodLabel }} em</span>
          <span class="hero-value" :class="mrrTrendClass">R$ {{ formatMoney(periodMrr) }}</span>
        </div>
        <div class="period-selector" role="tablist" aria-label="Selecionar período">
          <button
            v-for="opt in periodOptions"
            :key="opt.value"
            type="button"
            role="tab"
            :aria-selected="selectedPeriod === opt.value"
            class="period-btn"
            :class="{ active: selectedPeriod === opt.value }"
            @click="selectedPeriod = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div class="hero-subcards">
        <div class="hero-subcard accent-line">
          <span class="subcard-label">MRR no período</span>
          <span class="subcard-value">R$ {{ formatMoney(periodMrr) }}</span>
        </div>
        <div class="hero-subcard">
          <span class="subcard-label">Crescimento ({{ periodLabel }})</span>
          <span class="subcard-value">{{ growthLabel }}</span>
        </div>
      </div>
    </section>

    <!-- KPI Grid -->
    <section class="kpi-grid">
      <article class="kpi-card animate-fade-in-up stagger-2">
        <span class="kpi-label">MRR atual</span>
        <span class="kpi-value success">R$ {{ formatMoney(stats.mrr) }}</span>
        <span class="kpi-hint">{{ stats.activeSubscribers }} com recorrência</span>
      </article>

      <article class="kpi-card accent-line-error animate-fade-in-up stagger-3">
        <span class="kpi-label">Resultado acumulado</span>
        <span class="kpi-value" :class="stats.accumulated < 0 ? 'error' : 'success'">
          R$ {{ formatMoney(stats.accumulated) }}
        </span>
        <span class="kpi-hint">Mês em R$ {{ formatMoney(stats.monthly) }}</span>
      </article>

      <article class="kpi-card animate-fade-in-up stagger-4">
        <span class="kpi-label">Em trial</span>
        <span class="kpi-value">{{ stats.trialSubscribers }}</span>
        <span class="kpi-hint">{{ stats.trialSubscribers === 0 ? 'Nenhum em trial' : 'aguardando conversão' }}</span>
      </article>

      <article class="kpi-card animate-fade-in-up stagger-5">
        <span class="kpi-label">Assinantes ativos</span>
        <span class="kpi-value accent">{{ stats.activeSubscribers }}</span>
        <span class="kpi-hint">{{ stats.newThisMonth }} novo(s) este mês</span>
      </article>

      <article class="kpi-card animate-fade-in-up stagger-6">
        <span class="kpi-label">Plano Pro</span>
        <span class="kpi-value">{{ stats.proCount }}</span>
        <span class="kpi-hint">R$ {{ formatMoney(stats.proCount * 5) }} / mês</span>
      </article>

      <article class="kpi-card accent-line animate-fade-in-up stagger-6">
        <span class="kpi-label">Plano Plus</span>
        <span class="kpi-value accent">{{ stats.plusCount }}</span>
        <span class="kpi-hint">R$ {{ formatMoney(stats.plusCount * 10) }} / mês</span>
      </article>
    </section>

    <!-- Gráficos -->
    <section class="charts-grid animate-fade-in-up stagger-6">
      <TabChartCard
        eyebrow="Receita"
        title="Distribuição do MRR por plano"
        tone="info"
        :option="planDistOption"
        :has-data="planChartHasData"
        empty-label="Nenhum assinante ativo ainda."
      />
      <TabChartCard
        eyebrow="Crescimento"
        title="Novos assinantes por mês"
        tone="success"
        :option="newSubsOption"
        :has-data="newSubsHasData"
        empty-label="Sem assinantes registrados nos últimos meses."
      />
    </section>

    <!-- Assinantes Recentes -->
    <section class="recent-section animate-fade-in-up stagger-6">
      <div class="section-header">
        <h2 class="section-title">Assinantes Recentes</h2>
        <router-link to="/admin/subscribers" class="view-all-link">
          Ver todos
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </router-link>
      </div>

      <div class="subscribers-table-wrapper">
        <table class="subscribers-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Plano</th>
              <th>Status</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="subscriber in recentSubscribers" :key="subscriber.id">
              <td>
                <div class="subscriber-info">
                  <div class="subscriber-avatar">{{ getInitials(subscriber.user_name) }}</div>
                  <div class="subscriber-details">
                    <span class="subscriber-name">{{ subscriber.user_name }}</span>
                    <span class="subscriber-email">{{ subscriber.email }}</span>
                  </div>
                </div>
              </td>
              <td>
                <span class="plan-badge" :class="subscriber.plan?.toLowerCase()">
                  {{ subscriber.plan || 'N/A' }}
                </span>
              </td>
              <td>
                <span class="status-badge" :class="subscriber.active ? 'active' : 'inactive'">
                  {{ subscriber.active ? 'Ativo' : 'Inativo' }}
                </span>
              </td>
              <td class="date-cell">
                {{ formatDate(subscriber.added_at) }}
              </td>
            </tr>
            <tr v-if="recentSubscribers.length === 0">
              <td colspan="4">
                <EmptyDetection
                  icon="signal"
                  title="Nenhum sinal detectado"
                  subtitle="Aguardando novos assinantes"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="subscribers-cards">
        <div v-for="subscriber in recentSubscribers" :key="subscriber.id" class="subscriber-card">
          <div class="subscriber-card-header">
            <div class="subscriber-info">
              <div class="subscriber-avatar">{{ getInitials(subscriber.user_name) }}</div>
              <div class="subscriber-details">
                <span class="subscriber-name">{{ subscriber.user_name }}</span>
                <span class="subscriber-email">{{ subscriber.email }}</span>
              </div>
            </div>
            <span class="status-badge" :class="subscriber.active ? 'active' : 'inactive'">
              {{ subscriber.active ? 'Ativo' : 'Inativo' }}
            </span>
          </div>
          <div class="subscriber-card-footer">
            <span class="plan-badge" :class="subscriber.plan?.toLowerCase()">
              {{ subscriber.plan || 'N/A' }}
            </span>
            <span class="date-cell">{{ formatDate(subscriber.added_at) }}</span>
          </div>
        </div>
        <EmptyDetection
          v-if="recentSubscribers.length === 0"
          icon="signal"
          title="Nenhum sinal detectado"
          subtitle="Aguardando novos assinantes"
        />
      </div>
    </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { supabase } from '@/integrations/supabase/client'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import EmptyDetection from '@/components/EmptyDetection.vue'
import TabChartCard from '@/components/scraper/TabChartCard.vue'
import AdminPageSkeleton from '@/components/admin/AdminPageSkeleton.vue'
import TopProgressBar from '@/components/admin/TopProgressBar.vue'

interface Subscriber {
  id: string
  user_name: string
  email: string | null
  plan: string | null
  active: boolean | null
  added_at: string | null
}

const stats = reactive({
  activeSubscribers: 0,
  trialSubscribers: 0,
  mrr: 0,
  proCount: 0,
  plusCount: 0,
  newThisMonth: 0,
  accumulated: 0,
  monthly: 0
})

const recentSubscribers = ref<Subscriber[]>([])
const allActiveSubs = ref<Array<{ plan: string | null; created_at: string | null }>>([])

const periodOptions = [
  { label: '1M', value: 1 },
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '9M', value: 9 },
  { label: '12M', value: 12 }
]
const selectedPeriod = ref(6)

const periodLabel = computed(() => `${selectedPeriod.value} ${selectedPeriod.value === 1 ? 'mês' : 'meses'}`)
const periodMrr = computed(() => stats.mrr * selectedPeriod.value)
const mrrTrendClass = computed(() => (periodMrr.value > 0 ? 'success' : 'muted'))
const growthLabel = computed(() => (stats.activeSubscribers === 0 ? 'Sem dados' : 'Estável'))

const currentDate = computed(() => {
  const formatted = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
})

const adminUserIds = ref<Set<string>>(new Set())

// `initialLoading` é o boot da página (mostra skeleton ocupando o espaço inteiro);
// `refreshing` é usado em recargas sob demanda (mostra apenas a barra fina no topo
// e mantém os dados visíveis para não perder contexto).
const initialLoading = ref(true)
const refreshing = ref(false)

onMounted(async () => {
  try {
    await fetchAdmins()
    await Promise.all([fetchStats(), fetchRecentSubscribers()])
  } finally {
    initialLoading.value = false
  }
})

async function fetchAdmins() {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['owner', 'admin'])
    if (error) throw error
    adminUserIds.value = new Set((data ?? []).map((r: any) => r.user_id))
  } catch (err) {
    console.error('Falha ao carregar admins:', err)
  }
}

async function fetchStats() {
  try {
    const { data: subs, error } = await supabase
      .from('subscribers')
      .select('user_id, plan, status, created_at')

    if (error) throw error

    // Remove admins/owners das estatísticas - eles não devem contar como assinantes.
    const nonAdmins = (subs ?? []).filter((s: any) => !adminUserIds.value.has(s.user_id))

    const active = nonAdmins.filter(s => s.status === 'active')
    stats.activeSubscribers = active.length
    allActiveSubs.value = active.map(s => ({ plan: s.plan, created_at: s.created_at }))

    stats.proCount = active.filter(s => s.plan === 'pro').length
    stats.plusCount = active.filter(s => s.plan === 'plus').length

    stats.mrr = stats.proCount * 5 + stats.plusCount * 10
    stats.monthly = stats.mrr
    stats.accumulated = stats.mrr * 6
    stats.trialSubscribers = nonAdmins.filter(s => s.status === 'pending').length

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    stats.newThisMonth = active.filter(s => s.created_at && new Date(s.created_at) >= startOfMonth).length
  } catch (err) {
    console.error('Error fetching stats:', err)
  }
}

async function fetchRecentSubscribers() {
  try {
    const { data, error } = await supabase
      .from('subscribers')
      .select('id, user_id, name, email, plan, status, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error
    recentSubscribers.value = (data ?? [])
      .filter((s: any) => !adminUserIds.value.has(s.user_id))
      .slice(0, 5)
      .map(s => ({
      id: s.id,
      user_name: s.name,
      email: s.email,
      plan: s.plan,
      active: s.status === 'active',
      added_at: s.created_at
    }))
  } catch (err) {
    console.error('Error fetching subscribers:', err)
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR })
}

function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// =====================================================================
// Gráficos
// =====================================================================
// Helpers que leem tokens do design system para manter os charts coerentes
// com os temas light/dark.
function cssVar(name: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
const CHART_TEXT = () => cssVar('--color-text-muted', '#6B7280')
const CHART_GRID = () => `color-mix(in srgb, ${cssVar('--color-text-muted', '#6B7280')} 22%, transparent)`
const CHART_TIP_BG = () => cssVar('--color-text-primary', '#0f172a')
const CHART_ON_TIP = () => cssVar('--color-background', '#fff')

const planChartHasData = computed(() => stats.proCount + stats.plusCount > 0)
const planDistOption = computed(() => {
  const proMrr = stats.proCount * 5
  const plusMrr = stats.plusCount * 10
  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: CHART_TIP_BG(), borderWidth: 0,
      textStyle: { color: CHART_ON_TIP(), fontSize: 11 },
      formatter: (p: any) => `${p.name}<br/>R$ ${formatMoney(p.value)} ({d}%)`,
    },
    legend: {
      orient: 'vertical', right: 8, top: 'center',
      icon: 'circle', itemWidth: 8, itemHeight: 8,
      textStyle: { color: CHART_TEXT(), fontSize: 11 },
    },
    series: [{
      type: 'pie',
      radius: ['58%', '82%'],
      center: ['30%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: cssVar('--color-surface', '#FAFBFC'), borderWidth: 2 },
      label: { show: false },
      labelLine: { show: false },
      // Cores derivadas da identidade Sonnar (azul → ciano → roxo).
      // Pro = azul (primário); Plus = roxo (premium). Mesma família visual,
      // sem amarelo/dourado fora do contexto de warning.
      data: [
        { name: `Pro (${stats.proCount})`,  value: proMrr,  itemStyle: { color: cssVar('--chart-1', '#2563EB') } },
        { name: `Plus (${stats.plusCount})`, value: plusMrr, itemStyle: { color: cssVar('--chart-3', '#7C3AED') } },
      ].filter(d => d.value > 0),
      animationDuration: 700,
      animationEasing: 'cubicOut',
    }],
  }
})

const monthlyBuckets = computed(() => {
  const months = selectedPeriod.value
  const now = new Date()
  const labels: string[] = []
  const counts: number[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = format(d, "MMM/yy", { locale: ptBR })
    const c = allActiveSubs.value.filter(s => {
      if (!s.created_at) return false
      const sd = new Date(s.created_at)
      return `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}` === key
    }).length
    labels.push(label.charAt(0).toUpperCase() + label.slice(1))
    counts.push(c)
  }
  return { labels, counts }
})

const newSubsHasData = computed(() => monthlyBuckets.value.counts.some(c => c > 0))
const newSubsOption = computed(() => {
  const { labels, counts } = monthlyBuckets.value
  return {
    grid: { left: 8, right: 16, top: 16, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: CHART_TIP_BG(), borderWidth: 0,
      textStyle: { color: CHART_ON_TIP(), fontSize: 11 },
      formatter: (params: any) => {
        const p = params[0]
        return `${p.name}<br/>${p.value} novo${p.value === 1 ? '' : 's'}`
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: CHART_GRID() } },
      axisTick: { show: false },
      axisLabel: { color: CHART_TEXT(), fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_GRID() } },
      axisLabel: { color: CHART_TEXT(), fontSize: 10 },
    },
    series: [{
      type: 'bar',
      data: counts,
      itemStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: cssVar('--color-success', '#059669') },
            { offset: 1, color: `color-mix(in srgb, ${cssVar('--color-success', '#059669')} 30%, transparent)` },
          ],
        },
        borderRadius: [6, 6, 0, 0],
      },
      barMaxWidth: 36,
      animationDuration: 700,
      animationEasing: 'cubicOut',
    }],
  }
})
</script>

<style scoped>
.admin-dashboard {
  /* Sem max-width: o AdminLayout já cobre o cap em 1600px e centraliza.
     Permitir que o dashboard preencha esse espaço evita "buracos" laterais. */
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* ===== Grid de gráficos ===== */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}
.charts-grid > * { margin-bottom: 0; }

@media (max-width: 768px) {
  .charts-grid { grid-template-columns: 1fr; }
}

/* ===== Page meta (apenas data - título e subtítulo vêm da topbar) ===== */
.page-meta {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.page-meta__date {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* ===== Hero Card ===== */
.hero-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.hero-headline {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.hero-label {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  font-weight: var(--font-medium);
}

.hero-value {
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  font-weight: var(--font-bold);
  line-height: 1.1;
  color: var(--color-text-primary);
}

.hero-value.success { color: var(--color-success); }
.hero-value.muted { color: var(--color-text-muted); }

/* Period selector - pill estilo Elkys */
.period-selector {
  display: inline-flex;
  align-items: center;
  gap: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full, 999px);
  padding: 0.25rem;
}

/* Toggle de período - não é um botão de ação normal, é uma "pill" exclusiva
   de seleção. Mantemos visual próprio mas com tokens consistentes. */
.period-btn {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.period-btn:hover { color: var(--color-text-primary); }

.period-btn.active {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

/* Hero subcards - sempre 2 colunas, exceto em mobile (full-width) */
.hero-subcards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}
@media (max-width: 560px) {
  .hero-subcards { grid-template-columns: 1fr; }
}

.hero-subcard {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  position: relative;
  overflow: hidden;
}

.hero-subcard.accent-line::before,
.kpi-card.accent-line::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--color-accent);
}

.kpi-card.accent-line-error::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--color-error);
}

.subcard-label {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide, 0.06em);
}

.subcard-value {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
}

/* ===== KPI Grid =====
   6 cards: 6 colunas em telas grandes, 3 em médias, 2 em tablets, 1 em mobile.
   Colunas explícitas evitam o "auto-fit-leaves-empty-column" do grid anterior. */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--space-4);
}
@media (max-width: 1280px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 768px)  { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px)  { .kpi-grid { grid-template-columns: 1fr; } }

.kpi-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  position: relative;
  overflow: hidden;
  transition: all var(--transition-fast);
}

/* Hover discreto - apenas a borda muda de tom. Nada se move. */
.kpi-card:hover {
  border-color: color-mix(in srgb, var(--color-text-muted) 35%, var(--color-border));
}

.kpi-label {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide, 0.06em);
}

.kpi-value {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  line-height: 1;
}

.kpi-value.success { color: var(--color-success); }
.kpi-value.error { color: var(--color-error); }
.kpi-value.accent { color: var(--color-accent); }

.kpi-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* ===== Recent section (mantém parte do estilo anterior) ===== */
.recent-section {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.section-title {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
}

.view-all-link {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-accent);
}

.view-all-link svg { width: 1rem; height: 1rem; }
.view-all-link:hover { text-decoration: underline; }

.subscribers-table-wrapper { overflow-x: auto; }

.subscribers-table {
  width: 100%;
  border-collapse: collapse;
}

.subscribers-table th,
.subscribers-table td {
  padding: var(--space-4) var(--space-5);
  text-align: left;
}

.subscribers-table th {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  background: var(--color-surface);
}

.subscribers-table td {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  border-top: 1px solid var(--color-border);
}

.subscriber-info {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.subscriber-avatar {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--color-accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: var(--font-bold);
  flex-shrink: 0;
}

.subscriber-details { display: flex; flex-direction: column; }
.subscriber-name { font-weight: var(--font-medium); }
.subscriber-email { font-size: var(--text-xs); color: var(--color-text-muted); }

.plan-badge {
  display: inline-block;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
}

.plan-badge.pro,
.plan-badge.plus {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}

.status-badge.active {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.status-badge.inactive {
  background: var(--color-error-soft);
  color: var(--color-error);
}

.date-cell { color: var(--color-text-muted); white-space: nowrap; }

.subscribers-cards {
  display: none;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.subscriber-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.subscriber-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.subscriber-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

@media (max-width: 768px) {
  .page-meta { justify-content: flex-start; }
  .hero-top { flex-direction: column; align-items: stretch; }
  .period-selector { align-self: flex-start; }
  .subscribers-table-wrapper { display: none; }
  .subscribers-cards { display: flex; }
}

@media (max-width: 480px) {
  .kpi-grid { grid-template-columns: 1fr; }
  .period-btn { padding: 0.4rem 0.65rem; font-size: var(--text-xs); }
}
</style>

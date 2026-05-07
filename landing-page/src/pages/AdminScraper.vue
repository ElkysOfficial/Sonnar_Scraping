<template>
  <div class="scraper-page">
    <header class="page-head">
      <div>
        <h1>Engine de Coleta</h1>
        <p class="subtitle">Saúde, vazão e estado do scraper em tempo quase real.</p>
      </div>
      <div class="head-actions">
        <select v-model.number="windowMinutes" class="select">
          <option :value="15">Últimos 15 min</option>
          <option :value="60">Última 1 h</option>
          <option :value="360">Últimas 6 h</option>
          <option :value="1440">Últimas 24 h</option>
        </select>
        <button class="btn-refresh" @click="loadAll" :disabled="loading">
          {{ loading ? 'Carregando…' : 'Atualizar' }}
        </button>
      </div>
    </header>

    <!-- Saúde global -->
    <section class="kpi-grid">
      <article class="kpi" :class="health.healthClass">
        <span class="kpi-label">Requests</span>
        <span class="kpi-value">{{ formatInt(health.total_requests) }}</span>
        <span class="kpi-hint">{{ health.error_rate_pct }}% erro</span>
      </article>
      <article class="kpi" :class="{ danger: (health.total_429 || 0) > 0 }">
        <span class="kpi-label">429 (rate-limit)</span>
        <span class="kpi-value">{{ formatInt(health.total_429) }}</span>
      </article>
      <article class="kpi" :class="{ warn: (health.total_5xx || 0) > 0 }">
        <span class="kpi-label">5xx</span>
        <span class="kpi-value">{{ formatInt(health.total_5xx) }}</span>
      </article>
      <article class="kpi" :class="{ warn: (health.open_circuits || 0) > 0 }">
        <span class="kpi-label">Circuits abertos</span>
        <span class="kpi-value">{{ health.open_circuits || 0 }}</span>
      </article>
      <article class="kpi">
        <span class="kpi-label">Retries</span>
        <span class="kpi-value">{{ formatInt(health.total_retries) }}</span>
      </article>
      <article class="kpi success">
        <span class="kpi-label">Vagas persistidas</span>
        <span class="kpi-value">{{ formatInt(health.jobs_persisted_ok) }}</span>
        <span class="kpi-hint">{{ formatInt(health.jobs_persisted_error) }} falhas</span>
      </article>
    </section>

    <!-- Resumo por domínio -->
    <section class="card">
      <h2>Por domínio</h2>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Domínio</th>
              <th class="num">Reqs</th>
              <th class="num">2xx</th>
              <th class="num">429</th>
              <th class="num">5xx</th>
              <th class="num">Retries</th>
              <th class="num">p50 (ms)</th>
              <th class="num">p95 (ms)</th>
              <th class="num">Rate (req/s)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in summary" :key="row.domain">
              <td>{{ row.domain }}</td>
              <td class="num">{{ formatInt(row.req_total) }}</td>
              <td class="num">{{ formatInt(row.status_2xx) }}</td>
              <td class="num" :class="{ danger: row.status_429 > 0 }">{{ formatInt(row.status_429) }}</td>
              <td class="num" :class="{ warn: row.status_5xx > 0 }">{{ formatInt(row.status_5xx) }}</td>
              <td class="num">{{ formatInt(row.retries) }}</td>
              <td class="num">{{ formatNum(row.latency_p50) }}</td>
              <td class="num">{{ formatNum(row.latency_p95) }}</td>
              <td class="num">{{ formatRate(row.effective_rate) }}</td>
            </tr>
            <tr v-if="!summary.length">
              <td colspan="9" class="empty">Sem dados na janela selecionada.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Circuit breakers -->
    <section class="card">
      <h2>Circuit breakers</h2>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Domínio</th>
              <th>Estado</th>
              <th class="num">Erro 5m</th>
              <th class="num">Sucesso 5m</th>
              <th class="num">Taxa erro</th>
              <th class="num">Reabre em</th>
              <th>Atualizado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in circuits" :key="row.domain">
              <td>{{ row.domain }}</td>
              <td>
                <span class="pill" :class="circuitClass(row.state)">{{ row.state }}</span>
              </td>
              <td class="num">{{ row.failures_5m }}</td>
              <td class="num">{{ row.successes_5m }}</td>
              <td class="num">{{ formatPct(row.error_rate) }}</td>
              <td class="num">{{ formatSeconds(row.open_until_s) }}</td>
              <td>{{ formatTimestamp(row.updated_at) }}</td>
            </tr>
            <tr v-if="!circuits.length">
              <td colspan="7" class="empty">Nenhum circuito registrado ainda.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Fila de extração -->
    <section class="card">
      <h2>Fila de extração</h2>
      <div class="queue-grid">
        <div class="q-card"><span class="q-label">Descobertas</span><span class="q-value">{{ formatInt(queue.discovered) }}</span></div>
        <div class="q-card"><span class="q-label">Em execução</span><span class="q-value">{{ formatInt(queue.running) }}</span></div>
        <div class="q-card warn"><span class="q-label">Parciais</span><span class="q-value">{{ formatInt(queue.partial) }}</span></div>
        <div class="q-card success"><span class="q-label">Completas</span><span class="q-value">{{ formatInt(queue.completed) }}</span></div>
        <div class="q-card warn"><span class="q-label">Falharam</span><span class="q-value">{{ formatInt(queue.failed) }}</span></div>
        <div class="q-card warn"><span class="q-label">Bloqueadas</span><span class="q-value">{{ formatInt(queue.blocked) }}</span></div>
        <div class="q-card danger"><span class="q-label">DLQ</span><span class="q-value">{{ formatInt(queue.dlq_total) }}</span></div>
      </div>

      <h3 class="subhead">Por engine × estado</h3>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Engine</th><th>Estado</th><th class="num">Total</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in queueStats" :key="i">
              <td>{{ row.engine }}</td>
              <td><span class="pill" :class="stateClass(row.state)">{{ row.state }}</span></td>
              <td class="num">{{ formatInt(row.total) }}</td>
            </tr>
            <tr v-if="!queueStats.length"><td colspan="3" class="empty">Fila vazia.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Dead-letter queue -->
    <section class="card">
      <h2>Dead-letter queue (últimas falhas persistentes)</h2>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Engine</th>
              <th>URL</th>
              <th class="num">Tentativas</th>
              <th>Erro</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in dlq" :key="i">
              <td>{{ formatTimestamp(row.failed_at) }}</td>
              <td>{{ row.engine }}</td>
              <td class="url-cell"><a :href="row.job_url" target="_blank" rel="noopener">{{ row.job_url }}</a></td>
              <td class="num">{{ row.attempts }}</td>
              <td>
                <span class="pill pill-danger">{{ row.last_error_type || '—' }}</span>
                <small>{{ row.last_error_msg }}</small>
              </td>
            </tr>
            <tr v-if="!dlq.length"><td colspan="5" class="empty">Nenhuma falha persistente.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Eventos -->
    <section class="card">
      <h2>Eventos recentes</h2>
      <ul class="event-list">
        <li v-for="(ev, idx) in events" :key="idx" :class="eventClass(ev.kind)">
          <span class="ev-ts">{{ formatTimestamp(ev.ts) }}</span>
          <span class="ev-kind">{{ ev.kind }}</span>
          <span class="ev-domain">{{ ev.domain || '—' }}</span>
          <span class="ev-data">{{ ev.data ? JSON.stringify(ev.data) : '' }}</span>
        </li>
        <li v-if="!events.length" class="empty">Sem eventos na janela selecionada.</li>
      </ul>
    </section>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { supabase } from '@/integrations/supabase/client'

const windowMinutes = ref(60)
const loading = ref(false)
const errorMsg = ref('')

const summary = ref([])
const circuits = ref([])
const events = ref([])
const healthRow = ref(null)
const queue = ref({})
const queueStats = ref([])
const dlq = ref([])

const health = computed(() => {
  const h = healthRow.value || {}
  const errPct = h.error_rate ? (h.error_rate * 100) : 0
  let healthClass = 'success'
  if (errPct > 5) healthClass = 'warn'
  if (errPct > 15 || (h.open_circuits || 0) > 0) healthClass = 'danger'
  return {
    ...h,
    error_rate_pct: errPct.toFixed(1),
    healthClass,
  }
})

async function loadAll () {
  loading.value = true
  errorMsg.value = ''
  try {
    const [s, c, e, h, qs, q, d] = await Promise.all([
      supabase.rpc('get_scraper_summary',          { window_minutes: windowMinutes.value }),
      supabase.rpc('get_scraper_circuits'),
      supabase.rpc('get_scraper_events',           { window_minutes: windowMinutes.value, max_rows: 200 }),
      supabase.rpc('get_scraper_health',           { window_minutes: windowMinutes.value }),
      supabase.rpc('get_extraction_queue_stats'),
      supabase.rpc('get_extraction_queue_summary'),
      supabase.rpc('get_extraction_dlq',           { window_minutes: windowMinutes.value, max_rows: 100 }),
    ])
    for (const r of [s, c, e, h, qs, q, d]) if (r.error) throw r.error
    summary.value = s.data || []
    circuits.value = c.data || []
    events.value = e.data || []
    healthRow.value = (h.data && h.data[0]) || null
    queueStats.value = qs.data || []
    queue.value = (q.data && q.data[0]) || {}
    dlq.value = d.data || []
  } catch (err) {
    errorMsg.value = err.message || 'Falha ao carregar métricas.'
  } finally {
    loading.value = false
  }
}

function circuitClass (state) {
  if (state === 'open') return 'pill-danger'
  if (state === 'half_open') return 'pill-warn'
  return 'pill-ok'
}
function stateClass (state) {
  if (state === 'completed') return 'pill-ok'
  if (state === 'failed' || state === 'blocked') return 'pill-danger'
  if (state === 'partial' || state === 'running') return 'pill-warn'
  return ''
}
function eventClass (kind) {
  if (!kind) return ''
  if (kind.startsWith('circuit.open') || kind.includes('error')) return 'ev-danger'
  if (kind.includes('429') || kind.includes('aborted') || kind.startsWith('circuit.half')) return 'ev-warn'
  return ''
}

function formatInt (n) { return n == null ? '—' : Number(n).toLocaleString('pt-BR') }
function formatNum (n) { return n == null ? '—' : Number(n).toFixed(0) }
function formatPct (n) { return n == null ? '—' : (n * 100).toFixed(1) + '%' }
function formatRate (n) { return n == null ? '—' : Number(n).toFixed(2) }
function formatSeconds (s) {
  if (!s || s <= 0) return '—'
  if (s < 60) return Math.round(s) + 's'
  if (s < 3600) return Math.round(s / 60) + 'm'
  return (s / 3600).toFixed(1) + 'h'
}
function formatTimestamp (ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('pt-BR', { hour12: false })
}

let timer = null
onMounted(() => {
  loadAll()
  timer = setInterval(loadAll, 30_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
watch(windowMinutes, loadAll)
</script>

<style scoped>
.scraper-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1400px;
}
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-head h1 { font-size: 24px; font-weight: 700; margin: 0; color: var(--color-text-primary); }
.subtitle { margin: 4px 0 0; color: var(--color-text-secondary); font-size: 14px; }
.head-actions { display: flex; gap: 8px; }
.select, .btn-refresh {
  height: 36px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--color-border); background: var(--color-surface);
  color: var(--color-text-primary); font-size: 13px; cursor: pointer;
}
.btn-refresh { background: var(--color-accent); color: var(--color-on-accent, #fff); border-color: transparent; }
.btn-refresh:disabled { opacity: 0.6; cursor: progress; }

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
.kpi {
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 4px;
}
.kpi-label { font-size: 12px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--color-text-primary); }
.kpi-hint  { font-size: 12px; color: var(--color-text-secondary); }
.kpi.success .kpi-value { color: var(--color-success, #16a34a); }
.kpi.warn    .kpi-value { color: var(--color-warning, #d97706); }
.kpi.danger  .kpi-value { color: var(--color-error,   #dc2626); }

.card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 12px; padding: 16px 18px;
}
.card h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; color: var(--color-text-primary); }
.table-wrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td { padding: 8px 10px; border-bottom: 1px solid var(--color-border); text-align: left; }
.table th { font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
.table td.num, .table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.table td.danger { color: var(--color-error, #dc2626); font-weight: 600; }
.table td.warn   { color: var(--color-warning, #d97706); font-weight: 600; }
.table .empty { text-align: center; color: var(--color-text-muted); padding: 18px; }

.pill {
  display: inline-block; padding: 2px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
}
.pill-ok     { background: rgba(22,163,74,0.12); color: #16a34a; }
.pill-warn   { background: rgba(217,119,6,0.12); color: #d97706; }
.pill-danger { background: rgba(220,38,38,0.12); color: #dc2626; }

.event-list { list-style: none; padding: 0; margin: 0; max-height: 360px; overflow-y: auto; }
.event-list li {
  display: grid; grid-template-columns: 160px 180px 180px 1fr; gap: 8px;
  padding: 6px 4px; font-size: 12px; border-bottom: 1px solid var(--color-border);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
}
.event-list li.empty { display: block; text-align: center; color: var(--color-text-muted); padding: 18px; }
.ev-ts     { color: var(--color-text-muted); }
.ev-kind   { color: var(--color-text-primary); font-weight: 600; }
.ev-domain { color: var(--color-text-secondary); }
.ev-data   { color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev-warn   .ev-kind { color: #d97706; }
.ev-danger .ev-kind { color: #dc2626; }

.queue-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.q-card {
  background: var(--color-glass-bg, rgba(0,0,0,0.02));
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 2px;
}
.q-label { font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.q-value { font-size: 18px; font-weight: 700; color: var(--color-text-primary); }
.q-card.success .q-value { color: var(--color-success, #16a34a); }
.q-card.warn    .q-value { color: var(--color-warning, #d97706); }
.q-card.danger  .q-value { color: var(--color-error, #dc2626); }
.subhead { font-size: 12px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 16px 0 8px; }
.url-cell a {
  color: var(--color-accent); text-decoration: none;
  display: inline-block; max-width: 380px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom;
}
.url-cell a:hover { text-decoration: underline; }
.table small { display: block; color: var(--color-text-muted); font-size: 11px; margin-top: 2px; }

.error-msg {
  color: var(--color-error, #dc2626);
  background: rgba(220,38,38,0.08);
  border: 1px solid rgba(220,38,38,0.25);
  padding: 10px 14px; border-radius: 8px;
  font-size: 13px;
}
</style>

<template>
  <div class="drilldown-page">
    <div class="page-controls">
      <div class="page-controls__filters">
        <router-link to="/admin/scraper" class="back-link">
          ← Voltar
        </router-link>
        <label class="filter-group">
          <span>Período</span>
          <select v-model.number="windowMinutes" class="select" aria-label="Janela de tempo">
            <option :value="60">Última hora</option>
            <option :value="360">Últimas 6 horas</option>
            <option :value="1440">Últimas 24 horas</option>
            <option :value="10080">Últimos 7 dias</option>
          </select>
        </label>
        <label class="filter-group">
          <span>Bucket (linha do tempo)</span>
          <select v-model.number="bucketMinutes" class="select" aria-label="Bucket de agregação">
            <option :value="5">5 min</option>
            <option :value="15">15 min</option>
            <option :value="60">1 hora</option>
          </select>
        </label>
      </div>
      <button class="btn-refresh" @click="loadAll" :disabled="loading">
        {{ loading ? 'Atualizando…' : 'Atualizar agora' }}
      </button>
    </div>

    <h1 class="drilldown-title">
      {{ engineLabel }} <span class="muted">/ drill-down</span>
    </h1>
    <p class="drilldown-sub">
      Domínios cobertos:
      <span v-for="d in engineDomains" :key="d" class="chip">{{ d }}</span>
      <span v-if="!engineDomains.length" class="muted">nenhum domínio mapeado</span>
    </p>

    <!-- Latência ao longo do tempo -->
    <section class="card">
      <h2>Latência ao longo do tempo</h2>
      <p class="card-help">
        Mediana (p50) e pior caso (p95) do tempo de resposta, agregados em buckets de
        {{ bucketMinutes }} min. Picos no p95 sem reflexo no p50 indicam timeouts isolados.
      </p>
      <Sparkline
        :series="latencySeries"
        unit="ms"
        :height="120"
      />
      <div v-if="!latencySeries.p50.length && !latencySeries.p95.length" class="empty">
        Sem dados de latência no período.
      </div>
    </section>

    <!-- Acessos e taxa de erro ao longo do tempo -->
    <section class="card">
      <h2>Acessos e erros ao longo do tempo</h2>
      <p class="card-help">
        Total de acessos vs. erros (429 + 5xx) por bucket. Verifique se um pico de erros
        coincidiu com circuit aberto.
      </p>
      <Sparkline
        :series="trafficSeries"
        unit=""
        :height="120"
      />
      <div v-if="!trafficSeries.req.length" class="empty">
        Sem dados de acesso no período.
      </div>
    </section>

    <!-- Breakdown DLQ -->
    <section class="card">
      <h2>Breakdown da DLQ por tipo de erro</h2>
      <p class="card-help">
        Tipos de erro mais frequentes nas vagas que falharam 3 vezes seguidas (últimos 7 dias).
      </p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Tipo de erro</th>
              <th class="num">Ocorrências</th>
              <th>Última vez</th>
              <th>Exemplo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in dlqBreakdown" :key="row.last_error_type">
              <td>
                <span class="pill pill-danger">{{ friendlyError(row.last_error_type) }}</span>
                <small class="raw-type">{{ row.last_error_type }}</small>
              </td>
              <td class="num">{{ formatInt(row.total) }}</td>
              <td>{{ formatTimestamp(row.last_seen) }}</td>
              <td class="url-cell">
                <a v-if="row.sample_url" :href="row.sample_url" target="_blank" rel="noopener" :title="row.sample_url">
                  abrir exemplo
                </a>
              </td>
            </tr>
            <tr v-if="!dlqBreakdown.length">
              <td colspan="4" class="empty success-msg">Nenhuma vaga na DLQ - tudo limpo.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Histórico de circuit breaker -->
    <section class="card">
      <h2>Histórico de proteção (circuit breaker)</h2>
      <p class="card-help">
        Quando o sistema abriu, fechou ou testou volta para os domínios desta engine.
      </p>
      <ul class="event-list">
        <li v-for="(ev, i) in circuitHistory" :key="i" :class="circuitEventClass(ev.kind)">
          <span class="ev-ts">{{ formatTimestamp(ev.ts) }}</span>
          <span class="ev-kind">{{ circuitEventLabel(ev.kind) }}</span>
          <span class="ev-domain">{{ ev.domain || '-' }}</span>
          <span class="ev-data" v-if="ev.data">{{ formatEventData(ev.data) }}</span>
        </li>
        <li v-if="!circuitHistory.length" class="empty">
          Nenhuma transição de proteção no período - circuito estável.
        </li>
      </ul>
    </section>

    <!-- Timeline de eventos -->
    <section class="card">
      <h2>Timeline de eventos</h2>
      <p class="card-help">
        Eventos discretos da engine (engine.start, engine.error, parser.error, listing.aborted, etc.).
      </p>
      <ul class="event-list">
        <li v-for="(ev, i) in events" :key="i" :class="eventClass(ev.kind)">
          <span class="ev-ts">{{ formatTimestamp(ev.ts) }}</span>
          <span class="ev-kind">{{ friendlyEvent(ev.kind) }}</span>
          <span class="ev-domain">{{ ev.domain || '-' }}</span>
          <span class="ev-data" v-if="ev.data">{{ formatEventData(ev.data) }}</span>
        </li>
        <li v-if="!events.length" class="empty">Sem eventos no período.</li>
      </ul>
    </section>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/integrations/supabase/client'

const Sparkline = defineAsyncComponent(() => import('@/components/EngineSparkline.vue'))

const route = useRoute()
const engine = computed(() => String(route.params.engine || ''))

const ENGINE_LABELS = {
  linkedin: 'LinkedIn', indeed: 'Indeed', gupy: 'Gupy', jooble: 'Jooble',
  catho: 'Catho', careerjet: 'Careerjet', geekhunter: 'GeekHunter',
  michaelpage: 'Michael Page', programathor: 'ProgramaThor', remoteok: 'RemoteOK',
  remotive: 'Remotive', weworkremotely: 'WeWorkRemotely', ziprecruiter: 'ZipRecruiter',
  simplyhired: 'SimplyHired', bne: 'BNE', dice: 'Dice', infojobs: 'InfoJobs',
}
const ENGINE_DOMAINS = {
  linkedin: ['br.linkedin.com', 'linkedin.com'],
  indeed: ['br.indeed.com', 'indeed.com', 'indeed.com.br'],
  gupy: ['portal.api.gupy.io', 'gupy.io'],
  jooble: ['br.jooble.org', 'jooble.org'],
  catho: ['catho.com.br', 'www.catho.com.br'],
  careerjet: ['careerjet.com.br', 'www.careerjet.com.br'],
  geekhunter: ['geekhunter.com.br', 'www.geekhunter.com.br'],
  michaelpage: ['michaelpage.com.br', 'www.michaelpage.com.br'],
  programathor: ['programathor.com.br'],
  remoteok: ['remoteok.com'],
  remotive: ['remotive.com'],
  weworkremotely: ['weworkremotely.com'],
  ziprecruiter: ['ziprecruiter.co.uk', 'ziprecruiter.com'],
  simplyhired: ['simplyhired.com.br'],
  bne: ['bne.com.br', 'www.bne.com.br'],
  dice: ['dice.com', 'www.dice.com'],
  infojobs: ['infojobs.com.br', 'www.infojobs.com.br'],
}
const ERROR_LABELS = {
  TimeoutError: 'Site demorou demais para responder',
  TimeoutException: 'Site demorou demais para responder',
  ConnectError: 'Não conseguimos conectar ao site',
  ConnectionError: 'Não conseguimos conectar ao site',
  ReadError: 'Conexão caiu enquanto líamos a resposta',
  ReadTimeout: 'Conexão caiu enquanto líamos a resposta',
  JSONDecodeError: 'Site enviou resposta com formato inválido',
  KeyError: 'Site mudou a estrutura - campo esperado não existe mais',
  ParserError: 'Não conseguimos entender o conteúdo da página',
  refetch_empty: 'Reprocessamento não trouxe dados novos',
  persist_skipped: 'Vaga foi descartada antes de salvar',
  unknown: 'Erro não classificado',
}
const EVENT_LABELS = {
  'circuit.open': '🛡️ Site colocado em pausa',
  'circuit.closed': '✓ Site voltou ao normal',
  'circuit.half_open': '🔄 Testando se site voltou',
  'engine.start': '▶️ Coleta iniciada',
  'engine.finish': '✓ Coleta concluída',
  'engine.error': '⚠️ Erro durante coleta',
  'batch.start': '▶️ Novo lote iniciado',
  'batch.error': '⚠️ Erro no lote',
  'parser.error': '⚠️ Erro ao ler vaga',
  'listing.aborted': '⛔ Listagem interrompida',
  'reenrich.start': '🔄 Reprocessando vagas antigas',
}

const engineLabel = computed(() => ENGINE_LABELS[engine.value] || engine.value || '(engine?)')
const engineDomains = computed(() => ENGINE_DOMAINS[engine.value] || [])

const windowMinutes = ref(360)
const bucketMinutes = ref(15)
const loading = ref(false)
const errorMsg = ref('')

const events = ref([])
const timeseries = ref([])
const dlqBreakdown = ref([])
const circuitHistory = ref([])

// Empacota timeseries para o sparkline
const latencySeries = computed(() => {
  const p50 = []
  const p95 = []
  for (const row of timeseries.value) {
    if (row.metric_key === 'latency.p50_ms') p50.push({ x: row.bucket_ts, y: Number(row.value) || 0 })
    if (row.metric_key === 'latency.p95_ms') p95.push({ x: row.bucket_ts, y: Number(row.value) || 0 })
  }
  return { p50, p95 }
})
const trafficSeries = computed(() => {
  const reqMap = new Map()
  const errMap = new Map()
  for (const row of timeseries.value) {
    const ts = row.bucket_ts
    if (row.metric_key === 'req.total') {
      reqMap.set(ts, (reqMap.get(ts) || 0) + Number(row.value || 0))
    } else if (row.metric_key === 'status.429' || row.metric_key === 'status.5xx') {
      errMap.set(ts, (errMap.get(ts) || 0) + Number(row.value || 0))
    }
  }
  const req = [...reqMap.entries()].map(([x, y]) => ({ x, y })).sort((a, b) => new Date(a.x) - new Date(b.x))
  const err = [...errMap.entries()].map(([x, y]) => ({ x, y })).sort((a, b) => new Date(a.x) - new Date(b.x))
  return { req, err }
})

async function loadAll () {
  if (!engine.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const domains = engineDomains.value
    const [ev, ts, dlq, ch] = await Promise.all([
      supabase.rpc('get_engine_events', {
        p_domains: domains, p_window_minutes: windowMinutes.value, p_max_rows: 200,
      }),
      supabase.rpc('get_engine_timeseries', {
        p_domains: domains, p_window_minutes: windowMinutes.value, p_bucket_minutes: bucketMinutes.value,
      }),
      supabase.rpc('get_engine_dlq_breakdown', {
        p_engine: engine.value, p_window_minutes: 10080,
      }),
      supabase.rpc('get_engine_circuit_history', {
        p_domains: domains, p_window_minutes: windowMinutes.value, p_max_rows: 100,
      }),
    ])
    for (const r of [ev, ts, dlq, ch]) if (r.error) throw r.error
    events.value = ev.data || []
    timeseries.value = ts.data || []
    dlqBreakdown.value = dlq.data || []
    circuitHistory.value = ch.data || []
  } catch (err) {
    errorMsg.value = err.message || 'Falha ao carregar drill-down.'
  } finally {
    loading.value = false
  }
}

function friendlyError (e) { return ERROR_LABELS[e] || (e || 'Erro não identificado') }
function friendlyEvent (k) { return EVENT_LABELS[k] || k }
function circuitEventLabel (k) {
  if (k === 'circuit.open') return '🛡️ Aberto (em proteção)'
  if (k === 'circuit.closed') return '✓ Fechado (normal)'
  if (k === 'circuit.half_open') return '🔄 Meio-aberto (testando)'
  return k
}
function circuitEventClass (k) {
  if (k === 'circuit.open') return 'ev-danger'
  if (k === 'circuit.half_open') return 'ev-warn'
  return ''
}
function eventClass (k) {
  if (!k) return ''
  if (k.includes('error') || k === 'circuit.open') return 'ev-danger'
  if (k.includes('aborted') || k === 'circuit.half_open' || k.includes('429')) return 'ev-warn'
  return ''
}
function formatEventData (data) {
  if (!data) return ''
  if (typeof data !== 'object') return String(data)
  return Object.entries(data).map(([k, v]) => `${k}: ${v}`).join(', ')
}
function formatInt (n) { return n == null ? '-' : Number(n).toLocaleString('pt-BR') }
function formatTimestamp (ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('pt-BR', { hour12: false })
}

let timer = null
onMounted(() => {
  loadAll()
  timer = setInterval(loadAll, 30_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
watch([engine, windowMinutes, bucketMinutes], loadAll)
</script>

<style scoped>
.drilldown-page { display: flex; flex-direction: column; gap: 20px; }

.page-controls {
  display: flex; align-items: end; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.page-controls__filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; }
.back-link {
  align-self: end; height: 36px; display: inline-flex; align-items: center;
  padding: 0 14px; border-radius: 8px;
  border: 1px solid var(--color-border); background: var(--color-surface);
  color: var(--color-text-primary); text-decoration: none; font-size: 13px; font-weight: 600;
}
.back-link:hover { background: var(--color-glass-bg, rgba(0,0,0,0.03)); }
.filter-group {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 11px; color: var(--color-text-muted);
  text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
}
.select, .btn-refresh {
  height: 36px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--color-border); background: var(--color-surface);
  color: var(--color-text-primary); font-size: 13px; cursor: pointer;
  font-family: inherit; min-width: 180px;
}
.btn-refresh {
  background: var(--color-accent); color: var(--color-text-inverse, #fff);
  border-color: transparent; min-width: 140px;
}
.btn-refresh:disabled { opacity: 0.6; cursor: progress; }

.drilldown-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--color-text-primary); }
.drilldown-title .muted { color: var(--color-text-muted); font-weight: 400; font-size: 16px; }
.drilldown-sub { margin: -10px 0 0; font-size: 13px; color: var(--color-text-secondary); }
.drilldown-sub .muted { color: var(--color-text-muted); }
.chip {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  background: var(--color-glass-bg, rgba(0,0,0,0.03));
  border: 1px solid var(--color-border);
  font-size: 11px; color: var(--color-text-secondary); margin-left: 4px;
}

.card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 12px; padding: 16px 18px;
}
.card h2 { margin: 0 0 6px; font-size: 15px; font-weight: 600; color: var(--color-text-primary); }
.card-help { margin: 0 0 12px; font-size: 12px; color: var(--color-text-secondary); line-height: 1.5; }
.empty { color: var(--color-text-muted); font-size: 13px; padding: 12px 0; text-align: center; }
.success-msg { color: #16a34a !important; font-weight: 500; }
.table-wrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td { padding: 8px 10px; border-bottom: 1px solid var(--color-border); text-align: left; }
.table th { font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
.table td.num, .table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.raw-type { display: block; font-size: 10px; color: var(--color-text-muted); margin-top: 2px; }
.url-cell a { color: var(--color-accent); text-decoration: none; }
.url-cell a:hover { text-decoration: underline; }

.pill {
  display: inline-block; padding: 2px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
}
.pill-danger { background: rgba(220,38,38,0.12); color: #dc2626; }

.event-list { list-style: none; padding: 0; margin: 0; max-height: 360px; overflow-y: auto; }
.event-list li {
  display: grid; grid-template-columns: 160px 220px 180px 1fr; gap: 8px;
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

.error-msg {
  color: var(--color-error, #dc2626);
  background: rgba(220,38,38,0.08);
  border: 1px solid rgba(220,38,38,0.25);
  padding: 10px 14px; border-radius: 8px;
  font-size: 13px;
}
</style>

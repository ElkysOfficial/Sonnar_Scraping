<template>
  <div class="scraper-page">
    <TopProgressBar :active="refreshing" />

    <AdminPageSkeleton
      v-if="initialLoading"
      variant="dashboard"
      :show-header="false"
      :kpi-count="4"
      :rows="6"
      :columns="5"
    />

    <template v-else>
    <!-- Controles (título e subtítulo vêm da topbar) -->
    <div class="page-controls">
      <div class="page-controls__filters">
        <label class="filter-group">
          <span>Período</span>
          <select v-model.number="windowMinutes" class="form-select form-select--sm" aria-label="Janela de tempo">
            <option :value="15">Últimos 15 minutos</option>
            <option :value="60">Última hora</option>
            <option :value="360">Últimas 6 horas</option>
            <option :value="1440">Últimas 24 horas</option>
          </select>
        </label>
        <label class="filter-group">
          <span>Site</span>
          <select v-model="selectedEngine" class="form-select form-select--sm" aria-label="Filtrar por site">
            <option value="">Todos os sites</option>
            <option v-for="opt in engineOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
      </div>
      <button class="btn btn-secondary btn-sm" @click="loadAll" :disabled="loading">
        {{ loading ? 'Atualizando…' : 'Atualizar agora' }}
      </button>
    </div>

    <!-- Indicador de filtro ativo -->
    <div v-if="selectedEngine" class="filter-pill">
      <span>
        Mostrando apenas: <strong>{{ friendlyEngine(selectedEngine) }}</strong>
      </span>
      <span class="filter-pill__actions">
        <router-link
          :to="`/admin/scraper/engine/${selectedEngine}`"
          class="filter-clear"
        >
          Ver drill-down detalhado →
        </router-link>
        <button class="filter-clear" @click="selectedEngine = ''" type="button">
          Limpar filtro ✕
        </button>
      </span>
    </div>

    <!-- Tab strip - separa a página em 5 abas para reduzir scroll -->
    <nav class="tab-strip" role="tablist" aria-label="Abas da página de coleta">
      <button
        v-for="t in tabs"
        :key="t.id"
        role="tab"
        :aria-selected="activeTab === t.id"
        type="button"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === t.id }"
        @click="activeTab = t.id"
      >
        <span class="tab-btn__label">{{ t.label }}</span>
        <span v-if="t.badge != null" class="tab-btn__badge" :class="t.badgeClass">{{ t.badge }}</span>
      </button>
    </nav>

    <!-- =========== Aba: Visão geral =========== -->
    <template v-if="activeTab === 'overview'">
<!-- Hero de saúde (Apple-style com gauge + área chart) -->
    <HealthHero
      :tone="health.healthClass"
      :headline="health.headline"
      :subline="health.subline"
      :success-rate="successRatePct"
      :total-requests="health.total_requests || 0"
      :total-ok="totalsByStatus.ok"
      :total429="health.total_429 || 0"
      :total4xx="totalsByStatus.x4"
      :total5xx="health.total_5xx || 0"
      :traffic-series="trafficSeries"
    />

    <!-- KPIs principais com sparklines -->
    <section class="kpi-grid">
      <MetricCard
        label="Acessos aos sites"
        :value="health.total_requests || 0"
        :hint="(health.error_rate_pct || 0) + '% deram erro'"
        :series="kpiSeries.requests"
        :tone="health.error_rate > 0.15 ? 'danger' : (health.error_rate > 0.05 ? 'warn' : 'neutral')"
        :trend="kpiTrends.requests"
      />
      <MetricCard
        label="Vagas salvas"
        :value="health.jobs_persisted_ok || 0"
        :hint="(health.jobs_persisted_error || 0) > 0 ? formatInt(health.jobs_persisted_error) + ' falharam' : 'nenhuma falha ao salvar'"
        :series="kpiSeries.persisted"
        tone="success"
        :trend="kpiTrends.persisted"
      />
      <MetricCard
        label="Avisos de excesso"
        :value="health.total_429 || 0"
        hint="o site pediu pra ir mais devagar"
        :series="kpiSeries.rate429"
        :tone="(health.total_429 || 0) > 0 ? 'warn' : 'neutral'"
      />
      <MetricCard
        label="Erros do site"
        :value="health.total_5xx || 0"
        hint="o site falhou em responder"
        :series="kpiSeries.error5xx"
        :tone="(health.total_5xx || 0) > 0 ? 'warn' : 'neutral'"
      />
      <MetricCard
        label="Sites em pausa"
        :value="health.open_circuits || 0"
        hint="descansando para não ser bloqueado"
        :tone="(health.open_circuits || 0) > 0 ? 'danger' : 'neutral'"
        :alert="(health.open_circuits || 0) > 0"
        clickable
        @click="activeTab = 'protection'"
      />
      <MetricCard
        label="Tentativas extras"
        :value="health.total_retries || 0"
        hint="requests refeitas após erro temporário"
        :series="kpiSeries.retries"
        tone="neutral"
      />
    </section>

    <!-- Resumo por site -->
    <section class="card">
      <h2>Por site</h2>
      <p class="card-help">
        Quanto cada site está sendo acessado, com que rapidez responde e se algo está dando errado.
      </p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Site</th>
              <th class="num">
                <span class="th-with-help">
                  Acessos
                  <HelpTooltip text="Quantas páginas pedimos a esse site na janela escolhida. Cada página é uma requisição." />
                </span>
              </th>
              <th class="num">
                <span class="th-with-help">
                  Sucesso
                  <HelpTooltip text="Quantas dessas páginas o site respondeu sem erro (status 200/201/204 - chamado 2xx). Quanto mais perto do total de Acessos, melhor." />
                </span>
              </th>
              <th class="num">
                <span class="th-with-help">
                  Excesso
                  <HelpTooltip text="O site avisou que estamos pedindo rápido demais (HTTP 429). Quando isso acontece, automaticamente diminuímos o ritmo para não sermos bloqueados." />
                </span>
              </th>
              <th class="num">
                <span class="th-with-help">
                  Erros do site
                  <HelpTooltip text="O servidor do próprio site falhou (HTTP 500/502/503/504). Geralmente é problema temporário do lado deles, não nosso." />
                </span>
              </th>
              <th class="num">
                <span class="th-with-help">
                  Refeitas
                  <HelpTooltip text="Requisições que precisaram ser tentadas de novo por causa de erro passageiro (timeout, 5xx ou 429). É normal ter algumas; só vira problema se cresce muito." />
                </span>
              </th>
              <th class="num">
                <span class="th-with-help">
                  Tempo médio
                  <HelpTooltip text="Tempo típico que o site leva para responder (mediana). Metade das páginas chega antes desse tempo, metade depois. Em milissegundos." />
                </span>
              </th>
              <th class="num">
                <span class="th-with-help">
                  Tempo pior caso
                  <HelpTooltip text="P95 - 95% das requisições respondem em até esse tempo; só as 5% mais lentas demoram mais. Em milissegundos. Útil para detectar lentidões." />
                </span>
              </th>
              <th class="num">
                <span class="th-with-help">
                  Ritmo atual
                  <HelpTooltip text="Quantas requisições por segundo estamos enviando para esse site agora. Cai automaticamente quando aparecem avisos de excesso." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in summaryFiltered"
              :key="row.domain"
              class="row-clickable"
              :class="{ 'row-active': selectedEngine && domainBelongsToEngine(row.domain, selectedEngine) }"
              @click="selectEngineByDomain(row.domain)"
              :title="'Clique para ver só este site'"
            >
              <td>{{ friendlyDomain(row.domain) }}</td>
              <td class="num">{{ formatInt(row.req_total) }}</td>
              <td class="num">{{ formatInt(row.status_2xx) }}</td>
              <td class="num" :class="{ danger: row.status_429 > 0 }">{{ formatInt(row.status_429) }}</td>
              <td class="num" :class="{ warn: row.status_5xx > 0 }">{{ formatInt(row.status_5xx) }}</td>
              <td class="num">{{ formatInt(row.retries) }}</td>
              <td class="num">{{ formatMs(row.latency_p50) }}</td>
              <td class="num">{{ formatMs(row.latency_p95) }}</td>
              <td class="num">{{ formatRate(row.effective_rate) }}</td>
            </tr>
            <tr v-if="!summaryFiltered.length">
              <td colspan="9" class="empty">Sem dados no período selecionado.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
</template>

    <!-- =========== Aba: Proteção =========== -->
    <template v-if="activeTab === 'protection'">
<TabChartCard
      eyebrow="Proteção"
      title="Erros vs sucessos por site (últimos 5 minutos)"
      tone="info"
      :option="protectionChartOption"
      :has-data="protectionHasData"
      empty-label="Nenhum site monitorado ainda - comece o scraper para ver dados aqui."
    />

    <!-- Estado de proteção dos sites -->
    <section class="card">
      <h2>Proteção contra bloqueio</h2>
      <p class="card-help">
        Quando um site começa a errar muito, pausamos automaticamente por um tempo para não sermos
        banidos. Esta tabela mostra o estado atual de cada site.
      </p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Site</th>
              <th>Situação</th>
              <th class="num">Erros (5 min)</th>
              <th class="num">Sucessos (5 min)</th>
              <th class="num">% de erro</th>
              <th class="num">Volta em</th>
              <th>Atualizado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in circuitsFiltered" :key="row.domain">
              <td>{{ friendlyDomain(row.domain) }}</td>
              <td>
                <span class="pill" :class="circuitClass(row.state)">{{ circuitLabel(row.state) }}</span>
              </td>
              <td class="num">{{ row.failures_5m }}</td>
              <td class="num">{{ row.successes_5m }}</td>
              <td class="num">{{ formatPct(row.error_rate) }}</td>
              <td class="num">{{ formatSeconds(row.open_until_s) }}</td>
              <td>{{ formatTimestamp(row.updated_at) }}</td>
            </tr>
            <tr v-if="!circuitsFiltered.length">
              <td colspan="7" class="empty">Nenhum site monitorado ainda - comece o scraper para ver dados aqui.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
</template>

    <!-- =========== Aba: Fila =========== -->
    <template v-if="activeTab === 'queue'">
<TabChartCard
      eyebrow="Fila"
      title="Distribuição das vagas por etapa"
      tone="info"
      :option="queueChartOption"
      :has-data="queueHasData"
      empty-label="Nenhuma vaga em processamento ainda."
    />

    <!-- Fila de vagas -->
    <section class="card">
      <h2>Vagas em processamento</h2>
      <p class="card-help">
        Cada vaga descoberta passa por etapas até ser salva. Veja onde elas estão agora.
      </p>
      <div class="queue-grid">
        <div class="q-card" :title="queueHelp.discovered">
          <span class="q-label">Aguardando coleta</span>
          <span class="q-value">{{ formatInt(queueAggregated.discovered) }}</span>
        </div>
        <div class="q-card" :title="queueHelp.running">
          <span class="q-label">Coletando agora</span>
          <span class="q-value">{{ formatInt(queueAggregated.running) }}</span>
        </div>
        <div class="q-card warn" :title="queueHelp.partial">
          <span class="q-label">Coletadas parcialmente</span>
          <span class="q-value">{{ formatInt(queueAggregated.partial) }}</span>
        </div>
        <div class="q-card success" :title="queueHelp.completed">
          <span class="q-label">Concluídas com sucesso</span>
          <span class="q-value">{{ formatInt(queueAggregated.completed) }}</span>
        </div>
        <div class="q-card warn" :title="queueHelp.failed">
          <span class="q-label">Falharam (vão tentar de novo)</span>
          <span class="q-value">{{ formatInt(queueAggregated.failed) }}</span>
        </div>
        <div class="q-card warn" :title="queueHelp.blocked">
          <span class="q-label">Esperando site liberar</span>
          <span class="q-value">{{ formatInt(queueAggregated.blocked) }}</span>
        </div>
        <div class="q-card danger" :title="queueHelp.dlq">
          <span class="q-label">Sem solução automática</span>
          <span class="q-value">{{ formatInt(queueAggregated.dlq_total) }}</span>
        </div>
      </div>

      <h3 class="subhead">Detalhamento por site</h3>
      <div v-if="selectedEngine" class="action-toolbar">
        <span class="action-toolbar__hint">
          Filtrando por <strong>{{ friendlyEngine(selectedEngine) }}</strong>.
          Reprocessar marca todas as URLs desta engine como "aguardando coleta" - útil quando o leitor (parser) foi atualizado.
        </span>
        <button
          class="btn btn-primary btn-sm"
          :disabled="actionBusy"
          @click="onReenrichEngine(selectedEngine)"
        >
          {{ actionBusy ? 'Processando…' : 'Reprocessar todas as URLs desta engine' }}
        </button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Site</th><th>Etapa</th><th class="num">Quantidade</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in queueStatsFiltered" :key="i">
              <td>{{ friendlyEngine(row.engine) }}</td>
              <td><span class="pill" :class="stateClass(row.state)">{{ stateLabel(row.state) }}</span></td>
              <td class="num">{{ formatInt(row.total) }}</td>
            </tr>
            <tr v-if="!queueStatsFiltered.length"><td colspan="3" class="empty">Nenhuma vaga em processamento ainda.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
</template>

    <!-- =========== Aba: DLQ & Operações =========== -->
    <template v-if="activeTab === 'dlq'">
<TabChartCard
      eyebrow="DLQ"
      title="Falhas por tipo de erro"
      tone="danger"
      :option="dlqChartOption"
      :has-data="dlqHasData"
      empty-label="Nenhuma vaga problemática no período - tudo limpo!"
    />

    <!-- Vagas que precisam de análise manual (DLQ) -->
    <section class="card">
      <h2>Vagas que precisam de análise manual</h2>
      <p class="card-help">
        Vagas que falharam 3 vezes seguidas e foram colocadas de lado para você olhar.
        Geralmente indica que o site mudou o layout ou a vaga foi removida.
      </p>

      <div class="action-toolbar action-toolbar--bulk">
        <span class="action-toolbar__title">Limpar DLQ por filtro</span>
        <label class="filter-group filter-group--inline">
          <span>Site</span>
          <select v-model="bulkClearEngine" class="form-input form-input--sm select-sm">
            <option value="">Qualquer site</option>
            <option v-for="opt in engineOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label class="filter-group filter-group--inline">
          <span>Tipo de erro</span>
          <select v-model="bulkClearErrorType" class="form-input form-input--sm select-sm">
            <option value="">Qualquer erro</option>
            <option v-for="t in dlqErrorTypeOptions" :key="t" :value="t">
              {{ friendlyError(t) }}
            </option>
          </select>
        </label>
        <button
          class="btn btn-danger btn-sm"
          :disabled="actionBusy"
          @click="onClearDlq"
        >
          {{ actionBusy ? 'Limpando…' : 'Limpar DLQ' }}
        </button>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Quando falhou</th>
              <th>Site</th>
              <th>Link da vaga</th>
              <th class="num">Tentativas</th>
              <th>O que aconteceu</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in dlqFiltered" :key="i">
              <td>{{ formatTimestamp(row.failed_at) }}</td>
              <td>{{ friendlyEngine(row.engine) }}</td>
              <td class="url-cell">
                <a :href="row.job_url" target="_blank" rel="noopener" :title="row.job_url">
                  {{ row.job_url }}
                </a>
              </td>
              <td class="num">{{ row.attempts }}</td>
              <td>
                <span class="pill pill-danger">{{ friendlyError(row.last_error_type) }}</span>
                <small v-if="row.last_error_msg">{{ row.last_error_msg }}</small>
              </td>
              <td class="action-cell">
                <button
                  class="btn btn-primary btn-sm btn-xs"
                  :disabled="actionBusy"
                  title="Recoloca a URL na fila de coleta com 0 tentativas"
                  @click="onRetryDlq(row.job_url)"
                >
                  Tentar de novo
                </button>
                <button
                  class="btn btn-ghost btn-sm btn-xs"
                  :disabled="actionBusy"
                  title="Apaga esta entrada da DLQ permanentemente"
                  @click="onDeleteDlq(row.job_url)"
                >
                  Remover
                </button>
              </td>
            </tr>
            <tr v-if="!dlqFiltered.length">
              <td colspan="6" class="empty success-msg">
                Nenhuma vaga problemática no período - tudo limpo!
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
</template>

    <!-- =========== Aba: Manutenção =========== -->
    <template v-if="activeTab === 'maintenance'">
<TabChartCard
      eyebrow="Manutenção"
      title="Vagas por idade (dias até purga)"
      tone="warn"
      :option="maintenanceChartOption"
      :has-data="maintenanceHasData"
      empty-label="Nenhuma vaga na faixa de idade selecionada."
    />

    <!-- Vagas próximas dos 90 dias -->
    <section class="card">
      <h2>Vagas próximas dos 90 dias</h2>
      <p class="card-help">
        A partir dos 90 dias as vagas saem do JSON dos bots de mensagem (mas continuam no banco
        para histórico). Aqui aparecem as que estão entre {{ nearPurgeMinDays }} e {{ nearPurgeMaxDays }} dias -
        revise se alguma ainda merece estar ativa.
      </p>
      <div class="action-toolbar action-toolbar--bulk">
        <label class="filter-group filter-group--inline">
          <span>Idade mínima (dias)</span>
          <input v-model.number="nearPurgeMinDays" type="number" min="0" max="365" class="form-input form-input--sm select-sm" />
        </label>
        <label class="filter-group filter-group--inline">
          <span>Idade máxima (dias)</span>
          <input v-model.number="nearPurgeMaxDays" type="number" min="0" max="365" class="form-input form-input--sm select-sm" />
        </label>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="nearPurgeLoading"
          @click="loadNearPurge"
        >
          {{ nearPurgeLoading ? 'Atualizando…' : 'Atualizar lista' }}
        </button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Idade</th>
              <th>Publicada em</th>
              <th>Site</th>
              <th>Título</th>
              <th>Local</th>
              <th>Regime</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in nearPurgeJobs" :key="row.id">
              <td><span class="pill" :class="row.age_days >= 88 ? 'pill-danger' : 'pill-warn'">{{ row.age_days }}d</span></td>
              <td>{{ formatDateOnly(row.publication_date) }}</td>
              <td>{{ friendlyEngine(row.source) }}</td>
              <td>{{ row.job_title }}</td>
              <td>{{ row.location_raw || row.state_code || row.country_code || '-' }}</td>
              <td>{{ row.hiring_regime || '-' }}</td>
              <td class="url-cell">
                <a :href="row.job_url" target="_blank" rel="noopener" :title="row.job_url">abrir</a>
              </td>
            </tr>
            <tr v-if="!nearPurgeJobs.length">
              <td colspan="7" class="empty">Nenhuma vaga na faixa selecionada.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Histórico de eventos -->
    <section class="card">
      <h2>Histórico recente</h2>
      <p class="card-help">
        Eventos importantes que aconteceram, em ordem do mais recente para o mais antigo.
      </p>
      <ul class="event-list">
        <li v-for="(ev, idx) in eventsFiltered" :key="idx" :class="eventClass(ev.kind)">
          <span class="ev-ts">{{ formatTimestamp(ev.ts) }}</span>
          <span class="ev-kind">{{ friendlyEvent(ev.kind) }}</span>
          <span class="ev-domain">{{ ev.domain ? friendlyDomain(ev.domain) : '-' }}</span>
          <span class="ev-data" v-if="ev.data">{{ formatEventData(ev.data) }}</span>
        </li>
        <li v-if="!eventsFiltered.length" class="empty">Nenhum evento no período selecionado.</li>
      </ul>
    </section>
</template>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    </template><!-- /v-else (initialLoading) -->
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/integrations/supabase/client'
import HealthHero from '@/components/scraper/HealthHero.vue'
import MetricCard from '@/components/scraper/MetricCard.vue'
import TabChartCard from '@/components/scraper/TabChartCard.vue'
import HelpTooltip from '@/components/common/HelpTooltip.vue'
import AdminPageSkeleton from '@/components/admin/AdminPageSkeleton.vue'
import TopProgressBar from '@/components/admin/TopProgressBar.vue'

const route = useRoute()
const router = useRouter()

const VALID_TABS = ['overview', 'protection', 'queue', 'dlq', 'maintenance']
const activeTab = ref(VALID_TABS.includes(route.query.tab) ? route.query.tab : 'overview')

// Mantém ?tab=xxx em sincronia com a aba ativa (sem empilhar histórico)
watch(activeTab, (newTab) => {
  if (route.query.tab !== newTab) {
    router.replace({ query: { ...route.query, tab: newTab } })
  }
})
// Permite voltar/avançar pelo histórico do browser
watch(() => route.query.tab, (newTab) => {
  if (newTab && VALID_TABS.includes(newTab) && newTab !== activeTab.value) {
    activeTab.value = newTab
  }
})

const windowMinutes = ref(60)
// `loading` (legado) é o flag genérico usado pelo botão "Atualizar agora".
// `initialLoading` controla o skeleton no boot inicial; `refreshing` aciona
// a barra fina de progresso no topo durante recargas.
const loading = ref(false)
const initialLoading = ref(true)
const refreshing = ref(false)
const errorMsg = ref('')

const summary = ref([])
const circuits = ref([])
const events = ref([])
const healthRow = ref(null)
const queue = ref({})
const queueStats = ref([])
const dlq = ref([])
const selectedEngine = ref('')   // '' = todos

// Painel de controle (Fase 3)
const actionBusy = ref(false)
const bulkClearEngine = ref('')
const bulkClearErrorType = ref('')

// Vagas próximas dos 90 dias
const nearPurgeJobs = ref([])
const nearPurgeMinDays = ref(80)
const nearPurgeMaxDays = ref(90)
const nearPurgeLoading = ref(false)

// Série temporal (alimenta sparklines e área chart do hero)
const timeseries = ref([])  // [{bucket_ts, domain, metric_key, value}]

const health = computed(() => {
  const h = healthRow.value || {}
  const errPct = h.error_rate ? (h.error_rate * 100) : 0
  const openCircuits = h.open_circuits || 0
  const totalReq = h.total_requests || 0

  let healthClass = 'success'
  let healthIcon = '✓'
  let headline = 'Tudo funcionando bem'
  let subline = 'Coletas saindo dentro do esperado, nenhum site bloqueado.'

  if (totalReq === 0) {
    healthClass = 'idle'
    healthIcon = '○'
    headline = 'Coleta parada ou ainda sem dados no período'
    subline = 'Nenhum acesso registrado no período selecionado. Selecione uma janela maior ou verifique se o scraper está rodando.'
  } else if (errPct > 15 || openCircuits > 0) {
    healthClass = 'danger'
    healthIcon = '!'
    headline = openCircuits > 0
      ? `${openCircuits} site${openCircuits > 1 ? 's' : ''} em pausa de proteção`
      : 'Taxa de erro elevada'
    subline = openCircuits > 0
      ? 'Estamos descansando esses sites para não sermos banidos. Vão voltar automaticamente.'
      : `${errPct.toFixed(1)}% das chamadas estão falhando - investigue se algum site mudou.`
  } else if (errPct > 5) {
    healthClass = 'warn'
    healthIcon = '!'
    headline = 'Atenção: alguns erros acima do normal'
    subline = `${errPct.toFixed(1)}% das chamadas falharam. Não é crítico, mas vale acompanhar.`
  }

  return {
    ...h,
    error_rate_pct: errPct.toFixed(1),
    healthClass,
    healthIcon,
    headline,
    subline,
  }
})

// Tooltips para os KPIs (em linguagem humana, sem jargão técnico)
const kpiHelp = {
  requests: 'Quantas vezes pedimos uma página a algum site no período.',
  persisted: 'Vagas extraídas e gravadas no banco/JSON com sucesso.',
  rateLimit: 'Quando um site responde "está vindo rápido demais". O sistema reduz a velocidade automaticamente.',
  serverError: 'Erros do servidor do site (ex.: site fora do ar). Geralmente passageiro - refazemos a chamada.',
  circuits: 'Sites onde paramos temporariamente (15 min a 2 h) porque estavam dando erro demais. Volta sozinho.',
  retries: 'Requisições que precisaram ser refeitas após erro temporário (timeout ou erro do servidor).',
}

const queueHelp = {
  discovered: 'Vagas que descobrimos no listing mas ainda não buscamos os detalhes.',
  running: 'Vagas que estão sendo coletadas neste exato momento.',
  partial: 'Vagas salvas mas com dados incompletos (descrição vazia, por exemplo). Serão reprocessadas quando melhorarmos o leitor.',
  completed: 'Vagas extraídas e salvas com sucesso em todos os destinos.',
  failed: 'Vagas que falharam neste ciclo. Serão tentadas novamente no próximo.',
  blocked: 'Vagas em sites que estão em pausa de proteção. Voltam quando o site liberar.',
  dlq: 'Vagas que falharam 3 vezes seguidas. Precisam de análise manual - geralmente o site mudou o layout.',
}

// ---------- Mapas de tradução para linguagem humana ----------

const ENGINE_LABELS = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  gupy: 'Gupy',
  jooble: 'Jooble',
  catho: 'Catho',
  careerjet: 'Careerjet',
  geekhunter: 'GeekHunter',
  michaelpage: 'Michael Page',
  programathor: 'ProgramaThor',
  remoteok: 'RemoteOK',
  remotive: 'Remotive',
  weworkremotely: 'WeWorkRemotely',
  ziprecruiter: 'ZipRecruiter',
  simplyhired: 'SimplyHired',
  bne: 'BNE',
  dice: 'Dice',
  infojobs: 'InfoJobs',
}

const STATE_LABELS = {
  discovered: 'Aguardando coleta',
  running: 'Coletando agora',
  partial: 'Coletada parcialmente',
  completed: 'Concluída',
  failed: 'Falhou (vai tentar de novo)',
  blocked: 'Aguardando site liberar',
}

const CIRCUIT_LABELS = {
  closed: 'Funcionando normal',
  open: 'Em pausa de proteção',
  half_open: 'Testando volta',
}

const EVENT_LABELS = {
  'circuit.open': '🛡️ Site colocado em pausa de proteção',
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
}

// Mapa de engine -> domain(s) conhecido(s) para filtrar tabelas que vêm por domínio
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

function domainBelongsToEngine (domain, engine) {
  if (!engine) return true
  if (!domain) return false
  const list = ENGINE_DOMAINS[engine] || []
  return list.includes(domain) || domain.includes(engine)
}

const engineOptions = computed(() => {
  const fromQueue = (queueStats.value || []).map(r => r.engine)
  const fromDlq = (dlq.value || []).map(r => r.engine)
  const all = new Set([...Object.keys(ENGINE_LABELS), ...fromQueue, ...fromDlq])
  return [...all].sort().map(e => ({ value: e, label: ENGINE_LABELS[e] || e }))
})

// Listas filtradas por selectedEngine
const summaryFiltered = computed(() =>
  selectedEngine.value
    ? summary.value.filter(r => domainBelongsToEngine(r.domain, selectedEngine.value))
    : summary.value
)
const circuitsFiltered = computed(() =>
  selectedEngine.value
    ? circuits.value.filter(r => domainBelongsToEngine(r.domain, selectedEngine.value))
    : circuits.value
)
const eventsFiltered = computed(() =>
  selectedEngine.value
    ? events.value.filter(r =>
        r.domain ? domainBelongsToEngine(r.domain, selectedEngine.value) : true)
    : events.value
)
const queueStatsFiltered = computed(() =>
  selectedEngine.value
    ? queueStats.value.filter(r => r.engine === selectedEngine.value)
    : queueStats.value
)
const dlqFiltered = computed(() =>
  selectedEngine.value
    ? dlq.value.filter(r => r.engine === selectedEngine.value)
    : dlq.value
)
// Bucket dinâmico conforme janela escolhida
function bucketForWindow (mins) {
  if (mins <= 30) return 1
  if (mins <= 120) return 5
  if (mins <= 720) return 15
  return 60
}

// Agrupa timeseries por metric_key, somando todos os domains.
function aggregateSeries (metricKey) {
  const buckets = new Map()  // bucket_ts -> sum
  for (const row of timeseries.value) {
    if (row.metric_key !== metricKey) continue
    const t = row.bucket_ts
    buckets.set(t, (buckets.get(t) || 0) + Number(row.value || 0))
  }
  return [...buckets.entries()]
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .map(([ts, value]) => ({ ts, value }))
}

// Sparklines: arrays simples [n, n, n] derivados da timeseries.
const kpiSeries = computed(() => {
  const toArr = (key) => aggregateSeries(key).map(p => p.value)
  return {
    requests:  toArr('req.total'),
    persisted: toArr('persist.ok'),
    rate429:   toArr('status.429'),
    error5xx:  toArr('status.5xx'),
    retries:   toArr('retry.attempt'),
  }
})

// Área chart do hero (req.total como [{ts, value}])
const trafficSeries = computed(() => aggregateSeries('req.total'))

// Tendência (% diferença entre primeira metade e segunda metade da janela)
const kpiTrends = computed(() => {
  const calc = (arr) => {
    if (arr.length < 4) return null
    const half = Math.floor(arr.length / 2)
    const first = arr.slice(0, half).reduce((s, n) => s + n, 0)
    const second = arr.slice(half).reduce((s, n) => s + n, 0)
    if (first === 0) return second > 0 ? 100 : 0
    return ((second - first) / first) * 100
  }
  return {
    requests:  calc(kpiSeries.value.requests),
    persisted: calc(kpiSeries.value.persisted),
  }
})

// Totais por status (somam o que summary['status.X'] devolve por domínio)
const totalsByStatus = computed(() => {
  let ok = 0, x4 = 0
  for (const row of summary.value || []) {
    ok += Number(row.status_2xx || 0)
    // status_4xx não vem direto da RPC atual - calcula como total - 2xx - 429 - 5xx (fallback)
    const total = Number(row.req_total || 0)
    const r429 = Number(row.status_429 || 0)
    const r5xx = Number(row.status_5xx || 0)
    const r2xx = Number(row.status_2xx || 0)
    const other4xx = Math.max(0, total - r2xx - r429 - r5xx)
    x4 += other4xx
  }
  return { ok, x4 }
})

// Taxa de sucesso global (para o gauge do hero)
const successRatePct = computed(() => {
  const total = healthRow.value?.total_requests || 0
  if (total === 0) return 0
  const ok = totalsByStatus.value.ok
  return Math.max(0, Math.min(100, (ok / total) * 100))
})

// Lista de abas com badges contextuais
const tabs = computed(() => {
  const openCircuits = (circuits.value || []).filter(c => c.state !== 'closed').length
  const dlqCount = dlqFiltered.value.length
  const partialCount = (queueAggregated.value && queueAggregated.value.partial) || 0
  const nearPurgeCount = nearPurgeJobs.value.length
  return [
    { id: 'overview',    label: 'Visão geral' },
    { id: 'protection',  label: 'Proteção',
      badge: openCircuits || null,
      badgeClass: openCircuits ? 'tab-btn__badge--danger' : '' },
    { id: 'queue',       label: 'Fila',
      badge: partialCount || null,
      badgeClass: partialCount ? 'tab-btn__badge--warn' : '' },
    { id: 'dlq',         label: 'DLQ & Operações',
      badge: dlqCount || null,
      badgeClass: dlqCount ? 'tab-btn__badge--danger' : '' },
    { id: 'maintenance', label: 'Manutenção',
      badge: nearPurgeCount || null,
      badgeClass: nearPurgeCount ? 'tab-btn__badge--warn' : '' },
  ]
})

const dlqErrorTypeOptions = computed(() => {
  const types = new Set()
  for (const row of dlq.value || []) {
    if (row.last_error_type) types.add(row.last_error_type)
  }
  return [...types].sort()
})
const queueAggregated = computed(() => {
  if (!selectedEngine.value) return queue.value || {}
  // Quando filtra por engine, recalcula os totais a partir do queueStats filtrado
  const totals = { discovered: 0, running: 0, partial: 0, completed: 0, failed: 0, blocked: 0, dlq_total: 0 }
  for (const r of queueStatsFiltered.value) {
    if (totals[r.state] != null) totals[r.state] += Number(r.total) || 0
  }
  totals.dlq_total = dlqFiltered.value.length
  return totals
})

// =====================================================================
// Gráficos por aba (Proteção, Fila, DLQ, Manutenção)
// =====================================================================

// Helper: read a CSS variable from :root (with fallback). Charts use design
// tokens to stay coerentes com os temas light/dark do design system.
function cssVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
const CHART_TEXT_COLOR = () => cssVar('--color-text-muted', '#6B7280')
const CHART_GRID_COLOR = () => `color-mix(in srgb, ${cssVar('--color-text-muted', '#6B7280')} 22%, transparent)`
const CHART_TOOLTIP_BG = () => cssVar('--color-text-primary', '#0f172a')
const CHART_ON_TOOLTIP = () => cssVar('--color-background', '#fff')

// --- Proteção: erros vs sucessos por site (5 min) ---
const protectionChartData = computed(() => {
  const rows = (circuitsFiltered.value || []).slice(0, 12)
  return rows.map(r => ({
    domain: friendlyDomain(r.domain),
    failures: Number(r.failures_5m) || 0,
    successes: Number(r.successes_5m) || 0,
    errorRate: Number(r.error_rate) || 0,
  }))
})
const protectionChartOption = computed(() => {
  const data = protectionChartData.value
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: {
      top: 0, right: 0,
      icon: 'circle', itemWidth: 8, itemHeight: 8,
      textStyle: { color: CHART_TEXT_COLOR(), fontSize: 11 },
    },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: CHART_TOOLTIP_BG(), borderWidth: 0,
      textStyle: { color: CHART_ON_TOOLTIP(), fontSize: 11 },
    },
    xAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_GRID_COLOR() } },
      axisLabel: { color: CHART_TEXT_COLOR(), fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: data.map(d => d.domain),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: CHART_TEXT_COLOR(), fontSize: 11 },
    },
    series: [
      {
        name: 'Sucessos',
        type: 'bar', stack: 'total',
        itemStyle: { color: cssVar('--color-success', '#059669'), borderRadius: [0, 0, 0, 0] },
        emphasis: { focus: 'series' },
        data: data.map(d => d.successes),
      },
      {
        name: 'Erros',
        type: 'bar', stack: 'total',
        itemStyle: { color: cssVar('--color-error', '#DC2626'), borderRadius: [0, 4, 4, 0] },
        emphasis: { focus: 'series' },
        data: data.map(d => d.failures),
      },
    ],
    animationDuration: 700,
    animationEasing: 'cubicOut',
  }
})

// --- Fila: distribuição por estado (donut) ---
const QUEUE_STATE_LABELS = {
  discovered: 'Aguardando coleta',
  running: 'Coletando agora',
  partial: 'Parciais',
  completed: 'Concluídas',
  failed: 'Falharam (retentativa)',
  blocked: 'Aguardando site',
  dlq_total: 'Sem solução automática',
}
// Paleta do donut da fila - 7 estados, cada um com hue distinto.
// `failed` antes usava o mesmo amber do `partial`; agora vai para pink (chart-7)
// para que cada fatia seja imediatamente distinguível no gráfico.
const QUEUE_STATE_COLORS = () => ({
  discovered: cssVar('--chart-1', '#2563EB'),  // azul - aguardando coleta
  running:    cssVar('--chart-8', '#0EA5E9'),  // ciano - coletando
  partial:    cssVar('--chart-5', '#D97706'),  // âmbar - parcial
  completed:  cssVar('--color-success', '#059669'),  // verde - ok
  failed:     cssVar('--chart-7', '#DB2777'),  // rosa - falhou (retry)
  blocked:    cssVar('--chart-3', '#7C3AED'),  // roxo - aguarda site
  dlq_total:  cssVar('--color-error', '#DC2626'),  // vermelho - sem solução
})
const queueChartData = computed(() => {
  const q = queueAggregated.value || {}
  const colors = QUEUE_STATE_COLORS()
  return Object.keys(QUEUE_STATE_LABELS)
    .map(k => ({
      name: QUEUE_STATE_LABELS[k],
      value: Number(q[k]) || 0,
      itemStyle: { color: colors[k] },
    }))
    .filter(d => d.value > 0)
})
const queueChartOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: CHART_TOOLTIP_BG(), borderWidth: 0,
    textStyle: { color: CHART_ON_TOOLTIP(), fontSize: 11 },
    formatter: '{b}<br/>{c} ({d}%)',
  },
  legend: {
    orient: 'vertical', right: 8, top: 'center',
    icon: 'circle', itemWidth: 8, itemHeight: 8,
    textStyle: { color: CHART_TEXT_COLOR(), fontSize: 11 },
  },
  series: [{
    type: 'pie',
    radius: ['55%', '80%'],
    center: ['28%', '50%'],
    avoidLabelOverlap: true,
    itemStyle: { borderColor: cssVar('--color-surface', '#FAFBFC'), borderWidth: 2 },
    label: { show: false },
    labelLine: { show: false },
    data: queueChartData.value,
    animationDuration: 700,
    animationEasing: 'cubicOut',
  }],
}))

// --- DLQ: contagem por tipo de erro ---
const dlqChartData = computed(() => {
  const counts = new Map()
  for (const row of (dlqFiltered.value || [])) {
    const key = row.last_error_type || 'desconhecido'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([type, value]) => ({ type, label: friendlyError(type), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
})
const dlqChartOption = computed(() => {
  const data = dlqChartData.value
  return {
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: CHART_TOOLTIP_BG(), borderWidth: 0,
      textStyle: { color: CHART_ON_TOOLTIP(), fontSize: 11 },
    },
    xAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_GRID_COLOR() } },
      axisLabel: { color: CHART_TEXT_COLOR(), fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: data.map(d => d.label),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: CHART_TEXT_COLOR(), fontSize: 11 },
    },
    series: [{
      type: 'bar',
      itemStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: cssVar('--color-error', '#DC2626') },
            { offset: 1, color: cssVar('--chart-5', '#D97706') },
          ],
        },
        borderRadius: [0, 6, 6, 0],
      },
      label: {
        show: true, position: 'right',
        color: CHART_TEXT_COLOR(), fontSize: 11, fontWeight: 600,
      },
      data: data.map(d => d.value),
      animationDuration: 700,
      animationEasing: 'cubicOut',
    }],
  }
})

// --- Manutenção: distribuição por idade (dias) ---
const maintenanceChartData = computed(() => {
  const buckets = new Map()
  for (const row of (nearPurgeJobs.value || [])) {
    const days = Number(row.age_days) || 0
    buckets.set(days, (buckets.get(days) || 0) + 1)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([days, value]) => ({ days, value }))
})
const maintenanceChartOption = computed(() => {
  const data = maintenanceChartData.value
  return {
    grid: { left: 8, right: 16, top: 16, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: CHART_TOOLTIP_BG(), borderWidth: 0,
      textStyle: { color: CHART_ON_TOOLTIP(), fontSize: 11 },
      formatter: (params) => {
        const p = params[0]
        return `${p.name} dias<br/>${p.value} vagas`
      },
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d.days),
      name: 'idade (dias)', nameLocation: 'middle', nameGap: 22,
      nameTextStyle: { color: CHART_TEXT_COLOR(), fontSize: 10 },
      axisLine: { lineStyle: { color: CHART_GRID_COLOR() } },
      axisTick: { show: false },
      axisLabel: { color: CHART_TEXT_COLOR(), fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_GRID_COLOR() } },
      axisLabel: { color: CHART_TEXT_COLOR(), fontSize: 10 },
    },
    series: [{
      type: 'bar',
      itemStyle: {
        color: (params) => {
          const days = Number(data[params.dataIndex]?.days) || 0
          if (days >= 88) return cssVar('--color-error', '#DC2626')
          if (days >= 85) return cssVar('--chart-5', '#D97706')
          return cssVar('--color-warning', '#D97706')
        },
        borderRadius: [4, 4, 0, 0],
      },
      data: data.map(d => d.value),
      animationDuration: 700,
      animationEasing: 'cubicOut',
    }],
  }
})

const protectionHasData = computed(() => protectionChartData.value.length > 0)
const queueHasData      = computed(() => queueChartData.value.length > 0)
const dlqHasData        = computed(() => dlqChartData.value.length > 0)
const maintenanceHasData = computed(() => maintenanceChartData.value.length > 0)

function friendlyEngine (name) { return ENGINE_LABELS[name] || name }
function stateLabel    (s)    { return STATE_LABELS[s] || s }
function circuitLabel  (s)    { return CIRCUIT_LABELS[s] || s }
function friendlyEvent (k)    { return EVENT_LABELS[k] || k }
function friendlyError (e)    { return ERROR_LABELS[e] || (e || 'Erro não identificado') }

function selectEngineByDomain (domain) {
  // Encontra o engine correspondente ao domínio clicado e seleciona
  for (const [engine, domains] of Object.entries(ENGINE_DOMAINS)) {
    if (domains.includes(domain)) {
      selectedEngine.value = selectedEngine.value === engine ? '' : engine
      return
    }
  }
}

function friendlyDomain (d) {
  if (!d) return '-'
  // Remove 'www.', 'br.', 'm.' do começo para uma leitura mais limpa
  return d.replace(/^(?:www\.|br\.|m\.)/, '')
}

function formatEventData (data) {
  if (!data) return ''
  // Apresenta os campos chave em formato legível (chave: valor, separados por vírgula)
  if (typeof data !== 'object') return String(data)
  return Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
}

function formatMs (ms) {
  if (ms == null) return '-'
  const n = Number(ms)
  if (n < 1000) return Math.round(n) + ' ms'
  return (n / 1000).toFixed(1) + ' s'
}

async function loadAll (opts = {}) {
  const silent = opts.silent === true
  loading.value = true
  if (!silent) refreshing.value = true
  errorMsg.value = ''
  try {
    const bucketMin = bucketForWindow(windowMinutes.value)
    const [s, c, e, h, qs, q, d, ts] = await Promise.all([
      supabase.rpc('get_scraper_summary',          { window_minutes: windowMinutes.value }),
      supabase.rpc('get_scraper_circuits'),
      supabase.rpc('get_scraper_events',           { window_minutes: windowMinutes.value, max_rows: 200 }),
      supabase.rpc('get_scraper_health',           { window_minutes: windowMinutes.value }),
      supabase.rpc('get_extraction_queue_stats'),
      supabase.rpc('get_extraction_queue_summary'),
      supabase.rpc('get_extraction_dlq',           { window_minutes: windowMinutes.value, max_rows: 100 }),
      supabase.rpc('get_scraper_timeseries',       { window_minutes: windowMinutes.value, bucket_minutes: bucketMin }),
    ])
    for (const r of [s, c, e, h, qs, q, d, ts]) if (r.error) throw r.error
    summary.value = s.data || []
    circuits.value = c.data || []
    events.value = e.data || []
    healthRow.value = (h.data && h.data[0]) || null
    queueStats.value = qs.data || []
    queue.value = (q.data && q.data[0]) || {}
    dlq.value = d.data || []
    timeseries.value = ts.data || []
    // Atualiza near-purge sem bloquear loadAll
    loadNearPurge().catch(() => { /* já trata erro internamente */ })
  } catch (err) {
    errorMsg.value = err.message || 'Falha ao carregar métricas.'
  } finally {
    loading.value = false
    refreshing.value = false
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

function formatInt (n) { return n == null ? '-' : Number(n).toLocaleString('pt-BR') }
function formatNum (n) { return n == null ? '-' : Number(n).toFixed(0) }
function formatPct (n) { return n == null ? '-' : (n * 100).toFixed(1) + '%' }
function formatRate (n) { return n == null ? '-' : Number(n).toFixed(2) }
function formatSeconds (s) {
  if (!s || s <= 0) return '-'
  if (s < 60) return Math.round(s) + 's'
  if (s < 3600) return Math.round(s / 60) + 'm'
  return (s / 3600).toFixed(1) + 'h'
}
function formatTimestamp (ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  return d.toLocaleString('pt-BR', { hour12: false })
}
function formatDateOnly (iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR')
}

// ---------- Painel de controle (Fase 3) ----------

async function withAction (fn, successMsg) {
  if (actionBusy.value) return
  actionBusy.value = true
  errorMsg.value = ''
  try {
    const result = await fn()
    if (successMsg) {
      // Mensagem leve via title temporário; loadAll() refresca os números.
      console.info('[admin]', successMsg, result)
    }
    await loadAll()
    return result
  } catch (err) {
    errorMsg.value = err.message || 'Falha ao executar ação.'
  } finally {
    actionBusy.value = false
  }
}

async function onRetryDlq (jobUrl) {
  if (!jobUrl) return
  if (!confirm('Recolocar esta URL na fila de coleta?')) return
  await withAction(async () => {
    const { data, error } = await supabase.rpc('admin_retry_dlq_url', { p_job_url: jobUrl })
    if (error) throw error
    return data
  }, 'URL reagendada')
}

async function onDeleteDlq (jobUrl) {
  if (!jobUrl) return
  if (!confirm('Apagar esta entrada da DLQ permanentemente? A URL não será mais tentada.')) return
  await withAction(async () => {
    const { data, error } = await supabase.rpc('admin_delete_dlq_entry', { p_job_url: jobUrl })
    if (error) throw error
    return data
  }, 'Entrada removida')
}

async function onClearDlq () {
  const engine = bulkClearEngine.value || null
  const errorType = bulkClearErrorType.value || null
  const filterDesc = [
    engine ? `site=${friendlyEngine(engine)}` : null,
    errorType ? `erro=${friendlyError(errorType)}` : null,
  ].filter(Boolean).join(' / ') || 'TODAS as entradas'
  if (!confirm(`Limpar DLQ (${filterDesc})? Esta ação não pode ser desfeita.`)) return
  await withAction(async () => {
    const { data, error } = await supabase.rpc('admin_clear_dlq', {
      p_engine: engine,
      p_error_type: errorType,
    })
    if (error) throw error
    return data
  }, 'DLQ limpa')
}

async function onReenrichEngine (engine) {
  if (!engine) return
  if (!confirm(`Marcar todas as URLs de ${friendlyEngine(engine)} como "aguardando coleta"? O scraper vai reprocessá-las no próximo passe.`)) return
  await withAction(async () => {
    const { data, error } = await supabase.rpc('admin_reenrich_engine', { p_engine: engine })
    if (error) throw error
    return data
  }, 'Engine marcada para reprocessamento')
}

async function loadNearPurge () {
  nearPurgeLoading.value = true
  errorMsg.value = ''
  try {
    const { data, error } = await supabase.rpc('get_jobs_near_purge', {
      p_min_age_days: Number(nearPurgeMinDays.value) || 80,
      p_max_age_days: Number(nearPurgeMaxDays.value) || 90,
      p_engine: selectedEngine.value || null,
      p_max_rows: 200,
    })
    if (error) throw error
    nearPurgeJobs.value = data || []
  } catch (err) {
    errorMsg.value = err.message || 'Falha ao carregar vagas próximas dos 90 dias.'
  } finally {
    nearPurgeLoading.value = false
  }
}

let timer = null
onMounted(async () => {
  // Boot inicial: mostra skeleton enquanto carrega. Polling a cada 30s
  // é silencioso (apenas a barra fina aparece, dados ficam visíveis).
  try {
    await loadAll({ silent: true })
  } finally {
    initialLoading.value = false
  }
  timer = setInterval(() => loadAll(), 30_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
watch(windowMinutes, () => loadAll())
watch(selectedEngine, loadNearPurge)
watch([nearPurgeMinDays, nearPurgeMaxDays], loadNearPurge)
</script>

<style scoped>
.scraper-page {
  /* Sem max-width - AdminLayout cuida do cap em 1600px e da centralização. */
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.page-controls {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-controls__filters { display: flex; gap: 12px; flex-wrap: wrap; }
.filter-group {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 11px; color: var(--color-text-muted);
  text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
}
/* selects herdam .form-select/.form-input dos globals; só ajustamos a
   largura mínima para alinhar visualmente com os filtros adjacentes. */
.form-select {
  min-width: 11.25rem;
}
.select-sm {                    /* input numérico inline */
  min-width: 8.75rem;
}

.filter-pill {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 14px; border-radius: 10px;
  background: var(--color-accent-soft); color: var(--color-accent);
  font-size: 13px; border: 1px solid var(--color-accent);
}
.filter-clear {
  background: transparent; border: none; color: var(--color-accent);
  cursor: pointer; font-size: 12px; font-weight: 600; text-decoration: underline;
}
.filter-pill__actions { display: inline-flex; align-items: center; gap: 14px; }
.filter-pill__actions a.filter-clear { text-decoration: none; }
.filter-pill__actions a.filter-clear:hover { text-decoration: underline; }

.row-clickable { cursor: pointer; transition: background-color 120ms ease; }
.row-clickable:hover { background: var(--color-glass-bg, rgba(0,0,0,0.03)); }
tr.row-active,
tr.row-active:hover { background: var(--color-accent-soft); }
.row-active td:first-child { font-weight: 600; }

/* Banner de saúde geral - semáforo visual */
.health-banner {
  display: flex; align-items: center; gap: var(--space-4);
  padding: var(--space-4) var(--space-5); border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}
.health-banner.success { background: color-mix(in srgb, var(--color-success) 6%, transparent); border-color: color-mix(in srgb, var(--color-success) 25%, transparent); }
.health-banner.warn    { background: color-mix(in srgb, var(--color-warning) 6%, transparent); border-color: color-mix(in srgb, var(--color-warning) 25%, transparent); }
.health-banner.danger  { background: color-mix(in srgb, var(--color-error) 6%, transparent);   border-color: color-mix(in srgb, var(--color-error) 25%, transparent); }
.health-banner.idle    { background: var(--color-glass-bg); }
.health-icon {
  width: var(--space-9); height: var(--space-9); flex-shrink: 0;
  border-radius: var(--radius-md); display: grid; place-items: center;
  font-size: var(--text-lg); font-weight: var(--font-bold);
  background: var(--color-surface); border: 1px solid var(--color-border);
}
.health-banner.success .health-icon { color: var(--color-success); border-color: color-mix(in srgb, var(--color-success) 40%, transparent); }
.health-banner.warn    .health-icon { color: var(--color-warning); border-color: color-mix(in srgb, var(--color-warning) 40%, transparent); }
.health-banner.danger  .health-icon { color: var(--color-error);   border-color: color-mix(in srgb, var(--color-error) 40%, transparent); }
.health-banner.idle    .health-icon { color: var(--color-text-muted); }
.health-text { display: flex; flex-direction: column; gap: 2px; }
.health-text strong { font-size: 14px; color: var(--color-text-primary); }
.health-text span   { font-size: 13px; color: var(--color-text-secondary); }

/* Header de tabela com ícone de ajuda inline */
.th-with-help {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

/* Caixa "Como ler esta página" */
.info-box {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 10px; padding: 0;
}
.info-box summary {
  cursor: pointer; padding: 12px 16px;
  font-size: 13px; font-weight: 600; color: var(--color-text-primary);
  list-style: none;
}
.info-box summary::-webkit-details-marker { display: none; }
.info-box summary::before {
  content: 'ⓘ'; margin-right: 8px; color: var(--color-accent);
}
.info-box[open] summary { border-bottom: 1px solid var(--color-border); }
.info-content {
  padding: 14px 18px;
  font-size: 13px; color: var(--color-text-secondary);
  line-height: 1.55;
}
.info-content p { margin: 0 0 10px; }
.info-content ul { margin: 0; padding-left: 18px; }
.info-content li { margin-bottom: 6px; }
.info-content strong { color: var(--color-text-primary); }

.card-help {
  margin: -4px 0 14px; font-size: 12px;
  color: var(--color-text-secondary); line-height: 1.5;
}
.success-msg { color: var(--color-success); font-weight: var(--font-medium); }

/* KPI grid - colunas explícitas para evitar célula vazia em telas largas. */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3);
}
@media (max-width: 1280px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px)  { .kpi-grid { grid-template-columns: 1fr; } }
.kpi {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2);
}
.kpi-label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: var(--ls-wide); }
.kpi-value { font-size: var(--text-2xl); font-weight: var(--font-bold); color: var(--color-text-primary); line-height: 1.1; }
.kpi-hint  { font-size: var(--text-xs); color: var(--color-text-secondary); }
.kpi.success .kpi-value { color: var(--color-success); }
.kpi.warn    .kpi-value { color: var(--color-warning); }
.kpi.danger  .kpi-value { color: var(--color-error); }

.card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  /* Padding folgado p/ que o conteúdo respire dentro do card. */
  padding: var(--space-5) var(--space-6);
}
.card h2 { margin: 0 0 var(--space-3); font-size: var(--text-base); font-weight: var(--font-semibold); color: var(--color-text-primary); letter-spacing: var(--ls-tight); }
.table-wrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.table th, .table td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border); text-align: left; }
.table th { font-weight: var(--font-semibold); color: var(--color-text-muted); text-transform: uppercase; font-size: var(--text-xs); letter-spacing: var(--ls-wide); }
.table td.num, .table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.table td.danger { color: var(--color-error); font-weight: var(--font-semibold); }
.table td.warn   { color: var(--color-warning); font-weight: var(--font-semibold); }
.table .empty { text-align: center; color: var(--color-text-muted); padding: 18px; }

.pill {
  display: inline-block; padding: 2px var(--space-3); border-radius: var(--radius-full);
  font-size: var(--text-xs); font-weight: var(--font-semibold); text-transform: uppercase; letter-spacing: var(--ls-wide);
}
.pill-ok     { background: color-mix(in srgb, var(--color-success) 12%, transparent); color: var(--color-success); }
.pill-warn   { background: color-mix(in srgb, var(--color-warning) 12%, transparent); color: var(--color-warning); }
.pill-danger { background: color-mix(in srgb, var(--color-error) 12%, transparent);   color: var(--color-error); }

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
.ev-warn   .ev-kind { color: var(--color-warning); }
.ev-danger .ev-kind { color: var(--color-error); }

.queue-grid {
  display: grid;
  /* 7 estados → 7 colunas em telas largas, 4 em médias, 2 em pequenas. */
  grid-template-columns: repeat(7, 1fr);
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
@media (max-width: 1280px) { .queue-grid { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 640px)  { .queue-grid { grid-template-columns: repeat(2, 1fr); } }
.q-card {
  background: var(--color-glass-bg, rgba(0,0,0,0.02));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  display: flex; flex-direction: column; gap: var(--space-1);
}
.q-label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: var(--ls-wide); }
.q-value { font-size: var(--text-xl); font-weight: var(--font-bold); color: var(--color-text-primary); line-height: 1.2; }
.q-card.success .q-value { color: var(--color-success); }
.q-card.warn    .q-value { color: var(--color-warning); }
.q-card.danger  .q-value { color: var(--color-error); }
.subhead { font-size: 12px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 16px 0 8px; }
.url-cell a {
  color: var(--color-accent); text-decoration: none;
  display: inline-block; max-width: 380px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom;
}
.url-cell a:hover { text-decoration: underline; }
.table small { display: block; color: var(--color-text-muted); font-size: 11px; margin-top: 2px; }

.error-msg {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
  padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

/* Painel de controle (Fase 3) */
.action-toolbar {
  display: flex;
  align-items: end;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  margin: 0 0 14px;
  background: var(--color-glass-bg, rgba(0,0,0,0.02));
  border: 1px dashed var(--color-border);
  border-radius: 10px;
}
.action-toolbar--bulk { background: var(--color-surface); }
.action-toolbar__hint {
  flex: 1 1 280px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
.action-toolbar__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  align-self: center;
  margin-right: 4px;
}
.filter-group--inline { flex-direction: column; gap: 4px; }
.select--sm { height: 32px; min-width: 140px; font-size: 12px; padding: 0 10px; }

/* Modificador "extra small" para botões em linha (DLQ ações por linha de tabela).
   Use junto com .btn .btn-sm: .btn .btn-primary .btn-sm .btn-xs */
.btn-xs {
  min-height: 1.625rem;          /* 26px */
  padding: 0 var(--space-3);
  font-size: var(--text-xs);
}

.action-cell {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* ===== Tab strip ===== */
.tab-strip {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--color-glass-bg, rgba(0,0,0,0.03));
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);   /* 12px 16px */
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast), color var(--transition-fast);
  font-family: inherit;
}
.tab-btn:hover {
  background: var(--color-surface);
  color: var(--color-text-primary);
}
.tab-btn--active {
  background: var(--color-surface);
  color: var(--color-accent);
  box-shadow: var(--shadow-sm);
}
.tab-btn__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-glass-bg, rgba(0,0,0,0.05));
  color: var(--color-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.tab-btn--active .tab-btn__badge { background: var(--color-accent-soft); color: var(--color-accent); }
.tab-btn__badge--danger { background: color-mix(in srgb, var(--color-error) 12%, transparent); color: var(--color-error); }
.tab-btn__badge--warn   { background: color-mix(in srgb, var(--color-warning) 12%, transparent); color: var(--color-warning); }

@media (max-width: 640px) {
  .tab-btn { padding: 8px 10px; font-size: 12px; }
}
</style>

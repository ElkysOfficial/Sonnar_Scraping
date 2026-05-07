<template>
  <div class="scraper-page">
    <!-- Controles (título e subtítulo vêm da topbar) -->
    <div class="page-controls">
      <div class="page-controls__filters">
        <label class="filter-group">
          <span>Período</span>
          <select v-model.number="windowMinutes" class="select" aria-label="Janela de tempo">
            <option :value="15">Últimos 15 minutos</option>
            <option :value="60">Última hora</option>
            <option :value="360">Últimas 6 horas</option>
            <option :value="1440">Últimas 24 horas</option>
          </select>
        </label>
        <label class="filter-group">
          <span>Site</span>
          <select v-model="selectedEngine" class="select" aria-label="Filtrar por site">
            <option value="">Todos os sites</option>
            <option v-for="opt in engineOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
      </div>
      <button class="btn-refresh" @click="loadAll" :disabled="loading">
        {{ loading ? 'Atualizando…' : 'Atualizar agora' }}
      </button>
    </div>

    <!-- Indicador de filtro ativo -->
    <div v-if="selectedEngine" class="filter-pill">
      <span>
        Mostrando apenas: <strong>{{ friendlyEngine(selectedEngine) }}</strong>
      </span>
      <button class="filter-clear" @click="selectedEngine = ''" type="button">
        Limpar filtro ✕
      </button>
    </div>

    <!-- Banner de saúde geral -->
    <section class="health-banner" :class="health.healthClass">
      <div class="health-icon" aria-hidden="true">{{ health.healthIcon }}</div>
      <div class="health-text">
        <strong>{{ health.headline }}</strong>
        <span>{{ health.subline }}</span>
      </div>
    </section>

    <!-- KPIs principais com linguagem humana -->
    <section class="kpi-grid">
      <article class="kpi" :class="health.healthClass" :title="kpiHelp.requests">
        <span class="kpi-label">Acessos aos sites</span>
        <span class="kpi-value">{{ formatInt(health.total_requests) }}</span>
        <span class="kpi-hint">{{ health.error_rate_pct }}% deram erro</span>
      </article>

      <article class="kpi success" :title="kpiHelp.persisted">
        <span class="kpi-label">Vagas salvas</span>
        <span class="kpi-value">{{ formatInt(health.jobs_persisted_ok) }}</span>
        <span class="kpi-hint">
          <template v-if="(health.jobs_persisted_error || 0) > 0">
            {{ formatInt(health.jobs_persisted_error) }} falharam ao salvar
          </template>
          <template v-else>nenhuma falha ao salvar</template>
        </span>
      </article>

      <article class="kpi" :class="{ warn: (health.total_429 || 0) > 0 }" :title="kpiHelp.rateLimit">
        <span class="kpi-label">Avisos de excesso</span>
        <span class="kpi-value">{{ formatInt(health.total_429) }}</span>
        <span class="kpi-hint">o site pediu pra ir mais devagar</span>
      </article>

      <article class="kpi" :class="{ warn: (health.total_5xx || 0) > 0 }" :title="kpiHelp.serverError">
        <span class="kpi-label">Erros do site</span>
        <span class="kpi-value">{{ formatInt(health.total_5xx) }}</span>
        <span class="kpi-hint">o site falhou em responder</span>
      </article>

      <article class="kpi" :class="{ danger: (health.open_circuits || 0) > 0 }" :title="kpiHelp.circuits">
        <span class="kpi-label">Sites em pausa de proteção</span>
        <span class="kpi-value">{{ health.open_circuits || 0 }}</span>
        <span class="kpi-hint">descansando para não ser bloqueado</span>
      </article>

      <article class="kpi" :title="kpiHelp.retries">
        <span class="kpi-label">Tentativas extras</span>
        <span class="kpi-value">{{ formatInt(health.total_retries) }}</span>
        <span class="kpi-hint">requests refeitas após erro temporário</span>
      </article>
    </section>

    <!-- Como ler esta página (caixa explicativa) -->
    <details class="info-box">
      <summary>Como ler esta página?</summary>
      <div class="info-content">
        <p>
          O sistema visita 17 sites de vagas (LinkedIn, Indeed, Gupy, etc.) a cada 2 horas e
          salva o que encontra. Esta página mostra o que está acontecendo agora.
        </p>
        <ul>
          <li><strong>Acessos aos sites</strong> — quantas vezes pedimos uma página a algum site no período.</li>
          <li><strong>Vagas salvas</strong> — vagas extraídas e gravadas no banco/JSON com sucesso.</li>
          <li><strong>Avisos de excesso</strong> — quando um site responde "está vindo rápido demais" (HTTP 429). O sistema reduz a velocidade automaticamente.</li>
          <li><strong>Erros do site</strong> — quando o servidor do site responde com erro (HTTP 500/502/503/504). Geralmente passageiro.</li>
          <li><strong>Sites em pausa de proteção</strong> — quando um site está dando muito erro, paramos por 15 min a 2 h para não sermos banidos.</li>
          <li><strong>Tentativas extras</strong> — requisições que precisaram ser refeitas por erro temporário (timeout, 5xx, 429).</li>
        </ul>
      </div>
    </details>

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
              <th class="num" title="Total de páginas pedidas ao site no período">Acessos</th>
              <th class="num" title="Páginas que responderam com sucesso (status 2xx)">Sucesso</th>
              <th class="num" title="Avisos do site para reduzir o ritmo (HTTP 429)">Excesso</th>
              <th class="num" title="Erros do servidor do site (HTTP 5xx)">Erros do site</th>
              <th class="num" title="Requisições que precisaram ser refeitas">Refeitas</th>
              <th class="num" title="Mediana do tempo de resposta (ms)">Tempo médio</th>
              <th class="num" title="P95 do tempo de resposta — 95% das requests respondem em até esse tempo (ms)">Tempo pior caso</th>
              <th class="num" title="Velocidade atual aplicada — em requisições por segundo">Ritmo atual</th>
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
              <td colspan="7" class="empty">Nenhum site monitorado ainda — comece o scraper para ver dados aqui.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

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
          Reprocessar marca todas as URLs desta engine como "aguardando coleta" — útil quando o leitor (parser) foi atualizado.
        </span>
        <button
          class="btn-action btn-action--primary"
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
          <select v-model="bulkClearEngine" class="select select--sm">
            <option value="">Qualquer site</option>
            <option v-for="opt in engineOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label class="filter-group filter-group--inline">
          <span>Tipo de erro</span>
          <select v-model="bulkClearErrorType" class="select select--sm">
            <option value="">Qualquer erro</option>
            <option v-for="t in dlqErrorTypeOptions" :key="t" :value="t">
              {{ friendlyError(t) }}
            </option>
          </select>
        </label>
        <button
          class="btn-action btn-action--danger"
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
                  class="btn-action btn-action--xs btn-action--primary"
                  :disabled="actionBusy"
                  title="Recoloca a URL na fila de coleta com 0 tentativas"
                  @click="onRetryDlq(row.job_url)"
                >
                  Tentar de novo
                </button>
                <button
                  class="btn-action btn-action--xs btn-action--ghost"
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
                Nenhuma vaga problemática no período — tudo limpo!
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Vagas próximas dos 90 dias -->
    <section class="card">
      <h2>Vagas próximas dos 90 dias</h2>
      <p class="card-help">
        A partir dos 90 dias as vagas saem do JSON dos bots de mensagem (mas continuam no banco
        para histórico). Aqui aparecem as que estão entre {{ nearPurgeMinDays }} e {{ nearPurgeMaxDays }} dias —
        revise se alguma ainda merece estar ativa.
      </p>
      <div class="action-toolbar action-toolbar--bulk">
        <label class="filter-group filter-group--inline">
          <span>Idade mínima (dias)</span>
          <input v-model.number="nearPurgeMinDays" type="number" min="0" max="365" class="select select--sm" />
        </label>
        <label class="filter-group filter-group--inline">
          <span>Idade máxima (dias)</span>
          <input v-model.number="nearPurgeMaxDays" type="number" min="0" max="365" class="select select--sm" />
        </label>
        <button
          class="btn-action btn-action--ghost"
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
              <td>{{ row.location_raw || row.state_code || row.country_code || '—' }}</td>
              <td>{{ row.hiring_regime || '—' }}</td>
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
          <span class="ev-domain">{{ ev.domain ? friendlyDomain(ev.domain) : '—' }}</span>
          <span class="ev-data" v-if="ev.data">{{ formatEventData(ev.data) }}</span>
        </li>
        <li v-if="!eventsFiltered.length" class="empty">Nenhum evento no período selecionado.</li>
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
      : `${errPct.toFixed(1)}% das chamadas estão falhando — investigue se algum site mudou.`
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
  serverError: 'Erros do servidor do site (ex.: site fora do ar). Geralmente passageiro — refazemos a chamada.',
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
  dlq: 'Vagas que falharam 3 vezes seguidas. Precisam de análise manual — geralmente o site mudou o layout.',
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
  KeyError: 'Site mudou a estrutura — campo esperado não existe mais',
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
  if (!d) return '—'
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
  if (ms == null) return '—'
  const n = Number(ms)
  if (n < 1000) return Math.round(n) + ' ms'
  return (n / 1000).toFixed(1) + ' s'
}

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
    // Atualiza near-purge sem bloquear loadAll
    loadNearPurge().catch(() => { /* já trata erro internamente */ })
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
function formatDateOnly (iso) {
  if (!iso) return '—'
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
onMounted(() => {
  loadAll()
  timer = setInterval(loadAll, 30_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
watch(windowMinutes, loadAll)
watch(selectedEngine, loadNearPurge)
watch([nearPurgeMinDays, nearPurgeMaxDays], loadNearPurge)
</script>

<style scoped>
.scraper-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
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
.select, .btn-refresh {
  height: 36px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--color-border); background: var(--color-surface);
  color: var(--color-text-primary); font-size: 13px; cursor: pointer;
  font-family: inherit; min-width: 180px;
}
.btn-refresh {
  background: var(--color-accent); color: var(--color-text-inverse, #fff);
  border-color: transparent; min-width: 140px; align-self: end;
}
.btn-refresh:disabled { opacity: 0.6; cursor: progress; }

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

.row-clickable { cursor: pointer; transition: background-color 120ms ease; }
.row-clickable:hover { background: var(--color-glass-bg, rgba(0,0,0,0.03)); }
.row-active { background: var(--color-accent-soft) !important; }
.row-active td:first-child { font-weight: 600; }

/* Banner de saúde geral — semáforo visual */
.health-banner {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 18px; border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}
.health-banner.success { background: rgba(22,163,74,0.06);  border-color: rgba(22,163,74,0.25);  }
.health-banner.warn    { background: rgba(217,119,6,0.06);  border-color: rgba(217,119,6,0.25);  }
.health-banner.danger  { background: rgba(220,38,38,0.06);  border-color: rgba(220,38,38,0.25);  }
.health-banner.idle    { background: var(--color-glass-bg); }
.health-icon {
  width: 36px; height: 36px; flex-shrink: 0;
  border-radius: 10px; display: grid; place-items: center;
  font-size: 18px; font-weight: 700;
  background: var(--color-surface); border: 1px solid var(--color-border);
}
.health-banner.success .health-icon { color: #16a34a; border-color: rgba(22,163,74,0.4); }
.health-banner.warn    .health-icon { color: #d97706; border-color: rgba(217,119,6,0.4); }
.health-banner.danger  .health-icon { color: #dc2626; border-color: rgba(220,38,38,0.4); }
.health-banner.idle    .health-icon { color: var(--color-text-muted); }
.health-text { display: flex; flex-direction: column; gap: 2px; }
.health-text strong { font-size: 14px; color: var(--color-text-primary); }
.health-text span   { font-size: 13px; color: var(--color-text-secondary); }

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
.success-msg { color: #16a34a !important; font-weight: 500; }

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

.btn-action {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 120ms ease, opacity 120ms ease;
  font-family: inherit;
  white-space: nowrap;
}
.btn-action:hover:not(:disabled) { filter: brightness(1.05); }
.btn-action:disabled { opacity: 0.55; cursor: progress; }
.btn-action--primary {
  background: var(--color-accent);
  color: var(--color-text-inverse, #fff);
  border-color: transparent;
}
.btn-action--danger {
  background: rgba(220,38,38,0.1);
  color: #dc2626;
  border-color: rgba(220,38,38,0.3);
}
.btn-action--ghost {
  background: transparent;
}
.btn-action--xs { height: 26px; padding: 0 10px; font-size: 11px; }

.action-cell {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>

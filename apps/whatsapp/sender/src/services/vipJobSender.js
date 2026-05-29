/**
 * Serviço de envio de vagas personalizadas para assinantes VIP
 * Envia vagas filtradas por stack para o privado dos assinantes
 *
 * REGRAS:
 * - Apenas 1 vaga enviada a cada 7 minutos por assinante
 * - Mesma vaga não é enviada duas vezes (exceto após 48 horas)
 * - Estado persistido em arquivo para sobreviver a reinicializações
 *
 * @author Sonar Bot
 */

import { delay } from "baileys"
import { fetchJobCardImage } from "./cardClient.js"
import { formatCaption } from "./captionBuilder.js"
import { shortenUrl } from "./urlShortener.js"
import { infoLog, infoLogAlways, successLog, warningLog, errorLog } from "../utils/logger.js"
import {
  BOT_EMOJI,
  TIMEOUT_IN_MILLISECONDS_BY_EVENT,
  VIP_JOB_LOOKBACK_DAYS,
  VIP_MAX_JOBS_PER_CYCLE,
  VIP_FALLBACK_MAX_JOBS,
  VIP_ENABLE_FULL_SCAN_FALLBACK,
  VIP_FULL_SCAN_PAGE_SIZE,
  VIP_ENABLE_DIAGNOSTICS,
  VIP_DIAGNOSTIC_LOG_LIMIT
} from "../config.js"
import { extractStack } from "./jobDistributor.js"
import { getVipSubscribers, getVipSubscriber } from "../utils/database.js"
import { getCurrentSocket, isCurrentSocketReady } from "../utils/socketManager.js"
import { getAllJobs, runFullCleanup } from "./database.js"
import {
  canSendToSubscriber,
  wasJobSentRecently,
  recordJobSent,
  getTimeUntilCanSend,
  getSentJobIds,
  cleanOldEntries,
  loadHistoryBatch,
  loadSubscriberIdsBatch
} from "./vipHistory.js"
import {
  normalizeText,
  normalizeTokensFromText,
  matchStacksWithScore,
  detectWorkMode,
  matchLocationForMode
} from "../utils/matchingEngine.js"
import {
  loadVipJobsCache,
  saveVipJobsCache,
  generateVipJobsCache,
  getNextJobFromCache,
  markJobSentInCache,
  isVipCacheValid,
  getAvailableJobsFromCache,
  cleanExpiredVipCaches
} from "./vipJobsCache.js"

// Intervalo entre verificações (30 minutos - reduz egress do Supabase)
const CHECK_INTERVAL = 30 * 60 * 1000
// Intervalo de cleanup (24 horas)
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000
let vipTimeoutId = null
let vipIntervalId = null
let vipRunToken = 0
let vipPendingTimeoutId = null
let lastCleanupTimestamp = 0

// Buscas VIP pendentes quando a conexao esta fechada
const pendingVipSearches = new Map()

// ═══════════════════════════════════════════════════════════════
// CACHE INTELIGENTE DE VAGAS - OTIMIZADO PARA REDUZIR EGRESS
// Busca TODAS as vagas 1x por dia e filtra por VIP
// ═══════════════════════════════════════════════════════════════

// Cache global de todas as vagas (TTL: 24 horas)
const allJobsCache = {
  jobs: null,
  timestamp: 0,
  ttl: 24 * 60 * 60 * 1000 // 24 horas
}

// Cache de vagas compatíveis PRÉ-FILTRADAS por VIP
// Map<lid, { jobs: Array, sentIds: Set, timestamp: number }>
const vipCompatibleJobsCache = new Map()

// TTL do cache por VIP (24 horas)
const VIP_CACHE_TTL = 24 * 60 * 60 * 1000

// Cache legado (mantido para compatibilidade)
const jobsCache = {
  jobs: null,
  cycleId: null,
  timestamp: 0,
  ttl: CHECK_INTERVAL - 60000
}

/**
 * Carrega vagas para o ciclo atual (usa cache se disponível)
 * @param {string} cycleId - ID do ciclo atual
 * @param {Object} options - Opções de carregamento
 * @returns {Promise<Array>} Array de vagas
 */
async function getCachedJobsForCycle(cycleId, options = {}) {
  const now = Date.now()

  // Se é o mesmo ciclo e cache está válido, retorna do cache
  if (
    jobsCache.cycleId === cycleId &&
    jobsCache.jobs !== null &&
    now - jobsCache.timestamp < jobsCache.ttl
  ) {
    infoLog(`[VIP CACHE] Usando cache de vagas (${jobsCache.jobs.length} vagas)`)
    return jobsCache.jobs
  }

  // Carrega novas vagas do banco
  infoLog(`[VIP CACHE] Carregando vagas do Supabase...`)
  const jobs = await loadJobs(options)

  // Atualiza cache
  jobsCache.jobs = jobs
  jobsCache.cycleId = cycleId
  jobsCache.timestamp = now

  infoLog(`[VIP CACHE] Cache atualizado com ${jobs.length} vagas`)
  return jobs
}

/**
 * Invalida o cache de vagas (forçar recarga no próximo ciclo)
 */
export function invalidateJobsCache() {
  jobsCache.jobs = null
  jobsCache.cycleId = null
  jobsCache.timestamp = 0
  // Também invalida o cache global
  allJobsCache.jobs = null
  allJobsCache.timestamp = 0
}

/**
 * Invalida o cache de um VIP específico ou de todos
 * @param {string} lid - LID do VIP (opcional, se não informado invalida todos)
 */
export function invalidateVipCache(lid = null) {
  if (lid) {
    vipCompatibleJobsCache.delete(lid)
    infoLog(`[VIP CACHE] Cache invalidado para ${lid}`)
  } else {
    vipCompatibleJobsCache.clear()
    infoLog(`[VIP CACHE] Cache de todos os VIPs invalidado`)
  }
}

/**
 * Carrega TODAS as vagas do banco (1x por dia)
 * @returns {Promise<Array>} Array de todas as vagas
 */
async function getAllJobsFromCache() {
  const now = Date.now()

  // Se cache ainda é válido, retorna do cache
  if (allJobsCache.jobs !== null && now - allJobsCache.timestamp < allJobsCache.ttl) {
    infoLog(`[VIP CACHE] Usando cache global (${allJobsCache.jobs.length} vagas, age=${Math.round((now - allJobsCache.timestamp) / 3600000)}h)`)
    return allJobsCache.jobs
  }

  // Carrega TODAS as vagas do banco (sem limite)
  infoLog(`[VIP CACHE] Carregando TODAS as vagas do Supabase (1x por dia)...`)
  const jobs = await loadJobs({ limit: 0, lookbackDays: 0 }) // Sem limite

  // Atualiza cache global
  allJobsCache.jobs = jobs || []
  allJobsCache.timestamp = now

  // Invalida cache de todos os VIPs (forçar recálculo)
  vipCompatibleJobsCache.clear()

  successLog(`[VIP CACHE] Cache global atualizado com ${allJobsCache.jobs.length} vagas (próxima atualização em 24h)`)
  return allJobsCache.jobs
}

/**
 * Obtém vagas compatíveis para um VIP específico (do cache ou calcula)
 * VERSÃO v3: Salva em arquivo JSON para persistência entre reinicializações
 * @param {string} lid - LID do assinante
 * @param {Object} filters - Filtros do assinante
 * @param {Set} sentJobIds - IDs de vagas já enviadas (últimas 48h)
 * @param {string} subscriberName - Nome do assinante (opcional)
 * @returns {Promise<Array>} Array de vagas compatíveis
 */
async function getCompatibleJobsForVip(lid, filters, sentJobIds, subscriberName = null) {
  const now = Date.now()

  // PRIMEIRA VERIFICAÇÃO: Tenta carregar do arquivo JSON (persistido)
  const jsonCache = await loadVipJobsCache(lid)
  if (jsonCache && isVipCacheValid(jsonCache)) {
    // Filtra vagas já enviadas (atualiza em tempo real)
    const sentSet = new Set([...sentJobIds, ...(jsonCache.sentJobIds || [])])
    const available = jsonCache.jobs.filter(job => {
      const jobId = getJobIdentifier(job)
      return jobId && !sentSet.has(jobId)
    })
    infoLog(`[VIP JSON CACHE] ${lid}: ${available.length} vagas disponíveis (de ${jsonCache.totalCompatible} compatíveis)`)
    return available
  }

  // SEGUNDA VERIFICAÇÃO: Tenta usar cache em memória
  const cached = vipCompatibleJobsCache.get(lid)
  if (cached && now - cached.timestamp < VIP_CACHE_TTL) {
    // Filtra vagas já enviadas (atualiza em tempo real)
    const available = cached.jobs.filter(job => {
      const jobId = getJobIdentifier(job)
      return jobId && !sentJobIds.has(jobId)
    })
    infoLog(`[VIP CACHE] ${lid}: ${available.length} vagas disponíveis (de ${cached.jobs.length} compatíveis)`)
    return available
  }

  // TERCEIRA OPÇÃO: Calcula vagas compatíveis e salva em ambos os caches
  const allJobs = await getAllJobsFromCache()

  infoLog(`[VIP CACHE] ${lid}: Calculando vagas compatíveis (primeira consulta)...`)
  const compatibleJobs = []

  for (const job of allJobs) {
    const jobId = getJobIdentifier(job)
    if (!jobId) continue

    const result = jobMatchesFilters(job, filters, true)
    if (result.match) {
      // matchScore = porcentagem real (0-100), nao a pontuacao bruta.
      // result.score e a soma ponderada crua; dividir por maxScore normaliza
      // perfis com pesos/criterios diferentes para a mesma escala 0-100%.
      const pct = result.maxScore > 0
        ? Math.round((result.score / result.maxScore) * 100)
        : 0
      compatibleJobs.push({
        ...job,
        matchScore: pct
      })
    }
  }

  // Ordena por score (mais relevantes primeiro)
  compatibleJobs.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))

  // Salva no cache em memória
  vipCompatibleJobsCache.set(lid, {
    jobs: compatibleJobs,
    timestamp: now
  })

  // NOVO: Salva no arquivo JSON (persistido)
  const sentJobIdsArray = Array.from(sentJobIds)
  await generateVipJobsCache(lid, subscriberName, filters, compatibleJobs, sentJobIdsArray)

  // Filtra vagas já enviadas
  const available = compatibleJobs.filter(job => {
    const jobId = getJobIdentifier(job)
    return jobId && !sentJobIds.has(jobId)
  })

  successLog(`[VIP CACHE] ${lid}: ${compatibleJobs.length} vagas compatíveis encontradas e salvas em JSON, ${available.length} disponíveis para envio`)
  return available
}

/**
 * Obtém a próxima vaga para enviar a um VIP
 * @param {string} lid - LID do assinante
 * @param {Object} filters - Filtros do assinante
 * @param {Set} sentJobIds - IDs de vagas já enviadas
 * @param {string} subscriberName - Nome do assinante (opcional)
 * @returns {Promise<Object|null>} Próxima vaga ou null se não houver
 */
async function getNextJobForVip(lid, filters, sentJobIds, subscriberName = null) {
  const availableJobs = await getCompatibleJobsForVip(lid, filters, sentJobIds, subscriberName)

  if (availableJobs.length === 0) {
    return null
  }

  // Retorna a primeira vaga disponível (mais relevante pelo score)
  return availableJobs[0]
}

/**
 * Executa cleanup de registros antigos (uma vez por dia)
 * Remove histórico de entregas antigas e caches JSON expirados
 */
async function maybeRunCleanup() {
  const now = Date.now()

  // Só executa se passou 24h desde o último cleanup
  if (now - lastCleanupTimestamp < CLEANUP_INTERVAL) {
    return
  }

  try {
    infoLog("[CLEANUP] Iniciando limpeza de registros antigos...")
    const result = await runFullCleanup()

    // Limpa caches JSON expirados
    const expiredCaches = await cleanExpiredVipCaches()

    lastCleanupTimestamp = now

    if (result.vip > 0 || result.group > 0 || expiredCaches > 0) {
      successLog(`[CLEANUP] Limpeza concluída: ${result.vip} registros VIP, ${result.group} registros de grupo, ${expiredCaches} caches JSON removidos`)
    } else {
      infoLog("[CLEANUP] Nenhum registro antigo para remover")
    }
  } catch (err) {
    errorLog(`[CLEANUP] Erro na limpeza: ${err.message}`)
  }
}

function createCorrelationId(prefix) {
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}

function queueVipSearch(lid, filters) {
  pendingVipSearches.set(lid, { filters, queuedAt: Date.now() })
}

async function processPendingVipSearches() {
  if (pendingVipSearches.size === 0) {
    return
  }

  for (const [lid, data] of pendingVipSearches.entries()) {
    const result = await triggerVipSearch(lid, data.filters, { allowQueue: false })

    if (result.success && (result.jobsFound === 0 || result.jobsSent > 0)) {
      pendingVipSearches.delete(lid)
    }

    await delay(1000)
  }
}

function normalizeLimit(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined
}

function normalizeLookbackDays(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function getCreatedAfterISO(lookbackDays) {
  if (!lookbackDays || lookbackDays <= 0) {
    return null
  }
  return new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Carrega as vagas direto do Supabase
 * @returns {Promise<Array>} Array de vagas
 */
async function loadJobs(options = {}) {
  try {
    const lookbackDays = normalizeLookbackDays(options.lookbackDays ?? VIP_JOB_LOOKBACK_DAYS)
    const limit = normalizeLimit(options.limit ?? VIP_MAX_JOBS_PER_CYCLE)
    const createdAfter = getCreatedAfterISO(lookbackDays)
    const jobs = await getAllJobs({ limit, createdAfter })
    return jobs || []
  } catch (err) {
    errorLog(`[VIP] Erro ao carregar vagas do Supabase: ${err.message}`)
    return []
  }
}

/**
 * Normaliza uma stack para comparação
 * Trata variações como "estagio", "estágio", "Estágio", etc.
 * @param {string} stack
 * @returns {string}
 */
function normalizeStack(stack) {
  return normalizeText(stack)
}

const normalizedJobCache = new WeakMap()
let SYNONYMS_CACHE
let SEMANTIC_INFERENCES_CACHE
let TECHNOLOGY_GROUPS_CACHE
let COMMON_TYPOS_CACHE
let COUNTRY_KEYWORDS_CACHE
let SENIORITY_META_CACHE

function getNormalizedJobFields(job) {
  if (!job || typeof job !== "object") {
    return {
      title: "",
      description: "",
      url: "",
      source: "",
      company: "",
      text: "",
      location: "",
      workType: "",
      regime: ""
    }
  }

  const cached = normalizedJobCache.get(job)
  if (cached) {
    return cached
  }

  const title = normalizeStack(job.title || job.job_title || "")
  const description = normalizeStack(job.description || "")
  const url = normalizeStack(job.url || job.job_url || "")
  const source = normalizeStack(job.source || "")
  const company = normalizeStack(job.company || "")
  const location = normalizeStack(job.location || "")
  const workType = normalizeStack(job.work_type || "")
  const regime = normalizeStack(job.hiring_regime || "")
  const salary = normalizeStack(job.salary || "")
  // Concatena todos os campos disponíveis para melhorar matching (sem description no banco)
  const text = `${title} ${company} ${location} ${workType} ${regime} ${salary} ${source}`.trim()

  const normalized = {
    title,
    description,
    url,
    source,
    company,
    text,
    location,
    workType,
    regime
  }

  normalizedJobCache.set(job, normalized)
  return normalized
}

function getJobIdentifier(job) {
  if (!job) {
    return ""
  }
  const raw = job.id || job.url || job.job_url || ""
  return raw ? String(raw) : ""
}

function buildVipSearchSteps(baseLimit, baseLookbackDays, fallbackLimit) {
  const steps = []
  const normalizedBaseLimit = normalizeLimit(baseLimit)
  const normalizedFallbackLimit = normalizeLimit(fallbackLimit)
  const normalizedLookback = normalizeLookbackDays(baseLookbackDays)

  if (!normalizedBaseLimit) {
    steps.push({ limit: undefined, lookbackDays: normalizedLookback, label: "base_all" })
    if (normalizedLookback > 0 && normalizedFallbackLimit) {
      steps.push({ limit: normalizedFallbackLimit, lookbackDays: 0, label: "full_range" })
    }
    return steps
  }

  steps.push({ limit: normalizedBaseLimit, lookbackDays: normalizedLookback, label: "base" })

  if (normalizedFallbackLimit && normalizedFallbackLimit > normalizedBaseLimit) {
    let nextLimit = normalizedBaseLimit * 2
    while (nextLimit < normalizedFallbackLimit) {
      steps.push({ limit: nextLimit, lookbackDays: normalizedLookback, label: `limit_${nextLimit}` })
      nextLimit *= 2
    }
    steps.push({ limit: normalizedFallbackLimit, lookbackDays: normalizedLookback, label: `limit_${normalizedFallbackLimit}` })
  }

  if (normalizedLookback > 0 && normalizedFallbackLimit) {
    const fullRangeLabel = "full_range"
    steps.push({ limit: normalizedFallbackLimit, lookbackDays: 0, label: fullRangeLabel })
  }

  const seen = new Set()
  return steps.filter((step) => {
    const key = `${step.lookbackDays || 0}|${step.limit ?? "all"}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

async function getJobsForStep(step, cache) {
  const key = `${step.lookbackDays || 0}|${step.limit ?? "all"}`
  if (cache.has(key)) {
    return cache.get(key)
  }
  const jobs = await loadJobs({ limit: step.limit, lookbackDays: step.lookbackDays })
  cache.set(key, jobs || [])
  return jobs || []
}

function findFirstMatchingJob(jobs, filters, sentJobIds, checkedIds) {
  for (const job of jobs || []) {
    const jobId = getJobIdentifier(job)
    if (!jobId) {
      continue
    }
    if (checkedIds.has(jobId)) {
      continue
    }
    checkedIds.add(jobId)
    if (sentJobIds.has(jobId)) {
      continue
    }
    if (!jobMatchesFilters(job, filters)) {
      continue
    }
    return job
  }
  return null
}

function findMatchingJobsWithCount(jobs, filters, sentJobIds, checkedIds) {
  let firstMatch = null
  let count = 0

  for (const job of jobs || []) {
    const jobId = getJobIdentifier(job)
    if (!jobId) {
      continue
    }
    if (checkedIds.has(jobId)) {
      continue
    }
    checkedIds.add(jobId)
    if (sentJobIds.has(jobId)) {
      continue
    }
    if (!jobMatchesFilters(job, filters)) {
      continue
    }
    count += 1
    if (!firstMatch) {
      firstMatch = job
    }
  }

  return { firstMatch, count }
}

function createDiagnosticsTracker(label) {
  return {
    label,
    scanned: 0,
    matched: 0,
    skippedNoId: 0,
    skippedAlreadySent: 0,
    reasons: new Map()
  }
}

function recordDiagnosticReason(tracker, reason) {
  if (!tracker) return
  const key = reason || "unknown"
  tracker.reasons.set(key, (tracker.reasons.get(key) || 0) + 1)
}

function formatDiagnosticsSummary(tracker, lid, filters, extra = {}) {
  const totalFails = [...tracker.reasons.values()].reduce((sum, value) => sum + value, 0)
  const sorted = [...tracker.reasons.entries()].sort((a, b) => b[1] - a[1])
  const topReasons = sorted.slice(0, Math.max(1, VIP_DIAGNOSTIC_LOG_LIMIT))
  const reasonsText = topReasons
    .map(([reason, count]) => {
      const pct = totalFails > 0 ? ((count / totalFails) * 100).toFixed(1) : "0.0"
      return `${reason}=${count} (${pct}%)`
    })
    .join(" | ")

  const filterSummary = []
  if (filters?.roles?.length) filterSummary.push(`roles=${filters.roles.join(",")}`)
  if (filters?.stacks?.length) filterSummary.push(`stacks=${filters.stacks.join(",")}`)
  if (filters?.seniority?.length) filterSummary.push(`seniority=${filters.seniority.join(",")}`)
  if (filters?.locations?.length) filterSummary.push(`locations=${filters.locations.join(",")}`)
  if (filters?.workMode?.length) filterSummary.push(`workMode=${filters.workMode.join(",")}`)

  return [
    `[VIP DIAG]${extra.runId ? ` runId=${extra.runId}` : ""} ${lid} ${tracker.label}`,
    `scanned=${tracker.scanned}`,
    `matched=${tracker.matched}`,
    `skippedNoId=${tracker.skippedNoId}`,
    `skippedSent=${tracker.skippedAlreadySent}`,
    `filters=${filterSummary.join(";") || "none"}`,
    `top=${reasonsText || "no_fail_reasons"}`,
    extra.note ? `note=${extra.note}` : ""
  ].filter(Boolean).join(" | ")
}

async function scanJobsForMatch({
  filters,
  sentJobIds,
  checkedIds,
  pageSize,
  diagnostics,
  stopOnFirstMatch = true
}) {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 1000
  let cursorCreatedAt = null
  let cursorId = null
  let firstMatch = null
  let matchCount = 0

  while (true) {
    const jobs = await getAllJobs({ limit: safePageSize, cursorCreatedAt, cursorId })
    if (!jobs.length) {
      break
    }

    for (const job of jobs) {
      if (diagnostics) diagnostics.scanned += 1
      const jobId = getJobIdentifier(job)
      if (!jobId) {
        if (diagnostics) diagnostics.skippedNoId += 1
        continue
      }
      if (checkedIds.has(jobId)) {
        continue
      }
      checkedIds.add(jobId)
      if (sentJobIds.has(jobId)) {
        if (diagnostics) diagnostics.skippedAlreadySent += 1
        continue
      }

      const result = jobMatchesFilters(job, filters, true)
      if (result.match) {
        matchCount += 1
        if (diagnostics) diagnostics.matched += 1
        if (!firstMatch) {
          firstMatch = job
          if (stopOnFirstMatch) {
            return { firstMatch, matchCount, diagnostics }
          }
        }
      } else if (diagnostics) {
        const reason = result.details?.failReason || "score_below_threshold"
        recordDiagnosticReason(diagnostics, reason)
      }
    }

    if (jobs.length < safePageSize) {
      break
    }

    // Keyset pagination: usa o último job como cursor para a próxima página
    const lastJob = jobs[jobs.length - 1]
    cursorCreatedAt = lastJob.created_at
    cursorId = lastJob.id
  }

  return { firstMatch, matchCount, diagnostics }
}

/**
 * Verifica se a vaga corresponde aos filtros do assinante
 * Sistema INTELIGENTE de matching com:
 * - Threshold dinâmico (campos must = 100%, opcionais = flexível)
 * - Inferência semântica (Full Stack → backend + frontend)
 * - Tratamento especial para vagas 100% remotas
 * - Score graduado (exato > sinônimo > inferência)
 * - Filtro de idiomas funcional
 * - Fallback inteligente para maximizar matches
 *
 * @param {Object} job - Vaga
 * @param {Object} filters - Filtros do assinante
 * @returns {boolean|{match: boolean, score: number, details: Object}}
 */
// =====================================================
// Classificacao de AREA da vaga (gate de area).
// DevOps/Backend/Redes compartilham stack — sem trava de area um perfil
// de Redes recebe vaga de Developer. A area vem do TITULO (sinal confiavel).
// =====================================================
const AREA_KEYWORDS = {
  fullstack: ["fullstack", "full stack", "full-stack"],
  frontend: ["frontend", "front-end", "front end", "desenvolvedor front", "dev front"],
  backend: ["backend", "back-end", "back end", "desenvolvedor back", "dev back"],
  mobile: ["mobile", "android", "ios", "flutter", "react native", "desenvolvedor mobile"],
  design: ["design", "designer", "ux", "ui", "ux/ui", "ui/ux", "product designer", "ux designer", "ui designer", "ux research", "ux writer", "figma"],
  dados: ["dados", "data engineer", "data scientist", "cientista de dados", "engenheiro de dados", "analista de dados", "machine learning", "analytics", "business intelligence", "big data", "data analyst", "engenheiro de ml", "bi", "inteligencia artificial"],
  devops: ["devops", "sre", "site reliability", "platform engineer", "engenheiro de plataforma", "cloud engineer", "cloud"],
  infra: ["redes", "network", "networking", "infraestrutura", "cisco", "ccna", "ccnp", "noc", "datacenter", "data center"],
  qa: ["qa", "quality assurance", "analista de teste", "analista de testes", "engenheiro de teste", "sdet", "automacao de testes", "quality engineer", "teste de software", "qa engineer"],
  seguranca: ["seguranca", "security", "cybersecurity", "ciberseguranca", "pentest", "appsec", "analista de seguranca", "soc"],
  automacao: ["automacao", "rpa", "automation", "uipath", "automation anywhere", "power automate", "blue prism", "low-code", "no-code", "low code", "no code"],
  produto: ["produto", "product manager", "product owner", "gerente de produto", "gestor de produto", "analista de produto", "scrum master", "agilista", "agile coach", "product ops"],
  suporte: ["suporte", "helpdesk", "help desk", "service desk", "tecnico de ti", "analista de suporte", "suporte tecnico"]
}

// Cargos de gestao: nao recebem o default junior/pleno quando o titulo
// nao traz nivel explicito (uma gerencia nao eh vaga de entrada).
const MANAGEMENT_KEYWORDS = [
  "gerente", "gestor", "gestao", "coordenador", "coordenacao", "head",
  "diretor", "supervisor", "manager", "chefe", "lider", "lider tecnico"
]

function areaKeywordHit(text, keyword) {
  const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(text)
}

/**
 * Classifica a area de uma vaga pelo titulo. Retorna Set de areas canonicas
 * (pode ser vazio quando o titulo nao deixa claro).
 */
function classifyJobAreas(title) {
  const text = (title || "").toString().toLowerCase()
  const areas = new Set()
  if (!text) return areas
  for (const [area, kws] of Object.entries(AREA_KEYWORDS)) {
    if (kws.some((kw) => areaKeywordHit(text, kw))) areas.add(area)
  }
  // Fullstack engloba backend e frontend.
  if (areas.has("fullstack")) {
    areas.add("backend")
    areas.add("frontend")
  }
  return areas
}

/**
 * Expande as areas pedidas: quem aceita fullstack tambem aceita vaga pura
 * de backend e de frontend.
 */
function expandAreas(areas) {
  const set = new Set(
    (Array.isArray(areas) ? areas : [])
      .map((a) => String(a).toLowerCase().trim())
      .filter(Boolean)
  )
  if (set.has("fullstack")) {
    set.add("backend")
    set.add("frontend")
  }
  return [...set]
}

function jobMatchesFilters(job, filters, returnScore = false) {
  // Se não tem filtros, aceita tudo (fallback inteligente)
  if (!filters || Object.keys(filters).length === 0) {
    return returnScore ? { match: true, score: 100, maxScore: 100, percentage: "100.0", details: { reason: "no_filters" } } : true
  }

  const normalizedJob = getNormalizedJobFields(job)
  const jobTitle = normalizedJob.title
  const jobDescription = normalizedJob.description
  const jobText = normalizedJob.text
  // jobCoreText usa jobText que já inclui todos os campos (sem description no banco)
  const jobCoreText = jobText || jobTitle
  const jobLocation = normalizedJob.location
  const jobWorkType = normalizedJob.workType
  const jobRegime = normalizedJob.regime

  // Pesos padrão para cada categoria
  const weights = filters.weights || {
    roles: 20,
    stacks: 30,
    seniority: 15,
    locations: 10,
    workMode: 10,
    contract: 10,
    languages: 5
  }

  // Campos obrigatórios (must match)
  // stacks: false por padrão para ser mais flexível (sem description no banco)
  const must = filters.must || {
    roles: false,
    stacks: false,
    workMode: false,
    contract: false,
    languages: false,
    locations: false,
    seniority: false
  }

  // ═══════════════════════════════════════════════════════════════
  // SINÔNIMOS EXPANDIDOS + MÁXIMA COBERTURA
  // Sistema inteligente para nunca perder uma vaga relevante
  // ═══════════════════════════════════════════════════════════════
  const synonyms = SYNONYMS_CACHE || (SYNONYMS_CACHE = {
    // ─────────────────────────────────────────────────────────────
    // SENIORITY - Todos os níveis e variações
    // ─────────────────────────────────────────────────────────────
    seniority: {
      "junior": ["junior", "jr", "jr.", "júnior", "nivel i", "nivel 1", "n1", "entry level", "entry-level", "iniciante", "associate", "i", "level 1", "l1", "p1", "grade 1", "g1", "beginning", "beginner", "novato", "junior i", "junior ii"],
      "pleno": ["pleno", "pl", "pl.", "mid", "mid-level", "middle", "nivel ii", "nivel 2", "n2", "intermediario", "ii", "level 2", "l2", "p2", "grade 2", "g2", "regular", "mid-senior", "semi-senior", "semi senior", "pleno i", "pleno ii", "pleno iii"],
      "senior": ["senior", "sr", "sr.", "sênior", "especialista", "nivel iii", "nivel 3", "n3", "expert", "iii", "level 3", "l3", "p3", "grade 3", "g3", "iv", "l4", "p4", "senior i", "senior ii", "senior iii", "avancado", "advanced", "experienced"],
      "lead": ["lead", "tech lead", "technical lead", "team lead", "lead developer", "lead engineer", "engineering lead", "squad lead", "lider tecnico", "líder técnico", "liderança", "lideranca"],
      "staff": ["staff", "staff engineer", "staff developer", "l5", "p5", "level 5", "distinguished", "principal engineer", "principal", "fellow", "distinguished engineer", "staff software engineer"],
      "estagio": ["estagio", "estágio", "intern", "internship", "estagiario", "estagiária", "estagiario(a)", "summer intern", "intern developer"],
      "trainee": ["trainee", "aprendiz", "jovem aprendiz", "menor aprendiz", "apprentice", "graduate", "graduate program", "programa trainee"]
    },
    // ─────────────────────────────────────────────────────────────
    // WORK MODE - Modalidades de trabalho
    // ─────────────────────────────────────────────────────────────
    workMode: {
      "remoto": ["remoto", "remote", "home office", "trabalho remoto", "100% remoto", "anywhere", "full remote", "fully remote", "trabalho de casa", "wfh", "work from home", "a distancia", "remote first", "remote only", "worldwide", "global remote", "remote friendly", "distributed", "anywhere in"],
      "hibrido": ["hibrido", "híbrido", "hybrid", "semi-presencial", "semi presencial", "parcialmente remoto", "flexivel", "flexible", "2x presencial", "3x presencial", "4x presencial", "dias no escritorio", "part remote", "partial remote", "hybrid remote"],
      "presencial": ["presencial", "on-site", "onsite", "in-office", "no escritorio", "local", "in loco", "alocado", "office based", "office-based", "in person", "in-person", "at office"]
    },
    // ─────────────────────────────────────────────────────────────
    // CONTRACT - Tipos de contrato (Brasil + Internacional)
    // ─────────────────────────────────────────────────────────────
    contract: {
      "clt": ["clt", "efetivo", "carteira assinada", "regime clt", "contratacao clt", "clt flex", "contrato clt", "celetista", "full-time", "full time", "permanent", "permanente", "integral"],
      "pj": ["pj", "pessoa juridica", "pessoa jurídica", "freelance", "contractor", "contrato pj", "mei", "cnpj", "cooperado", "cooperativa", "autonomo", "autônomo", "prestador", "consultant", "consultoria", "self-employed", "independent contractor", "1099"],
      "estagio": ["estagio", "estágio", "intern", "internship", "contrato de estagio", "contrato estagio", "bolsa", "bolsista"],
      "temporario": ["temporario", "temporário", "temporary", "contract", "contrato temporario", "prazo determinado", "fixed term", "short term", "project based"],
      "terceirizado": ["terceirizado", "outsourcing", "outsourced", "alocado", "alocacao", "body shop", "staffing", "staff augmentation"]
    },
    // ─────────────────────────────────────────────────────────────
    // STACKS - Tecnologias (MASSIVAMENTE EXPANDIDO)
    // ─────────────────────────────────────────────────────────────
    stacks: {
      // Categorias gerais
      "frontend": ["frontend", "front-end", "front end", "client-side", "client side", "ui developer"],
      "backend": ["backend", "back-end", "back end", "server-side", "server side", "api developer"],
      "fullstack": ["fullstack", "full-stack", "full stack", "full-stack developer", "desenvolvedor fullstack", "generalista"],

      // Mobile
      "mobile": ["mobile", "android", "ios", "flutter", "react native", "mobile developer", "app", "aplicativo", "nativo", "native"],
      "ios": ["ios", "swift", "swiftui", "uikit", "objective-c", "objc", "xcode", "apple developer", "iphone", "ipad"],
      "android": ["android", "kotlin", "jetpack compose", "android studio", "google play", "android developer"],
      "flutter": ["flutter", "dart", "cross-platform", "cross platform"],
      "reactnative": ["react native", "react-native", "expo", "rn"],

      // JavaScript ecosystem
      "javascript": ["javascript", "js", "ecmascript", "es6", "es2020", "es2021", "es2022", "es2023", "vanilla js", "vanilla javascript"],
      "typescript": ["typescript", "ts", "typed javascript"],
      "node": ["node", "nodejs", "node.js", "express", "expressjs", "nestjs", "nest.js", "koa", "fastify", "hapi", "adonis", "adonisjs"],
      "react": ["react", "reactjs", "react.js", "next", "nextjs", "next.js", "redux", "react query", "tanstack", "remix", "gatsby", "create react app", "cra"],
      "angular": ["angular", "angularjs", "angular.js", "ngrx", "rxjs", "angular material"],
      "vue": ["vue", "vuejs", "vue.js", "nuxt", "nuxtjs", "vuex", "pinia", "vue router", "quasar"],
      "svelte": ["svelte", "sveltekit", "svelte kit"],

      // Python ecosystem
      "python": ["python", "django", "flask", "fastapi", "pandas", "numpy", "pytorch", "tensorflow", "scikit", "scikit-learn", "scipy", "matplotlib", "jupyter", "anaconda", "pip"],

      // Java ecosystem
      "java": ["java", "spring", "springboot", "spring boot", "maven", "gradle", "quarkus", "micronaut", "jvm", "jakarta", "hibernate", "jpa"],
      "spring": ["spring", "springboot", "spring boot", "spring framework", "spring cloud", "spring security", "spring data", "spring mvc", "spring webflux"],
      "kotlin": ["kotlin", "kotlinx", "ktor", "android kotlin", "kotlin multiplatform", "kmp"],
      "scala": ["scala", "akka", "play framework", "playframework", "spark scala", "cats", "zio"],

      // .NET ecosystem
      "csharp": ["c#", "csharp", ".net", "dotnet", "asp.net", "blazor", ".net core", "entity framework", "ef core", ".net 6", ".net 7", ".net 8", "maui", "xamarin", "wpf", "winforms"],

      // Other languages
      "go": ["go", "golang", "gin", "fiber", "echo", "gorilla", "beego"],
      "rust": ["rust", "rustlang", "actix", "axum", "rocket", "tokio", "wasm", "webassembly"],
      "php": ["php", "laravel", "symfony", "wordpress", "codeigniter", "yii", "drupal", "magento", "composer"],
      "ruby": ["ruby", "rails", "ruby on rails", "ror", "sinatra", "hanami"],
      "elixir": ["elixir", "phoenix", "ecto", "erlang", "otp", "beam"],
      "clojure": ["clojure", "clojurescript", "leiningen", "ring"],

      // Databases
      "sql": ["sql", "mysql", "postgresql", "postgres", "oracle", "sql server", "mssql", "database", "banco de dados", "mariadb", "sqlite", "rdbms", "relational"],
      "nosql": ["nosql", "mongodb", "mongo", "redis", "cassandra", "dynamodb", "couchdb", "firestore", "fauna", "faunadb"],
      "mongodb": ["mongodb", "mongo", "mongoose", "atlas"],
      "postgresql": ["postgresql", "postgres", "pg", "postgis"],
      "redis": ["redis", "memcached", "cache", "caching"],
      "elasticsearch": ["elasticsearch", "elastic", "opensearch", "lucene", "solr"],
      "neo4j": ["neo4j", "graph database", "graphdb", "cypher", "dgraph"],

      // DevOps & Cloud
      "devops": ["devops", "dev ops", "sre", "site reliability", "platform", "infrastructure", "infra", "devsecops"],
      "aws": ["aws", "amazon web services", "ec2", "s3", "lambda", "dynamodb", "rds", "cloudformation", "cdk", "eks", "ecs", "fargate", "sagemaker", "redshift"],
      "azure": ["azure", "microsoft azure", "azure devops", "azure functions", "aks", "cosmos db", "azure sql", "blob storage"],
      "gcp": ["gcp", "google cloud", "google cloud platform", "bigquery", "cloud run", "cloud functions", "gke", "dataflow", "pubsub"],
      "kubernetes": ["kubernetes", "k8s", "kube", "eks", "aks", "gke", "openshift", "helm", "kubectl", "k3s", "rancher"],
      "docker": ["docker", "container", "containerization", "dockerfile", "docker-compose", "docker compose", "podman", "containerd"],
      "terraform": ["terraform", "tf", "iac", "infrastructure as code", "terragrunt", "pulumi", "cloudformation"],
      "cicd": ["ci/cd", "cicd", "github actions", "gitlab ci", "jenkins", "circleci", "travis", "azure pipelines", "bitbucket pipelines", "drone", "argocd", "argo cd", "gitops"],
      "ansible": ["ansible", "playbook", "puppet", "chef", "saltstack"],

      // Monitoring & Observability
      "monitoring": ["prometheus", "grafana", "datadog", "newrelic", "new relic", "splunk", "dynatrace", "observability", "apm", "elk", "logstash", "kibana"],

      // Data & Analytics
      "data": ["data", "dados", "data science", "data engineer", "cientista de dados", "machine learning", "ml", "ai", "big data", "analytics", "bi", "etl", "dataops", "spark", "hadoop", "databricks", "snowflake", "dbt", "airflow"],
      "machinelearning": ["machine learning", "ml", "deep learning", "neural network", "ai", "artificial intelligence", "nlp", "computer vision", "reinforcement learning"],
      "llm": ["llm", "large language model", "chatgpt", "openai", "claude", "gpt", "langchain", "huggingface", "transformers", "genai", "gen ai", "generative ai", "prompt engineering"],

      // QA & Testing
      "qa": ["qa", "quality", "teste", "tester", "testing", "qualidade", "automacao", "quality assurance", "sdet", "test engineer", "test automation"],
      "testing": ["jest", "vitest", "cypress", "playwright", "selenium", "webdriver", "pytest", "junit", "testng", "mocha", "chai", "jasmine", "karma", "e2e", "unit test", "integration test"],

      // Design
      "design": ["design", "designer", "ux", "ui", "ux/ui", "ui/ux", "product design", "grafico", "figma", "sketch", "adobe xd", "invision", "zeplin", "framer"],

      // APIs & Communication
      "api": ["api", "rest", "restful", "graphql", "grpc", "soap", "openapi", "swagger", "postman", "insomnia"],
      "graphql": ["graphql", "apollo", "hasura", "relay", "graph ql"],
      "websocket": ["websocket", "socket.io", "ws", "real-time", "realtime", "sse", "server-sent events"],
      "kafka": ["kafka", "apache kafka", "confluent", "event streaming", "event-driven"],
      "rabbitmq": ["rabbitmq", "rabbit mq", "amqp", "message queue", "message broker"],

      // Specialty stacks
      "blockchain": ["blockchain", "web3", "solidity", "ethereum", "smart contract", "crypto", "defi", "nft", "hardhat", "truffle"],
      "gamedev": ["unity", "unity3d", "unreal", "unreal engine", "ue4", "ue5", "game dev", "game development", "godot", "c++ games"],
      "embedded": ["embedded", "iot", "arduino", "raspberry pi", "firmware", "rtos", "microcontroller", "plc"],
      "security": ["security", "cybersecurity", "infosec", "appsec", "pentesting", "penetration testing", "soc", "siem", "owasp"],

      // Low-code / No-code
      "lowcode": ["n8n", "make", "integromat", "zapier", "power automate", "appsmith", "retool", "budibase", "webflow", "bubble", "airtable"],

      // Enterprise
      "salesforce": ["salesforce", "sfdc", "apex", "lightning", "salesforce developer"],
      "sap": ["sap", "abap", "hana", "sap developer", "sap consultant"]
    },
    // ─────────────────────────────────────────────────────────────
    // ROLES - Cargos e funções (EXPANDIDO)
    // ─────────────────────────────────────────────────────────────
    roles: {
      "desenvolvedor": ["desenvolvedor", "developer", "dev", "programador", "engineer", "engenheiro", "software engineer", "software developer", "swe", "coder", "programmer"],
      "analista": ["analista", "analyst", "analista de sistemas", "systems analyst", "analista de ti", "it analyst", "analista de desenvolvimento"],
      "tech lead": ["tech lead", "lider tecnico", "lider de tecnologia", "technical lead", "lead developer", "lead engineer", "engineering lead", "team lead", "squad lead"],
      "arquiteto": ["arquiteto", "architect", "solution architect", "software architect", "solutions architect", "cloud architect", "enterprise architect", "system architect"],
      "gerente": ["gerente", "manager", "coordenador", "head", "diretor", "supervisor", "engineering manager", "em", "head of engineering", "development manager"],
      "backend": ["backend", "back-end", "back end", "desenvolvedor backend", "backend developer", "backend engineer", "server-side developer"],
      "frontend": ["frontend", "front-end", "front end", "desenvolvedor frontend", "frontend developer", "frontend engineer", "ui developer", "web developer"],
      "fullstack": ["fullstack", "full-stack", "full stack", "desenvolvedor fullstack", "fullstack developer", "fullstack engineer"],
      "mobile": ["mobile developer", "desenvolvedor mobile", "mobile engineer", "app developer", "ios developer", "android developer"],
      "product": ["product manager", "pm", "product owner", "po", "gerente de produto", "product lead"],
      "devops": ["devops engineer", "sre", "platform engineer", "infrastructure engineer", "cloud engineer", "reliability engineer", "site reliability engineer"],
      "data_scientist": ["data scientist", "cientista de dados", "ml engineer", "machine learning engineer", "ai engineer", "research scientist", "pesquisador", "research engineer"],
      "data_engineer": ["data engineer", "engenheiro de dados", "analytics engineer", "bi developer", "etl developer", "dataops engineer", "data platform engineer"],
      "security": ["security engineer", "appsec", "infosec", "cybersecurity engineer", "security analyst", "soc analyst", "devsecops", "pentester", "engenheiro de seguranca"],
      "ux_designer": ["ux designer", "ui designer", "product designer", "designer de produto", "ux researcher", "ui/ux designer", "ux/ui designer", "interaction designer"],
      "scrum": ["scrum master", "agile coach", "agile master", "kanban master", "delivery manager"],
      "executive": ["cto", "vp engineering", "vpe", "engineering director", "head of engineering", "chief architect", "cio", "tech director", "diretor de tecnologia"]
    },
    // ─────────────────────────────────────────────────────────────
    // LANGUAGES - Idiomas (COMPLETO)
    // ─────────────────────────────────────────────────────────────
    languages: {
      "pt": ["portugues", "portuguese", "pt-br", "pt_br", "brasil", "brasileiro", "fluente portugues", "nativo portugues", "portuguese native", "portuguese fluent", "lingua portuguesa"],
      "en": ["ingles", "english", "en-us", "en_us", "fluent english", "inglês fluente", "english native", "inglês nativo", "intermediate english", "ingles intermediario", "advanced english", "ingles avancado", "conversational english"],
      "es": ["espanhol", "spanish", "español", "castellano", "espanol", "spanish fluent"],
      "fr": ["frances", "french", "français", "francais", "francês"],
      "de": ["alemao", "german", "deutsch", "alemão", "deutsche"],
      "it": ["italiano", "italian", "italiana"],
      "zh": ["chines", "chinese", "mandarin", "mandarim", "中文", "putonghua"],
      "ja": ["japones", "japanese", "日本語", "nihongo", "japonês"],
      "ko": ["coreano", "korean", "한국어", "hangul"]
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // INFERÊNCIAS SEMÂNTICAS - MASSIVAMENTE EXPANDIDO
  // Mapeia frameworks/ferramentas para tecnologias base
  // ═══════════════════════════════════════════════════════════════
  const semanticInferences = SEMANTIC_INFERENCES_CACHE || (SEMANTIC_INFERENCES_CACHE = {
    // Full Stack
    "fullstack": ["backend", "frontend"],
    "full-stack": ["backend", "frontend"],
    "full stack": ["backend", "frontend"],
    "mern": ["mongodb", "express", "react", "node", "javascript"],
    "mean": ["mongodb", "express", "angular", "node", "javascript"],
    "lamp": ["linux", "apache", "mysql", "php"],
    "jamstack": ["javascript", "api", "frontend"],

    // Java ecosystem
    "spring": ["java"],
    "springboot": ["java"],
    "spring boot": ["java"],
    "quarkus": ["java"],
    "micronaut": ["java"],
    "hibernate": ["java", "sql"],
    "maven": ["java"],
    "gradle": ["java", "kotlin"],

    // Python ecosystem
    "django": ["python"],
    "flask": ["python"],
    "fastapi": ["python"],
    "pandas": ["python", "data"],
    "numpy": ["python", "data"],
    "pytorch": ["python", "machine learning"],
    "tensorflow": ["python", "machine learning"],
    "scikit": ["python", "machine learning"],
    "airflow": ["python", "data", "etl"],
    "sqlalchemy": ["python", "database"],

    // JavaScript/Node ecosystem
    "react native": ["javascript", "mobile", "react"],
    "next.js": ["react", "javascript", "typescript"],
    "nextjs": ["react", "javascript", "typescript"],
    "gatsby": ["react", "javascript", "graphql"],
    "remix": ["react", "javascript", "typescript"],
    "nuxt": ["vue", "javascript"],
    "nuxtjs": ["vue", "javascript"],
    "nestjs": ["node", "typescript"],
    "express": ["node", "javascript"],
    "fastify": ["node", "javascript"],
    "koa": ["node", "javascript"],
    "prisma": ["typescript", "node", "database"],
    "typeorm": ["typescript", "node", "database"],
    "sequelize": ["javascript", "node", "database"],
    "mongoose": ["javascript", "node", "mongodb"],

    // Frontend
    "angular": ["typescript", "frontend"],
    "vue": ["javascript", "frontend"],
    "svelte": ["javascript", "frontend"],
    "sveltekit": ["javascript", "typescript", "frontend"],
    "vite": ["javascript", "typescript", "frontend"],
    "webpack": ["javascript", "frontend"],

    // Mobile
    "flutter": ["mobile", "dart"],
    "expo": ["react native", "javascript", "mobile"],
    "swiftui": ["swift", "ios", "mobile"],
    "jetpack compose": ["kotlin", "android", "mobile"],
    "xamarin": ["csharp", "mobile"],

    // .NET ecosystem
    ".net": ["csharp"],
    "blazor": ["csharp", "frontend"],
    "asp.net": ["csharp"],
    "entity framework": ["csharp", "database"],
    "maui": ["csharp", "mobile"],

    // Ruby ecosystem
    "rails": ["ruby"],
    "ruby on rails": ["ruby"],
    "sinatra": ["ruby"],

    // PHP ecosystem
    "laravel": ["php"],
    "symfony": ["php"],
    "wordpress": ["php"],
    "eloquent": ["php", "laravel", "database"],

    // Go ecosystem
    "gin": ["go"],
    "fiber": ["go"],
    "echo": ["go"],

    // Rust ecosystem
    "actix": ["rust"],
    "axum": ["rust"],
    "rocket": ["rust"],
    "tokio": ["rust"],

    // Elixir/Erlang
    "phoenix": ["elixir"],
    "ecto": ["elixir", "database"],

    // Kotlin
    "ktor": ["kotlin"],

    // DevOps & Cloud
    "terraform": ["devops", "infrastructure", "cloud"],
    "kubernetes": ["devops", "docker", "cloud"],
    "k8s": ["devops", "docker", "cloud", "kubernetes"],
    "docker": ["devops", "infrastructure"],
    "aws": ["cloud", "devops"],
    "azure": ["cloud", "devops"],
    "gcp": ["cloud", "devops"],
    "github actions": ["devops", "cicd"],
    "gitlab ci": ["devops", "cicd"],
    "jenkins": ["devops", "cicd"],
    "argocd": ["devops", "kubernetes", "gitops"],
    "helm": ["kubernetes", "devops"],

    // Data & AI
    "spark": ["data", "big data", "python", "scala"],
    "hadoop": ["data", "big data"],
    "databricks": ["data", "spark", "cloud"],
    "snowflake": ["data", "sql", "cloud"],
    "dbt": ["data", "analytics", "sql"],
    "bigquery": ["data", "sql", "gcp"],
    "redshift": ["data", "sql", "aws"],
    "langchain": ["python", "ai", "llm"],
    "huggingface": ["python", "machine learning", "ai"],

    // Testing
    "jest": ["javascript", "testing"],
    "vitest": ["javascript", "typescript", "testing"],
    "cypress": ["javascript", "testing", "e2e"],
    "playwright": ["javascript", "typescript", "testing", "e2e"],
    "pytest": ["python", "testing"],
    "junit": ["java", "testing"],
    "rspec": ["ruby", "testing"],
    "selenium": ["testing", "e2e", "qa"],

    // APIs
    "graphql": ["api"],
    "apollo": ["graphql", "javascript"],
    "hasura": ["graphql", "database"],

    // Databases
    "mongodb": ["nosql", "database"],
    "postgresql": ["sql", "database"],
    "mysql": ["sql", "database"],
    "redis": ["nosql", "cache", "database"],
    "elasticsearch": ["search", "database"],
    "neo4j": ["graph", "database"],
    "dynamodb": ["nosql", "aws", "database"],
    "cosmos db": ["nosql", "azure", "database"],

    // Message queues
    "kafka": ["event-driven", "messaging"],
    "rabbitmq": ["messaging", "queue"]
  })

  // ═══════════════════════════════════════════════════════════════
  // GRUPOS DE TECNOLOGIAS - Para matching por categoria
  // ═══════════════════════════════════════════════════════════════
  const technologyGroups = TECHNOLOGY_GROUPS_CACHE || (TECHNOLOGY_GROUPS_CACHE = {
    "relational_db": ["sql", "mysql", "postgresql", "postgres", "oracle", "sql server", "mariadb", "sqlite"],
    "nosql_db": ["mongodb", "cassandra", "dynamodb", "couchdb", "redis", "firestore", "fauna"],
    "cloud": ["aws", "azure", "gcp", "digitalocean", "heroku", "vercel", "netlify"],
    "containers": ["docker", "kubernetes", "podman", "containerd"],
    "cicd": ["github actions", "gitlab ci", "jenkins", "circleci", "travis", "azure devops"],
    "monitoring": ["prometheus", "grafana", "datadog", "newrelic", "splunk", "elastic"],
    "frontend_framework": ["react", "angular", "vue", "svelte", "solid"],
    "backend_lang": ["java", "python", "node", "go", "rust", "php", "ruby", "csharp", "kotlin", "scala", "elixir"]
  })

  // ═══════════════════════════════════════════════════════════════
  // CORREÇÃO DE TYPOS COMUNS
  // ═══════════════════════════════════════════════════════════════
  const commonTypos = COMMON_TYPOS_CACHE || (COMMON_TYPOS_CACHE = {
    "javascrip": "javascript", "javasript": "javascript", "javscript": "javascript",
    "typescrip": "typescript", "typscript": "typescript",
    "phyton": "python", "pyhton": "python", "pytohn": "python",
    "developper": "developer", "develper": "developer",
    "desenvoledor": "desenvolvedor", "desenvolvedro": "desenvolvedor",
    "engenehiro": "engenheiro", "engenhero": "engenheiro",
    "seniro": "senior", "senir": "senior",
    "junio": "junior", "júnio": "junior",
    "postgress": "postgresql", "postgressql": "postgresql",
    "kubernets": "kubernetes", "kubernates": "kubernetes",
    "angualr": "angular", "anglar": "angular",
    "recat": "react", "raect": "react"
  })

  // ═══════════════════════════════════════════════════════════════
  // DETECÇÃO INTELIGENTE DE PAÍS
  // ═══════════════════════════════════════════════════════════════
  const countryKeywords = COUNTRY_KEYWORDS_CACHE || (COUNTRY_KEYWORDS_CACHE = {
    brasil: ["brasil", "brazil", "br", "sao paulo", "rio de janeiro", "belo horizonte", "curitiba", "porto alegre", "salvador", "recife", "fortaleza", "brasilia"],
    eua: ["usa", "eua", "estados unidos", "united states", "us", "new york", "california", "texas", "florida", "seattle", "san francisco", "silicon valley"],
    canada: ["canada", "canadá", "toronto", "vancouver", "montreal"],
    portugal: ["portugal", "pt", "lisboa", "porto"],
    alemanha: ["alemanha", "germany", "deutschland", "berlin", "munich", "frankfurt"],
    reino_unido: ["uk", "united kingdom", "reino unido", "england", "inglaterra", "london", "manchester"],
    espanha: ["espanha", "spain", "españa", "madrid", "barcelona"],
    franca: ["franca", "france", "frança", "paris", "lyon"],
    holanda: ["holanda", "netherlands", "paises baixos", "amsterdam", "rotterdam"],
    irlanda: ["irlanda", "ireland", "dublin"],
    argentina: ["argentina", "buenos aires"],
    chile: ["chile", "santiago"],
    mexico: ["mexico", "méxico", "ciudad de mexico"],
    colombia: ["colombia", "colômbia", "bogota", "medellin"],
    india: ["india", "índia", "bangalore", "mumbai", "delhi"],
    australia: ["australia", "austrália", "sydney", "melbourne"]
  })

  // ═══════════════════════════════════════════════════════════════
  // FUNÇÕES AUXILIARES
  // ═══════════════════════════════════════════════════════════════

  // Detecta país do usuário
  const getUserCountry = (locs) => {
    for (const loc of locs) {
      const normalized = normalizeTokensFromText(loc)
      for (const [country, keywords] of Object.entries(countryKeywords)) {
        if (keywords.some(kw => normalized.includes(kw) || kw.includes(normalized))) {
          return country
        }
      }
    }
    return null
  }

  // Detecta país da vaga
  const getJobCountry = (jobLoc) => {
    const normalized = normalizeTokensFromText(jobLoc)
    for (const [country, keywords] of Object.entries(countryKeywords)) {
      if (keywords.some(kw => normalized.includes(kw))) {
        return country
      }
    }
    return null
  }

  const userAcceptsWorkMode = (workModes, modeKey) => {
    if (!workModes || workModes.length === 0) {
      return true
    }
    const normalizedTargets = new Set([normalizeTokensFromText(modeKey)])
    const syns = synonyms.workMode?.[modeKey] || []
    syns.forEach((term) => {
      const normalizedTerm = normalizeTokensFromText(term)
      if (normalizedTerm) {
        normalizedTargets.add(normalizedTerm)
      }
    })

    return workModes.some((mode) => {
      const normalizedMode = normalizeTokensFromText(mode)
      return normalizedTargets.has(normalizedMode)
    })
  }

  // Verifica se a vaga é 100% remota
  const isFullyRemote = (workType, text) => {
    const remoteKeywords = ["100% remoto", "full remote", "fully remote", "remote anywhere", "worldwide remote", "global remote", "trabalho remoto", "remote first"]
    const combined = `${workType} ${text}`.toLowerCase()
    return remoteKeywords.some(kw => combined.includes(kw)) ||
           (combined.includes("remote") && !combined.includes("hybrid") && !combined.includes("hibrido"))
  }

  // Aplica correção de typos ao texto
  const fixTypos = (text) => {
    let fixed = text
    for (const [typo, correction] of Object.entries(commonTypos)) {
      if (fixed.includes(typo)) {
        fixed = fixed.replace(new RegExp(typo, 'g'), correction)
      }
    }
    return fixed
  }

  // Aplica inferências semânticas ao texto da vaga
  const applyInferences = (text) => {
    let expandedText = text
    for (const [term, implications] of Object.entries(semanticInferences)) {
      if (text.includes(term)) {
        expandedText += " " + implications.join(" ")
      }
    }
    return expandedText
  }

  // Verifica se o termo pertence a um grupo de tecnologias
  const getTermGroup = (term) => {
    for (const [groupName, members] of Object.entries(technologyGroups)) {
      if (members.includes(term)) {
        return { groupName, members }
      }
    }
    return null
  }

  // Função de match com scoring graduado
  // PESOS: exato=100%, synonym=90%, typo=85%, inference=75%, group=60%
  const checkMatchWithScore = (terms, text, synonymGroup, weight) => {
    if (!terms || terms.length === 0) return { matched: true, isEmpty: true, matchType: "none", score: 0 }

    // Aplica correção de typos ao texto da vaga
    const fixedText = fixTypos(text)
    const expandedText = applyInferences(fixedText)
    let bestMatch = { matched: false, isEmpty: false, matchType: "none", score: 0 }

    for (const term of terms) {
      const normalized = normalizeStack(term)
      const fixedNormalized = fixTypos(normalized)

      // 1. Match EXATO (100% do peso)
      if (fixedText.includes(normalized)) {
        return { matched: true, isEmpty: false, matchType: "exact", score: weight }
      }

      // 2. Match por SINÔNIMO (90% do peso)
      if (synonymGroup) {
        for (const [key, syns] of Object.entries(synonymGroup)) {
          if (normalized === key || syns.includes(normalized)) {
            if (syns.some(s => fixedText.includes(s))) {
              if (bestMatch.score < weight * 0.9) {
                bestMatch = { matched: true, isEmpty: false, matchType: "synonym", score: weight * 0.9 }
              }
            }
          }
        }
      }

      // 3. Match por CORREÇÃO DE TYPO (85% do peso)
      if (fixedNormalized !== normalized && fixedText.includes(fixedNormalized)) {
        if (bestMatch.score < weight * 0.85) {
          bestMatch = { matched: true, isEmpty: false, matchType: "typo_corrected", score: weight * 0.85 }
        }
      }

      // 4. Match por INFERÊNCIA SEMÂNTICA (75% do peso)
      if (expandedText.includes(normalized) && !fixedText.includes(normalized)) {
        if (bestMatch.score < weight * 0.75) {
          bestMatch = { matched: true, isEmpty: false, matchType: "inference", score: weight * 0.75 }
        }
      }

      // 5. Match por GRUPO de tecnologias (60% do peso)
      const group = getTermGroup(normalized)
      if (group && bestMatch.score < weight * 0.6) {
        const groupMatch = group.members.some(member => fixedText.includes(member))
        if (groupMatch) {
          bestMatch = { matched: true, isEmpty: false, matchType: "group", score: weight * 0.6, group: group.groupName }
        }
      }
    }

    return bestMatch
  }

  // Função de match simples (sem scoring)
  const checkMatch = (terms, text, synonymGroup) => {
    const result = checkMatchWithScore(terms, text, synonymGroup, 1)
    return { matched: result.matched, isEmpty: result.isEmpty }
  }

  const normalizeTokensFromTerm = (value) => {
    if (!value) {
      return []
    }
    return normalizeTokensFromText(value).split(" ").filter(Boolean)
  }

  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  const hasToken = (text, token) => {
    if (!token) {
      return false
    }
    const pattern = new RegExp(`\\b${escapeRegex(token)}\\b`, "i")
    return pattern.test(text)
  }

  const checkCompoundRoleMatch = (term, text, roleSynonyms, weight) => {
    const stopWords = new Set(["de", "da", "do", "das", "dos", "of", "the", "and", "e", "para", "por", "em", "no", "na"])
    const tokenAliases = {
      dados: ["dados", "data"],
      data: ["data", "dados"]
    }
    const tokens = normalizeTokensFromTerm(term).filter(token => !stopWords.has(token))

    if (tokens.length < 2) {
      return { matched: false, isEmpty: false, matchType: "compound", score: 0 }
    }

    const textTokens = normalizeTokensFromText(text)

    const tokenMatches = (token) => {
      const aliases = tokenAliases[token]
      if (aliases && aliases.some((alias) => hasToken(textTokens, alias))) {
        return true
      }
      if (hasToken(textTokens, token)) {
        return true
      }
      for (const [key, syns] of Object.entries(roleSynonyms || {})) {
        if (token === key || syns.includes(token)) {
          if (hasToken(textTokens, key)) {
            return true
          }
          if (syns.some((syn) => hasToken(textTokens, normalizeTokensFromText(syn)))) {
            return true
          }
        }
      }
      return false
    }

    const matchedAll = tokens.every(token => tokenMatches(token))
    return matchedAll
      ? { matched: true, isEmpty: false, matchType: "compound", score: weight * 0.8 }
      : { matched: false, isEmpty: false, matchType: "compound", score: 0 }
  }

  // Normaliza texto para detecção de senioridade (remove pontuação)
  const normalizeSeniorityText = (value) => {
    if (!value) {
      return ""
    }
    return normalizeStack(value).replace(/[^a-z0-9]+/g, " ").trim()
  }

  const buildSeniorityMeta = (syns) => {
    const ambiguousTokens = new Set(["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"])
    const keepShort = new Set(["jr", "sr"])

    const isAmbiguous = (term) => {
      if (!term) return true
      if (ambiguousTokens.has(term)) return true
      if (/^[lnpg]\d$/i.test(term)) return true
      if (term.length <= 1) return true
      if (term.length <= 2 && !keepShort.has(term)) return true
      return false
    }

    const normalizeTerms = (terms) => {
      const normalized = []
      for (const term of terms || []) {
        const normalizedTerm = normalizeSeniorityText(term)
        if (!normalizedTerm || isAmbiguous(normalizedTerm)) {
          continue
        }
        normalized.push(normalizedTerm)
      }
      return [...new Set(normalized)]
    }

    const senioritySyns = syns?.seniority || {}
    const levels = {
      estagio: { rank: 0, terms: normalizeTerms(senioritySyns.estagio) },
      trainee: { rank: 0, terms: normalizeTerms(senioritySyns.trainee) },
      junior: { rank: 1, terms: normalizeTerms(senioritySyns.junior) },
      pleno: { rank: 2, terms: normalizeTerms(senioritySyns.pleno) },
      senior: { rank: 3, terms: normalizeTerms(senioritySyns.senior) },
      lead: { rank: 4, terms: normalizeTerms(senioritySyns.lead) },
      staff: { rank: 4, terms: normalizeTerms(senioritySyns.staff) },
      manager: {
        rank: 5,
        terms: normalizeTerms([
          "manager", "gerente", "coordenador", "supervisor", "head", "director", "diretor",
          "vp", "vice president", "executive", "chief", "c-level", "cto", "cio", "cpo", "cfo", "ceo"
        ])
      }
    }

    const termToLevel = new Map()
    for (const [levelKey, levelData] of Object.entries(levels)) {
      const normalizedKey = normalizeSeniorityText(levelKey)
      if (normalizedKey) {
        termToLevel.set(normalizedKey, levelKey)
      }
      for (const term of levelData.terms) {
        termToLevel.set(term, levelKey)
      }
    }

    return { levels, termToLevel }
  }

  const extractSeniorityLevels = (text, seniorityMeta) => {
    const normalized = normalizeSeniorityText(text)
    if (!normalized) {
      return new Set()
    }
    const padded = ` ${normalized} `
    const found = new Set()
    for (const [term, level] of seniorityMeta.termToLevel.entries()) {
      if (padded.includes(` ${term} `)) {
        found.add(level)
      }
    }
    return found
  }

  const normalizeSeniorityFilters = (values, seniorityMeta) => {
    const normalizedLevels = new Set()
    for (const value of values || []) {
      const levels = extractSeniorityLevels(value, seniorityMeta)
      for (const level of levels) {
        normalizedLevels.add(level)
      }
    }
    return [...normalizedLevels]
  }

  // ═══════════════════════════════════════════════════════════════
  // LÓGICA DE MATCHING
  // ═══════════════════════════════════════════════════════════════

  let totalScore = 0
  let maxScore = 0
  let mustFieldsFailed = false
  const matchDetails = {}

  // ─────────────────────────────────────────────────────────────
  // 1. STACKS (peso: weights.stacks)
  // ─────────────────────────────────────────────────────────────
  const stacks = filters.stacks || []
  const stackText = jobCoreText || jobText
  if (stacks.length > 0) {
    maxScore += weights.stacks
    const stackResult = matchStacksWithScore(stacks, stackText, weights.stacks)
    matchDetails.stacks = stackResult

    if (stackResult.matched && !stackResult.isEmpty) {
      totalScore += stackResult.score
    } else if (must.stacks) {
      mustFieldsFailed = true
      matchDetails.failReason = stackResult.failReason || "stacks_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ROLES (peso: weights.roles)
  // ─────────────────────────────────────────────────────────────
  const roles = filters.roles || []
  const roleText = jobCoreText || jobText
  if (roles.length > 0) {
    maxScore += weights.roles
    let roleResult = checkMatchWithScore(roles, roleText, synonyms.roles, weights.roles)
    if (!roleResult.matched) {
      for (const roleTerm of roles) {
        const compoundResult = checkCompoundRoleMatch(roleTerm, roleText, synonyms.roles, weights.roles)
        if (compoundResult.matched) {
          roleResult = compoundResult
          break
        }
      }
    }
    matchDetails.roles = roleResult

    if (roleResult.matched && !roleResult.isEmpty) {
      totalScore += roleResult.score
    } else if (must.roles) {
      mustFieldsFailed = true
      matchDetails.failReason = "roles_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. SENIORITY (peso: weights.seniority)
  // ─────────────────────────────────────────────────────────────
  const seniority = filters.seniority || []
  const ignoreUnknown = filters.ignoreUnknown !== false
  const seniorityMeta = SENIORITY_META_CACHE || (SENIORITY_META_CACHE = buildSeniorityMeta(synonyms))
  const requestedSeniorityLevels = normalizeSeniorityFilters(seniority, seniorityMeta)
  // Detecta a senioridade no titulo + skills. Se nada for achado, tenta a
  // descricao — a vaga pode declarar o nivel apenas no corpo do texto.
  const seniorityDetectText = `${jobTitle} ${Array.isArray(job.skills) ? job.skills.join(" ") : ""}`
  let detectedSeniorityLevels = extractSeniorityLevels(seniorityDetectText, seniorityMeta)
  if (detectedSeniorityLevels.size === 0 && jobDescription) {
    detectedSeniorityLevels = extractSeniorityLevels(jobDescription, seniorityMeta)
  }

  matchDetails.seniorityGate = {
    requested: requestedSeniorityLevels,
    detected: [...detectedSeniorityLevels],
    ignoreUnknown
  }

  if (seniority.length > 0) {
    maxScore += weights.seniority
    const seniorityResult = checkMatchWithScore(seniority, jobCoreText || jobText, synonyms.seniority, weights.seniority)
    matchDetails.seniority = seniorityResult

    if (requestedSeniorityLevels.length > 0) {
      // Gate ESTRITO de senioridade. A vaga so passa se o seu nivel for
      // EXATAMENTE um dos selecionados — sem faixa de rank, sem nivel acima.
      const requested = new Set(requestedSeniorityLevels)
      const titleLower = (jobTitle || "").toString().toLowerCase()
      const isManagement = MANAGEMENT_KEYWORDS.some((k) => areaKeywordHit(titleLower, k))

      let jobLevels
      let assumed = false
      if (detectedSeniorityLevels.size > 0) {
        jobLevels = [...detectedSeniorityLevels]
      } else if (isManagement) {
        // Cargo de gestao sem nivel explicito -> tratado como senior, nunca
        // como junior/pleno (gerencia nao eh vaga de entrada/meio).
        jobLevels = ["senior"]
        assumed = true
      } else {
        // Vaga sem nivel no titulo/skills/descricao -> assume junior/pleno.
        jobLevels = ["junior", "pleno"]
        assumed = true
      }

      if (!jobLevels.some((lvl) => requested.has(lvl))) {
        matchDetails.failReason = assumed ? "seniority_assumed_mismatch" : "seniority_not_in_requested"
        return returnScore ? { match: false, score: totalScore, maxScore, percentage: "0", details: matchDetails } : false
      }
    }

    if (seniorityResult.matched && !seniorityResult.isEmpty) {
      totalScore += seniorityResult.score
    } else if (must.seniority) {
      mustFieldsFailed = true
      matchDetails.failReason = "seniority_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3b. AREA DE ATUACAO (hard gate)
  // Classifica a vaga por area (titulo) e rejeita quando nao cruza com as
  // areas pedidas. Vaga sem area identificavel passa — o gate de stacks
  // ainda filtra. Quem pediu fullstack aceita backend/frontend puros.
  // ─────────────────────────────────────────────────────────────
  const requestedAreas = expandAreas(filters.areas || [])
  if (requestedAreas.length > 0) {
    const jobAreas = classifyJobAreas(jobTitle)
    matchDetails.areaGate = { requested: requestedAreas, detected: [...jobAreas] }
    if (jobAreas.size > 0 && !requestedAreas.some((a) => jobAreas.has(a))) {
      matchDetails.failReason = "area_not_in_requested"
      return returnScore ? { match: false, score: totalScore, maxScore, percentage: "0", details: matchDetails } : false
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. EXCLUDE SENIORITY (hard reject)
  // ─────────────────────────────────────────────────────────────
  const excludeSeniority = filters.excludeSeniority || []
  if (excludeSeniority.length > 0) {
    const excludeResult = checkMatch(excludeSeniority, jobCoreText || jobText, synonyms.seniority)
    if (excludeResult.matched && !excludeResult.isEmpty) {
      matchDetails.failReason = "excluded_seniority_found"
      return returnScore ? { match: false, score: 0, maxScore, percentage: "0", details: matchDetails } : false
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. WORK MODE (peso: weights.workMode)
  // Com tratamento especial para vagas 100% remotas
  // ─────────────────────────────────────────────────────────────
  const workMode = filters.workMode || []
  const jobIsFullyRemote = isFullyRemote(jobWorkType, jobText)
  const detectedWorkMode = detectWorkMode(jobWorkType, jobText)
  const jobIsRemote = detectedWorkMode === "remote" || jobIsFullyRemote

  if (workMode.length > 0) {
    maxScore += weights.workMode
    const workText = `${jobWorkType} ${jobText}`
    const workResult = checkMatchWithScore(workMode, workText, synonyms.workMode, weights.workMode)
    matchDetails.workMode = { ...workResult, isFullyRemote: jobIsFullyRemote, detectedMode: detectedWorkMode }

    if (workResult.matched && !workResult.isEmpty) {
      totalScore += workResult.score
    } else if (must.workMode) {
      mustFieldsFailed = true
      matchDetails.failReason = "workMode_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 6. CONTRACT (peso: weights.contract)
  // ─────────────────────────────────────────────────────────────
  const contract = filters.contract || []
  if (contract.length > 0) {
    maxScore += weights.contract
    const contractText = `${jobRegime} ${jobText}`
    const contractResult = checkMatchWithScore(contract, contractText, synonyms.contract, weights.contract)
    matchDetails.contract = contractResult

    if (contractResult.matched && !contractResult.isEmpty) {
      totalScore += contractResult.score
    } else if (must.contract) {
      mustFieldsFailed = true
      matchDetails.failReason = "contract_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 7. LANGUAGES (peso: weights.languages) - AGORA FUNCIONA!
  // ─────────────────────────────────────────────────────────────
  const languages = filters.languages || []
  if (languages.length > 0) {
    maxScore += weights.languages
    const langResult = checkMatchWithScore(languages, jobCoreText || jobText, synonyms.languages, weights.languages)
    matchDetails.languages = langResult

    if (langResult.matched && !langResult.isEmpty) {
      totalScore += langResult.score
    } else if (must.languages) {
      mustFieldsFailed = true
      matchDetails.failReason = "languages_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 8. LOCATIONS (peso: weights.locations)
  // Com lógica inteligente de país + tratamento de remoto global
  // ─────────────────────────────────────────────────────────────
  const locations = filters.locations || []
  if (locations.length > 0) {
    maxScore += weights.locations

    const userCountry = getUserCountry(locations)
    const jobCountry = getJobCountry(job.location || "")
    const userAcceptsRemote = userAcceptsWorkMode(workMode, "remoto")

    const locationResult = matchLocationForMode({
      requestedLocations: locations,
      jobLocation: job.location || jobLocation,
      jobWorkMode: detectedWorkMode,
      userAcceptsRemote,
      allowCountryOnlyForRemote: true,
      requireLocationForOnsite: true
    })

    matchDetails.locations = {
      userCountry,
      jobCountry,
      jobLocation: job.location,
      isFullyRemote: jobIsFullyRemote,
      detectedWorkMode,
      ...locationResult
    }

    if (locationResult.matched) {
      totalScore += weights.locations
      if (locationResult.reason === "remote_bypass") {
        matchDetails.locations.bypassedDueToRemote = true
      }
    } else if (must.locations) {
      mustFieldsFailed = true
      if (userCountry && jobCountry && userCountry !== jobCountry && !jobIsRemote) {
        matchDetails.failReason = "different_country"
      } else {
        matchDetails.failReason = locationResult.reason || "locations_required_not_found"
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 9. VALIDAÇÃO FINAL
  // ─────────────────────────────────────────────────────────────

  // Se algum campo obrigatório falhou, rejeita
  if (mustFieldsFailed) {
    return returnScore ? { match: false, score: totalScore, maxScore, percentage: maxScore > 0 ? (totalScore / maxScore * 100).toFixed(1) : "0", details: matchDetails } : false
  }

  // Precisa ter pelo menos uma stack ou role definida
  if (stacks.length === 0 && roles.length === 0) {
    matchDetails.failReason = "no_stacks_or_roles_defined"
    return returnScore ? { match: false, score: 0, maxScore, percentage: "0", details: matchDetails } : false
  }

  // ─────────────────────────────────────────────────────────────
  // 10. THRESHOLD DINÂMICO
  // Base: 60% para garantir relevância das vagas
  // Campos "must" já foram verificados acima (100% obrigatório)
  // ─────────────────────────────────────────────────────────────
  const dynamicThreshold = 0.6 // 60% base (garante relevância)
  const minScore = maxScore * dynamicThreshold
  const matched = maxScore === 0 || totalScore >= minScore

  matchDetails.threshold = {
    dynamic: dynamicThreshold,
    minRequired: minScore,
    achieved: totalScore
  }

  if (!matched && !matchDetails.failReason) {
    matchDetails.failReason = "score_below_threshold"
  }

  if (returnScore) {
    return {
      match: matched,
      score: totalScore,
      maxScore,
      percentage: maxScore > 0 ? (totalScore / maxScore * 100).toFixed(1) : "0",
      details: matchDetails
    }
  }

  return matched
}

/**
 * Verifica se a vaga corresponde às stacks do assinante (compatibilidade legada)
 * @param {Object} job - Vaga
 * @param {string[]|Object} stacksOrFilters - Stacks do assinante ou objeto de filtros
 * @returns {boolean}
 */
function jobMatchesStacks(job, stacksOrFilters) {
  // Se recebeu um objeto de filtros, usa a nova função
  if (stacksOrFilters && typeof stacksOrFilters === 'object' && !Array.isArray(stacksOrFilters)) {
    return jobMatchesFilters(job, stacksOrFilters)
  }

  // Se recebeu array de stacks, converte para filtros
  const filters = { stacks: stacksOrFilters || [] }
  return jobMatchesFilters(job, filters)
}

/**
 * Formata a mensagem da vaga para envio no privado
 * @param {Object} job - Objeto da vaga
 * @returns {string} Mensagem formatada
 */
function formatJobMessage(job) {
  const title = job.title || job.job_title || "Não informado"

  const fields = job.fields || []
  const normalize = (value) => {
    if (!value) {
      return ""
    }
    return value
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
  }

  const getFieldValue = (keys) => {
    for (const field of fields) {
      const fieldName = normalize(field?.name)
      if (!fieldName) {
        continue
      }
      for (const key of keys) {
        if (fieldName.includes(key)) {
          return field?.value || null
        }
      }
    }
    return null
  }

  const company = getFieldValue(["empresa", "company"]) || job.author?.name || job.company || "Não informado"
  const location = getFieldValue(["localidade", "localizacao", "local"]) || job.location || "Não informado"
  const salary = getFieldValue(["salario", "remuneracao"]) || job.salary || "Não informado"
  const regime = getFieldValue(["regime", "contratacao"]) || job.hiring_regime || "Não informado"
  const workType = getFieldValue(["modalidade", "tipo"]) || job.work_type || "Não informado"
  const publicationDate = getFieldValue(["data de publicacao", "publicacao"]) || job.publication_date || "Não informado"
  const jobUrl = job.url || job.job_url || ""
  let message = `${BOT_EMOJI} *VAGA PERSONALIZADA PARA VOC?!*\n\n`

  message += `📌 *Título:* ${title}\n`
  message += `🏢 *Empresa:* ${company}\n`
  message += `📍 *Local:* ${location}\n`
  message += `💰 *Salário:* ${salary}\n`
  message += `📝 *Regime:* ${regime}\n`
  message += `🏠 *Tipo:* ${workType}\n`
  message += `📅 *Publicação:* ${publicationDate}\n`

  if (jobUrl) {
    message += `\n🔗 *Link para candidatura:*\n${jobUrl}`
  }

  message += `\n\n_Enviado pelo Sonar Bot VIP_ ⭐`

  return message
}

/**
 * Normaliza a modalidade da vaga para o vocabulario do dashboard.
 */
function normalizeWorkModel(raw) {
  const v = (raw || "").toString().toLowerCase()
  if (v.includes("remot")) return "remote"
  if (v.includes("hibri") || v.includes("hybr")) return "hybrid"
  if (v.includes("presenc") || v.includes("onsite")) return "onsite"
  return null
}

/**
 * Monta um snapshot enxuto da vaga para gravar em vip_delivery_history.
 * O dashboard do portal le esse snapshot para mostrar o que foi enviado.
 */
function buildJobSnapshot(job) {
  const fields = job.fields || []
  const norm = (s) =>
    (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
  const fieldValue = (keys) => {
    for (const field of fields) {
      const name = norm(field?.name)
      if (!name) continue
      for (const key of keys) {
        if (name.includes(key)) return field?.value || null
      }
    }
    return null
  }

  return {
    title: job.title || job.job_title || null,
    company: fieldValue(["empresa", "company"]) || job.author?.name || job.company || null,
    location: fieldValue(["localidade", "localizacao", "local"]) || job.location || null,
    salary: fieldValue(["salario", "remuneracao"]) || job.salary || null,
    work_model: normalizeWorkModel(fieldValue(["modalidade", "tipo"]) || job.work_type),
    tags: Array.isArray(job.skills) ? job.skills.slice(0, 8) : [],
    url: job.url || job.job_url || null,
    source: job.source || null,
    publication_date:
      fieldValue(["data de publicacao", "publicacao"]) || job.publication_date || null
  }
}

/**
 * Converte LID para JID do WhatsApp
 * @param {string} lid - ID no formato @lid
 * @returns {string} JID no formato @s.whatsapp.net
 */
function lidToJid(lid) {
  // Se já está no formato correto
  if (lid.includes("@lid") || lid.includes("@s.whatsapp.net")) {
    return lid
  }

  // Remove @lid e adiciona @s.whatsapp.net
  const number = lid.replace("@lid", "").replace("@s.whatsapp.net", "")
  return `${number}@s.whatsapp.net`
}

/**
 * Solicita ao card-renderer (Vercel Edge) o PNG da vaga e monta a legenda
 * localmente (formatCaption + shortener). Substituiu a chamada antiga ao
 * formatter local (POST localhost:3001/cards/generate) quando o processo
 * sonnar-wa-formatter foi removido da VPS.
 *
 * @param {Object} job
 * @returns {Promise<{ imageBuffer: Buffer, caption: string, jobData: Object } | null>}
 */
async function buildJobCardForDelivery(job) {
  const cardImage = await fetchJobCardImage(job)
  if (!cardImage) return null

  const { imageBuffer, jobData } = cardImage
  const shortUrl = await shortenUrl(jobData.url)
  const caption = formatCaption(jobData, shortUrl)
  return { imageBuffer, caption, jobData }
}

/**
 * Envia o card gerado para o assinante
 * @param {string} jid
 * @param {string} jobId
 * @param {{ imageBuffer: Buffer, caption: string }} cardData
 * @param {Object} socket
 * @returns {boolean}
 */
async function sendCardPayload(jid, jobId, cardData, socket) {
  if (!cardData?.imageBuffer) {
    return false
  }

  try {
    await delay(TIMEOUT_IN_MILLISECONDS_BY_EVENT)
    await socket.sendMessage(jid, {
      image: cardData.imageBuffer,
      caption: cardData.caption,
      mimetype: "image/png"
    })
    const timestamp = new Date().toISOString()
    successLog(`[VIP CARD] Job ${jobId} sent to ${jid} at ${timestamp}`)
    return true
  } catch (err) {
    errorLog(`[VIP CARD] Falha ao enviar card para ${jid}: ${err.message}`)
    return false
  }
}

/**
 * Envia uma vaga para um assinante VIP
 * IMPORTANTE: Verifica intervalo de 7 minutos e histórico de 48h via persistência
 * @param {string} lid - LID do assinante
 * @param {Object} job - Vaga a enviar
 * @returns {{success: boolean, reason?: string}}
 */
async function sendJobToSubscriber(lid, job) {
  try {
    // Valida LID
    if (!lid || lid.trim() === "") {
      warningLog("[VIP] Tentativa de envio para LID vazio")
      return { success: false, reason: "invalid_lid" }
    }

    const socket = getCurrentSocket()
    if (!isCurrentSocketReady()) {
      warningLog("Conexao fechada. Envio VIP aguardando reconexao.")
      return { success: false, reason: "connection_closed" }
    }

    // Verifica intervalo de 7 minutos (persistido)
    if (!(await canSendToSubscriber(lid))) {
      const remaining = await getTimeUntilCanSend(lid)
      const remainingMin = Math.ceil(remaining / 60000)
      warningLog(`[VIP] Cooldown ativo para ${lid}. Aguardar ${remainingMin} minutos.`)
      return { success: false, reason: "cooldown" }
    }

    const jobId = job.id || job.url || job.job_url

    // Verifica se a vaga já foi enviada nas últimas 48h (persistido)
    if (await wasJobSentRecently(lid, jobId)) {
      return { success: false, reason: "already_sent" }
    }

    const jid = lidToJid(lid)
    const cardPayload = await buildJobCardForDelivery(job)
    if (!cardPayload) {
      const reason = "card_generation_failed"
      warningLog(`[VIP] Card não gerado para ${lid}: ${reason}`)
      return { success: false, reason }
    }

    const sent = await sendCardPayload(jid, jobId, cardPayload, socket)
    if (!sent) {
      const reason = "card_send_failed"
      warningLog(`[VIP] Falha ao enviar card para ${lid}: ${reason}`)
      return { success: false, reason }
    }

    // Registra o envio + snapshot da vaga (consumido pelo dashboard do portal)
    await recordJobSent(lid, jobId, buildJobSnapshot(job), job.matchScore ?? null)

    // NOVO: Marca também no cache JSON
    await markJobSentInCache(lid, jobId)

    return { success: true }
  } catch (err) {
    errorLog(`[VIP] Erro ao enviar vaga para ${lid}: ${err.message}`)
    return { success: false, reason: "error" }
  }
}

/**
 * Processa novas vagas e envia para assinantes VIP
 * OTIMIZADO v2: Cache por VIP de 24h - reduz egress drasticamente
 *
 * Fluxo:
 * 1. Carrega TODAS as vagas 1x por dia (cache global de 24h)
 * 2. Para cada VIP, filtra vagas compatíveis e salva em cache por 24h
 * 3. A cada ciclo (30 min), pega próxima vaga do cache do VIP
 */
async function processVipJobs() {
  if (!isCurrentSocketReady()) {
    warningLog("Conexao fechada. Verificacao VIP aguardando reconexao.")
    return
  }

  await processPendingVipSearches()

  // Limpa entradas antigas periodicamente (arquivo local)
  await cleanOldEntries()

  // Cleanup de registros antigos no Supabase (uma vez por dia)
  await maybeRunCleanup()

  const runId = createCorrelationId("vip-cycle")
  const cycleStart = Date.now()

  // Cache de subscribers (já usa cache interno de 5 min)
  const subscribers = await getVipSubscribers()

  if (subscribers.length === 0) {
    return
  }

  // OTIMIZAÇÃO: Carrega histórico de entrega em batch (1 query em vez de N)
  await loadSubscriberIdsBatch(subscribers)
  await loadHistoryBatch()

  // Verifica se o cache global precisa ser carregado
  const cacheAge = allJobsCache.timestamp > 0
    ? Math.round((Date.now() - allJobsCache.timestamp) / 3600000)
    : -1
  const cacheStatus = cacheAge >= 0 ? `(cache: ${cacheAge}h)` : "(carregando...)"

  infoLog(`[VIP] runId=${runId} Iniciando ciclo para ${subscribers.length} assinantes ${cacheStatus}`)

  let matches = 0
  let sent = 0

  for (const subscriber of subscribers) {
    // Pula assinantes sem LID válido
    if (!subscriber.lid || subscriber.lid.trim() === "") {
      warningLog(`[VIP] Assinante ${subscriber.name || "desconhecido"} sem LID válido, pulando...`)
      continue
    }

    // Verifica cooldown de 7 minutos (persistido)
    if (!(await canSendToSubscriber(subscriber.lid))) {
      continue
    }

    // Obtém IDs de vagas já enviadas nas últimas 48h
    const sentJobIds = await getSentJobIds(subscriber.lid)

    const filters = subscriber.filters || { stacks: subscriber.stacks || [] }

    // OTIMIZAÇÃO v3: Usa cache por VIP em JSON (persistido + memória)
    // Primeira vez: carrega todas as vagas, filtra e salva em JSON
    // Próximas vezes: usa cache do arquivo JSON
    const matchedJob = await getNextJobForVip(subscriber.lid, filters, sentJobIds, subscriber.name)

    if (!matchedJob) {
      // Log de diagnóstico
      if (VIP_ENABLE_DIAGNOSTICS) {
        const cached = vipCompatibleJobsCache.get(subscriber.lid)
        const totalCompatible = cached?.jobs?.length || 0
        const alreadySent = sentJobIds.size
        infoLog(`[VIP DIAG] ${subscriber.lid}: ${totalCompatible} compatíveis no cache, ${alreadySent} já enviadas, 0 disponíveis`)
      }
      await delay(500)
      continue
    }

    matches += 1
    const result = await sendJobToSubscriber(subscriber.lid, matchedJob)

    if (result.success) {
      sent += 1
      successLog(`[VIP] runId=${runId} Vaga enviada para ${subscriber.lid}: ${matchedJob.title || matchedJob.job_title}`)
    }

    await delay(1000)
  }

  const durationMs = Date.now() - cycleStart
  const globalCacheSize = allJobsCache.jobs?.length || 0
  infoLog(`[VIP] runId=${runId} Ciclo concluído: matches=${matches}, enviados=${sent}, cache_global=${globalCacheSize}, duração=${durationMs}ms`)
}

/**
 * Inicia o serviço de envio de vagas VIP
 * @param {Object} socket - Socket do Baileys (usado apenas para registrar evento)
 */
export async function startVipJobSender(socket) {
  if (vipTimeoutId) {
    clearTimeout(vipTimeoutId)
    vipTimeoutId = null
  }
  if (vipIntervalId) {
    clearInterval(vipIntervalId)
    vipIntervalId = null
  }
  if (vipPendingTimeoutId) {
    clearTimeout(vipPendingTimeoutId)
    vipPendingTimeoutId = null
  }
  vipRunToken += 1
  const subscribers = await getVipSubscribers()

  // Limpa entradas antigas do histórico ao iniciar
  await cleanOldEntries(true)

  infoLog("════════════════════════════════════════════════════")
  infoLog("       ⭐ SERVIÇO DE VAGAS VIP INICIADO (v2)")
  infoLog("════════════════════════════════════════════════════")
  infoLogAlways(`👥 Assinantes ativos: ${subscribers.length}`)
  infoLog(`⏱️  Intervalo de verificação: ${CHECK_INTERVAL / 60000} minutos`)
  infoLog(`⏱️  Cooldown por assinante: 7 minutos`)
  infoLog(`⏱️  Cooldown para reenvio: 48 horas`)
  infoLog(`💾 Cache global de vagas: 24 horas (1 consulta/dia)`)
  infoLog(`💾 Cache por VIP: 24 horas (vagas pré-filtradas)`)
  infoLog("════════════════════════════════════════════════════")

  if (subscribers.length > 0) {
    subscribers.forEach((s) => {
      const filters = s.filters || { stacks: s.stacks || [] }
      const filterSummary = []
      if (filters.stacks?.length) filterSummary.push(`stacks: ${filters.stacks.join(",")}`)
      if (filters.roles?.length) filterSummary.push(`roles: ${filters.roles.join(",")}`)
      if (filters.seniority?.length) filterSummary.push(`seniority: ${filters.seniority.join(",")}`)
      if (filters.workMode?.length) filterSummary.push(`workMode: ${filters.workMode.join(",")}`)
      const lidStatus = s.lid && s.lid.trim() !== "" ? s.lid : "SEM LID!"
      infoLog(`   └─ ${s.name || "Sem nome"} (${lidStatus}): ${filterSummary.join(" | ") || "sem filtros"}`)
    })
  }

  // Processa buscas pendentes assim que possivel
  const token = vipRunToken
  vipPendingTimeoutId = setTimeout(async () => {
    if (token != vipRunToken) {
      return
    }
    if (!isCurrentSocketReady()) {
      return
    }
    await processPendingVipSearches()
  }, 5000)

  // Primeira execução IMEDIATA (após 5 segundos para garantir conexão estável)
  infoLog(`⏱️ Primeira verificação VIP em 5 segundos (envio imediato)`)
  vipTimeoutId = setTimeout(async () => {
    if (token != vipRunToken) {
      return
    }
    infoLog(`[VIP] Executando primeira verificação de vagas (envio imediato)...`)
    await processVipJobs()
  }, 5 * 1000)

  // Execuções periódicas
  vipIntervalId = setInterval(async () => {
    if (token != vipRunToken) {
      return
    }
    infoLog(`[VIP] Executando verificação periódica de vagas...`)
    await processVipJobs()
  }, CHECK_INTERVAL)
}

/**
 * Força o envio imediato para um assinante (útil para testes)
 * Usa o novo sistema de cache por VIP
 * @param {string} lid - LID do assinante
 */
export async function forceVipJobCheck(lid) {
  const subscriber = (await getVipSubscribers()).find((s) => s.lid === lid)

  if (!subscriber) {
    return { success: false, message: "Assinante não encontrado" }
  }

  // Verifica cooldown
  if (!(await canSendToSubscriber(lid))) {
    const remaining = await getTimeUntilCanSend(lid)
    const remainingMin = Math.ceil(remaining / 60000)
    return { success: false, message: `Aguarde ${remainingMin} minutos para o próximo envio` }
  }

  // Obtém vagas já enviadas
  const sentJobIds = await getSentJobIds(lid)

  // Usa filtros completos se disponível
  const filters = subscriber.filters || { stacks: subscriber.stacks || [] }

  // Usa o novo sistema de cache por VIP (JSON persistido)
  const matchedJob = await getNextJobForVip(lid, filters, sentJobIds, subscriber.name)

  if (!matchedJob) {
    const cached = vipCompatibleJobsCache.get(lid)
    const totalCompatible = cached?.jobs?.length || 0
    return { success: true, message: `Nenhuma vaga disponível (${totalCompatible} compatíveis, ${sentJobIds.size} já enviadas)` }
  }

  const result = await sendJobToSubscriber(lid, matchedJob)
  if (result.success) {
    return { success: true, message: "1 vaga enviada" }
  }

  if (result.reason === "cooldown") {
    const remaining = await getTimeUntilCanSend(lid)
    const remainingMin = Math.ceil(remaining / 60000)
    return { success: false, message: `Aguarde ${remainingMin} minutos para o próximo envio` }
  }

  return { success: false, message: `Erro: ${result.reason}` }
}

/**
 * Dispara busca VIP dedicada para um cliente
 * OTIMIZADO v2: Usa cache por VIP de 24h
 * @param {string} lid - LID do assinante
 * @param {string[]|Object} stacksOrFilters - Stacks/keywords para buscar ou objeto de filtros
 * @param {Object} options - Opções adicionais
 * @returns {Promise<{success: boolean, jobsFound: number, jobsSent: number, error?: string}>}
 */
export async function triggerVipSearch(lid, stacksOrFilters, options = {}) {
  // Normaliza para objeto de filtros
  const filters = (stacksOrFilters && typeof stacksOrFilters === 'object' && !Array.isArray(stacksOrFilters))
    ? stacksOrFilters
    : { stacks: stacksOrFilters || [] }

  try {
    if (!isCurrentSocketReady()) {
      warningLog("Conexao fechada. Busca VIP aguardando reconexao.")
      if (options.allowQueue !== false) {
        queueVipSearch(lid, filters)
        infoLog(`[VIP] Busca enfileirada para ${lid} (conexao fechada).`)
        return {
          success: true,
          queued: true,
          jobsFound: 0,
          jobsSent: 0,
          error: "Conexao fechada. Busca enfileirada.",
        }
      }
      return {
        success: false,
        jobsFound: 0,
        jobsSent: 0,
        error: "Conexao fechada",
      }
    }

    const runId = createCorrelationId("vip-search")
    const filterSummary = []
    if (filters.stacks?.length) filterSummary.push(`stacks: ${filters.stacks.join(",")}`)
    if (filters.roles?.length) filterSummary.push(`roles: ${filters.roles.join(",")}`)
    if (filters.seniority?.length) filterSummary.push(`seniority: ${filters.seniority.join(",")}`)
    infoLog(`[VIP SEARCH] runId=${runId} Disparando busca para ${lid} com ${filterSummary.join(" | ") || "filtros vazios"}`)

    // Verifica cooldown de 7 minutos
    if (!(await canSendToSubscriber(lid))) {
      const remaining = await getTimeUntilCanSend(lid)
      const remainingMin = Math.ceil(remaining / 60000)
      warningLog(`[VIP SEARCH] Cooldown ativo para ${lid}. Aguardar ${remainingMin} minutos.`)
      return {
        success: true,
        jobsFound: 0,
        jobsSent: 0,
        error: `Aguarde ${remainingMin} minutos para o próximo envio`,
      }
    }

    // Obtém IDs de vagas já enviadas nas últimas 48h
    const sentJobIds = await getSentJobIds(lid)

    // OTIMIZADO v2: Usa cache por VIP (24h)
    const matchedJob = await getNextJobForVip(lid, filters, sentJobIds)
    const cached = vipCompatibleJobsCache.get(lid)
    const jobsFound = cached?.jobs?.length || 0

    if (!matchedJob) {
      infoLog(`[VIP SEARCH] runId=${runId} Nenhuma vaga disponível para ${lid} (${jobsFound} compatíveis, ${sentJobIds.size} já enviadas)`)
      return {
        success: true,
        jobsFound,
        jobsSent: 0,
        error: "Nenhuma vaga nova encontrada para os filtros informados",
      }
    }

    // Envia apenas uma vaga (regra: 1 vaga a cada 7 minutos)
    let jobsSent = 0
    const result = await sendJobToSubscriber(lid, matchedJob)
    if (result.success) {
      jobsSent = 1
      successLog(`[VIP SEARCH] runId=${runId} Vaga enviada para ${lid}: ${matchedJob.title || matchedJob.job_title}`)
    } else {
      warningLog(`[VIP SEARCH] runId=${runId} Não foi possível enviar: ${result.reason}`)
    }

    successLog(`[VIP SEARCH] runId=${runId} Busca concluída para ${lid}: ${jobsSent}/${jobsFound} vagas compatíveis`)

    return {
      success: true,
      jobsFound,
      jobsSent,
    }
  } catch (err) {
    errorLog(`[VIP SEARCH] Erro na busca VIP: ${err.message}`)

    return {
      success: false,
      jobsFound: 0,
      jobsSent: 0,
      error: err.message,
    }
  }
}

export async function runVipDiagnostics(lid, options = {}) {
  const normalizedLid = lid?.includes("@lid") ? lid : `${lid}@lid`
  if (!normalizedLid || normalizedLid === "undefined@lid") {
    return { ok: false, error: "LID invalido" }
  }

  try {
    const subscriber = await getVipSubscriber(normalizedLid)
    if (!subscriber) {
      return { ok: false, error: "VIP nao encontrado ou inativo" }
    }

    const filters = subscriber.filters || { stacks: subscriber.stacks || [] }
    const includeSent = options.includeSent === true
    const sentJobIds = includeSent ? new Set() : await getSentJobIds(normalizedLid)
    const diagnostics = createDiagnosticsTracker("diagnostic_full_scan")

    const scanResult = await scanJobsForMatch({
      filters,
      sentJobIds,
      checkedIds: new Set(),
      pageSize: Number.isFinite(options.pageSize) ? options.pageSize : VIP_FULL_SCAN_PAGE_SIZE,
      diagnostics,
      stopOnFirstMatch: false
    })

    const sortedReasons = [...diagnostics.reasons.entries()].sort((a, b) => b[1] - a[1])
    const topReasons = sortedReasons
      .slice(0, Math.max(1, VIP_DIAGNOSTIC_LOG_LIMIT))
      .map(([reason, count]) => ({ reason, count }))

    const sampleJob = scanResult.firstMatch
      ? {
          id: getJobIdentifier(scanResult.firstMatch),
          title: scanResult.firstMatch.title || scanResult.firstMatch.job_title || "",
          url: scanResult.firstMatch.url || scanResult.firstMatch.job_url || ""
        }
      : null

    return {
      ok: true,
      lid: normalizedLid,
      subscriber: {
        name: subscriber.name || subscriber.user_name || "",
        lid: subscriber.lid
      },
      scanned: diagnostics.scanned,
      matched: scanResult.matchCount,
      skippedNoId: diagnostics.skippedNoId,
      skippedAlreadySent: diagnostics.skippedAlreadySent,
      topReasons,
      sampleJob
    }
  } catch (error) {
    return { ok: false, error: error?.message || "Erro ao diagnosticar" }
  }
}

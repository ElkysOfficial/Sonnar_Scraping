/**
 * Sistema de Cache JSON para Vagas de Grupos
 * Armazena vagas suficientes para um dia de envio (48 vagas - 30 em 30 min)
 *
 * @author Sonar Bot
 */

import fs from "node:fs"
import path from "node:path"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { VIP_CACHE_DIR, GROUP_JOBS_PER_DAY } from "../config.js"

// Diretório específico para grupos
const GROUPS_CACHE_DIR = path.join(VIP_CACHE_DIR, "groups")

// Garante que o diretório existe
function ensureGroupsCacheDir() {
  if (!fs.existsSync(GROUPS_CACHE_DIR)) {
    fs.mkdirSync(GROUPS_CACHE_DIR, { recursive: true })
    infoLog(`[GROUP JSON CACHE] Diretório criado: ${GROUPS_CACHE_DIR}`)
  }
}

/**
 * Normaliza o groupId para uso como nome de arquivo
 * Remove caracteres inválidos
 * @param {string} groupId - ID do grupo
 * @returns {string} Nome de arquivo seguro
 */
function groupIdToFilename(groupId) {
  return groupId.replace(/@/g, "_").replace(/[^a-zA-Z0-9_-]/g, "")
}

/**
 * Obtém o caminho do arquivo JSON para um grupo
 * @param {string} groupId - ID do grupo
 * @returns {string} Caminho completo do arquivo
 */
function getGroupCachePath(groupId) {
  ensureGroupsCacheDir()
  const filename = `${groupIdToFilename(groupId)}.json`
  return path.join(GROUPS_CACHE_DIR, filename)
}

/**
 * Obtém a data de expiração (meia-noite do próximo dia)
 * @returns {Date} Data de expiração
 */
function getNextMidnight() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  return tomorrow
}

/**
 * Verifica se o cache JSON do grupo é válido (não expirou)
 * Cache expira à meia-noite
 * @param {Object} cacheData - Dados do cache
 * @returns {boolean} true se válido
 */
export function isGroupCacheValid(cacheData) {
  if (!cacheData || !cacheData.expiresAt) {
    return false
  }

  const expiresAt = new Date(cacheData.expiresAt).getTime()
  const now = Date.now()

  return now < expiresAt
}

/**
 * Carrega o cache JSON de um grupo do disco
 * @param {string} groupId - ID do grupo
 * @returns {Object|null} Dados do cache ou null se não existir/inválido
 */
export async function loadGroupJobsCache(groupId) {
  try {
    const filePath = getGroupCachePath(groupId)

    if (!fs.existsSync(filePath)) {
      infoLog(`[GROUP JSON CACHE] Arquivo não existe para grupo ${groupId}`)
      return null
    }

    const content = fs.readFileSync(filePath, "utf-8")
    const cacheData = JSON.parse(content)

    if (!isGroupCacheValid(cacheData)) {
      infoLog(`[GROUP JSON CACHE] Cache expirado para grupo ${groupId}`)
      return null
    }

    infoLog(`[GROUP JSON CACHE] Cache carregado para grupo: ${cacheData.totalJobs} vagas, index ${cacheData.currentIndex}`)
    return cacheData
  } catch (err) {
    errorLog(`[GROUP JSON CACHE] Erro ao carregar cache do grupo ${groupId}: ${err.message}`)
    return null
  }
}

/**
 * Salva o cache JSON de um grupo no disco
 * @param {string} groupId - ID do grupo
 * @param {Object} cacheData - Dados do cache
 * @returns {boolean} true se salvou com sucesso
 */
export async function saveGroupJobsCache(groupId, cacheData) {
  try {
    const filePath = getGroupCachePath(groupId)
    const content = JSON.stringify(cacheData, null, 2)

    // Escreve em arquivo temporário primeiro (atomic write)
    const tempPath = `${filePath}.tmp`
    fs.writeFileSync(tempPath, content, "utf-8")
    fs.renameSync(tempPath, filePath)

    successLog(`[GROUP JSON CACHE] Cache salvo para grupo: ${cacheData.totalJobs} vagas`)
    return true
  } catch (err) {
    errorLog(`[GROUP JSON CACHE] Erro ao salvar cache do grupo ${groupId}: ${err.message}`)
    return false
  }
}

/**
 * Gera o cache JSON com vagas para um dia inteiro
 * @param {string} groupId - ID do grupo
 * @param {Array} jobs - Array de vagas para o dia
 * @param {string} groupName - Nome do grupo (opcional)
 * @returns {Object} Dados do cache gerado
 */
export async function generateGroupJobsCache(groupId, jobs, groupName = null) {
  const now = new Date()
  const expiresAt = getNextMidnight()

  // Buffer de 12 vagas extras (caso alguma falhe)
  const jobsNeeded = GROUP_JOBS_PER_DAY + 12

  // Mapeia as vagas com informações essenciais
  const jobsList = jobs.slice(0, jobsNeeded).map(job => ({
    id: job.id,
    job_title: job.job_title,
    company: job.company,
    location: job.location,
    work_type: job.work_type,
    hiring_regime: job.hiring_regime,
    salary: job.salary,
    job_url: job.job_url,
    publication_date: job.publication_date,
    source: job.source,
    created_at: job.created_at,
    stack: job.stack || null
  }))

  const cacheData = {
    groupId,
    groupName: groupName || "Grupo de Vagas",
    generatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    sendInterval: 30 * 60 * 1000, // 30 minutos em ms
    expectedSendsPerDay: GROUP_JOBS_PER_DAY,
    totalJobs: jobsList.length,
    jobs: jobsList,
    sentJobIds: [],
    currentIndex: 0,
    metadata: {
      lastSentAt: null,
      jobsSentToday: 0,
      recentStacks: [],
      version: 1
    }
  }

  // Salva no disco
  await saveGroupJobsCache(groupId, cacheData)

  return cacheData
}

/**
 * Obtém a próxima vaga para enviar ao grupo
 * @param {string} groupId - ID do grupo
 * @returns {Object|null} Próxima vaga ou null se não houver
 */
export async function getNextJobForGroup(groupId) {
  const cacheData = await loadGroupJobsCache(groupId)

  if (!cacheData || !cacheData.jobs || cacheData.jobs.length === 0) {
    return null
  }

  const currentIndex = cacheData.currentIndex || 0

  // Verifica se ainda há vagas disponíveis
  if (currentIndex >= cacheData.jobs.length) {
    warningLog(`[GROUP JSON CACHE] Todas as ${cacheData.jobs.length} vagas do dia foram enviadas`)
    return null
  }

  const job = cacheData.jobs[currentIndex]
  return job
}

/**
 * Obtém todas as vagas restantes do dia
 * @param {string} groupId - ID do grupo
 * @returns {Array} Array de vagas restantes
 */
export async function getRemainingJobsForGroup(groupId) {
  const cacheData = await loadGroupJobsCache(groupId)

  if (!cacheData || !cacheData.jobs || cacheData.jobs.length === 0) {
    return []
  }

  const currentIndex = cacheData.currentIndex || 0
  return cacheData.jobs.slice(currentIndex)
}

/**
 * Marca a vaga atual como enviada e avança o índice
 * @param {string} groupId - ID do grupo
 * @param {string} jobId - ID da vaga enviada
 * @returns {boolean} true se atualizou com sucesso
 */
export async function markGroupJobSent(groupId, jobId) {
  try {
    const cacheData = await loadGroupJobsCache(groupId)

    if (!cacheData) {
      warningLog(`[GROUP JSON CACHE] Cache não encontrado para marcar vaga enviada`)
      return false
    }

    // Adiciona o jobId à lista de enviados
    if (!cacheData.sentJobIds) {
      cacheData.sentJobIds = []
    }

    if (!cacheData.sentJobIds.includes(jobId)) {
      cacheData.sentJobIds.push(jobId)
    }

    // Avança o índice
    cacheData.currentIndex = (cacheData.currentIndex || 0) + 1

    // Atualiza metadata
    cacheData.metadata = cacheData.metadata || {}
    cacheData.metadata.lastSentAt = Date.now()
    cacheData.metadata.jobsSentToday = (cacheData.metadata.jobsSentToday || 0) + 1

    // Atualiza stacks recentes (para diversidade)
    const currentJob = cacheData.jobs[cacheData.currentIndex - 1]
    if (currentJob?.stack) {
      if (!cacheData.metadata.recentStacks) {
        cacheData.metadata.recentStacks = []
      }
      cacheData.metadata.recentStacks.push(currentJob.stack)
      // Mantém apenas as últimas 10 stacks
      if (cacheData.metadata.recentStacks.length > 10) {
        cacheData.metadata.recentStacks.shift()
      }
    }

    // Salva o cache atualizado
    await saveGroupJobsCache(groupId, cacheData)

    const remaining = cacheData.jobs.length - cacheData.currentIndex
    infoLog(`[GROUP JSON CACHE] Vaga ${jobId} enviada. Index: ${cacheData.currentIndex}. Restam ${remaining} vagas.`)

    return true
  } catch (err) {
    errorLog(`[GROUP JSON CACHE] Erro ao marcar vaga enviada: ${err.message}`)
    return false
  }
}

/**
 * Reseta o cache do grupo para o início do dia
 * Útil quando o cache expira à meia-noite
 * @param {string} groupId - ID do grupo
 * @returns {boolean} true se resetou com sucesso
 */
export async function resetDailyGroupCache(groupId) {
  try {
    const filePath = getGroupCachePath(groupId)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      infoLog(`[GROUP JSON CACHE] Cache do grupo ${groupId} resetado para novo dia`)
    }

    return true
  } catch (err) {
    errorLog(`[GROUP JSON CACHE] Erro ao resetar cache: ${err.message}`)
    return false
  }
}

/**
 * Invalida (deleta) o cache de um grupo específico
 * @param {string} groupId - ID do grupo (se null, invalida todos)
 * @returns {boolean} true se invalidou com sucesso
 */
export async function invalidateGroupCache(groupId = null) {
  try {
    ensureGroupsCacheDir()

    if (groupId) {
      const filePath = getGroupCachePath(groupId)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        infoLog(`[GROUP JSON CACHE] Cache invalidado para grupo ${groupId}`)
      }
      return true
    }

    // Invalida todos os caches de grupos
    const files = fs.readdirSync(GROUPS_CACHE_DIR)
    let count = 0

    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(GROUPS_CACHE_DIR, file)
        fs.unlinkSync(filePath)
        count++
      }
    }

    infoLog(`[GROUP JSON CACHE] ${count} caches de grupos invalidados`)
    return true
  } catch (err) {
    errorLog(`[GROUP JSON CACHE] Erro ao invalidar cache: ${err.message}`)
    return false
  }
}

/**
 * Obtém estatísticas do cache de um grupo
 * @param {string} groupId - ID do grupo
 * @returns {Object|null} Estatísticas do cache
 */
export async function getGroupCacheStats(groupId) {
  const cacheData = await loadGroupJobsCache(groupId)

  if (!cacheData) {
    return null
  }

  const currentIndex = cacheData.currentIndex || 0
  const totalJobs = cacheData.jobs?.length || 0
  const remainingJobs = totalJobs - currentIndex

  return {
    groupId,
    groupName: cacheData.groupName,
    totalJobs,
    sent: currentIndex,
    remaining: remainingJobs,
    expectedSendsPerDay: cacheData.expectedSendsPerDay,
    generatedAt: cacheData.generatedAt,
    expiresAt: cacheData.expiresAt,
    isValid: isGroupCacheValid(cacheData),
    metadata: cacheData.metadata
  }
}

/**
 * Verifica se há vagas suficientes para o resto do dia
 * @param {string} groupId - ID do grupo
 * @returns {Object} { hasEnough: boolean, remaining: number, needed: number }
 */
export async function checkGroupJobsAvailability(groupId) {
  const cacheData = await loadGroupJobsCache(groupId)

  if (!cacheData) {
    return {
      hasEnough: false,
      remaining: 0,
      needed: GROUP_JOBS_PER_DAY
    }
  }

  const currentIndex = cacheData.currentIndex || 0
  const remaining = cacheData.jobs.length - currentIndex

  // Calcula quantos envios faltam até meia-noite
  const now = new Date()
  const midnight = getNextMidnight()
  const hoursRemaining = (midnight.getTime() - now.getTime()) / (1000 * 60 * 60)
  const sendsRemaining = Math.ceil(hoursRemaining * 2) // 2 envios por hora (30 em 30 min)

  return {
    hasEnough: remaining >= sendsRemaining,
    remaining,
    needed: sendsRemaining
  }
}

/**
 * Lista todos os caches de grupos existentes
 * @returns {Array} Array com informações básicas dos caches
 */
export async function listGroupCaches() {
  try {
    ensureGroupsCacheDir()

    const files = fs.readdirSync(GROUPS_CACHE_DIR)
    const caches = []

    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue
      }

      const filePath = path.join(GROUPS_CACHE_DIR, file)

      try {
        const content = fs.readFileSync(filePath, "utf-8")
        const cacheData = JSON.parse(content)

        caches.push({
          groupId: cacheData.groupId,
          groupName: cacheData.groupName,
          totalJobs: cacheData.jobs?.length || 0,
          currentIndex: cacheData.currentIndex || 0,
          isValid: isGroupCacheValid(cacheData),
          generatedAt: cacheData.generatedAt
        })
      } catch {
        // Arquivo corrompido, ignora
      }
    }

    return caches
  } catch (err) {
    errorLog(`[GROUP JSON CACHE] Erro ao listar caches: ${err.message}`)
    return []
  }
}

/**
 * Sistema de Cache JSON para Vagas VIP
 * Armazena todas as vagas compatíveis em arquivo JSON por cliente
 *
 * @author Sonar Bot
 */

import fs from "node:fs"
import path from "node:path"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { VIP_CACHE_DIR, VIP_CACHE_TTL } from "../config.js"

// TTL reduzido aplicado a caches "vazios suspeitos" (totalCompatible=0).
// Cache vazio normalmente significa que no momento da geracao o banco de
// vagas estava vazio ou houve falha transiente — sem essa protecao, o
// cache normal de 24h prendia o VIP em "0 vagas" por um dia inteiro mesmo
// que o banco voltasse a popular minutos depois. 5min e curto o bastante
// pra recuperar rapido e longo o bastante pra nao thrashar I/O.
const EMPTY_CACHE_TTL_MS = 5 * 60 * 1000

// Garante que o diretório existe
function ensureCacheDir() {
  if (!fs.existsSync(VIP_CACHE_DIR)) {
    fs.mkdirSync(VIP_CACHE_DIR, { recursive: true })
    infoLog(`[VIP JSON CACHE] Diretório criado: ${VIP_CACHE_DIR}`)
  }
}

/**
 * Normaliza o LID para uso como nome de arquivo
 * Remove caracteres inválidos e limita o tamanho
 * @param {string} lid - LID do assinante
 * @returns {string} Nome de arquivo seguro
 */
function lidToFilename(lid) {
  // Remove @ e substitui caracteres inválidos
  return lid.replace(/@/g, "_").replace(/[^a-zA-Z0-9_-]/g, "")
}

/**
 * Obtém o caminho do arquivo JSON para um VIP
 * @param {string} lid - LID do assinante
 * @returns {string} Caminho completo do arquivo
 */
function getVipCachePath(lid) {
  ensureCacheDir()
  const filename = `${lidToFilename(lid)}.json`
  return path.join(VIP_CACHE_DIR, filename)
}

/**
 * Verifica se o cache JSON é válido (não expirou)
 * @param {Object} cacheData - Dados do cache
 * @returns {boolean} true se válido
 */
export function isVipCacheValid(cacheData) {
  if (!cacheData || !cacheData.expiresAt) {
    return false
  }

  const now = Date.now()
  const expiresAt = new Date(cacheData.expiresAt).getTime()

  // Cache "vazio suspeito": gerado com 0 vagas compativeis. Aplicamos TTL
  // curto de EMPTY_CACHE_TTL_MS (5min) em vez dos 24h normais, pra que a
  // proxima passada regenere com vagas reais assim que o banco populadar.
  // Cenario tipico: limpeza geral do banco enquanto o sender estava rodando,
  // ou erro transiente no Supabase no momento da geracao.
  const empty = cacheData.totalCompatible === 0
    || !Array.isArray(cacheData.jobs)
    || cacheData.jobs.length === 0
  if (empty) {
    const generatedAt = cacheData.generatedAt
      ? new Date(cacheData.generatedAt).getTime()
      : 0
    if (!generatedAt) return false
    return (now - generatedAt) < EMPTY_CACHE_TTL_MS
  }

  return now < expiresAt
}

/**
 * Carrega o cache JSON de um VIP do disco
 * @param {string} lid - LID do assinante
 * @returns {Object|null} Dados do cache ou null se não existir/inválido
 */
export async function loadVipJobsCache(lid) {
  try {
    const filePath = getVipCachePath(lid)

    if (!fs.existsSync(filePath)) {
      infoLog(`[VIP JSON CACHE] Arquivo não existe para ${lid}`)
      return null
    }

    const content = fs.readFileSync(filePath, "utf-8")
    const cacheData = JSON.parse(content)

    if (!isVipCacheValid(cacheData)) {
      infoLog(`[VIP JSON CACHE] Cache expirado para ${lid}`)
      return null
    }

    infoLog(`[VIP JSON CACHE] Cache carregado para ${lid}: ${cacheData.totalCompatible} vagas`)
    return cacheData
  } catch (err) {
    errorLog(`[VIP JSON CACHE] Erro ao carregar cache de ${lid}: ${err.message}`)
    return null
  }
}

/**
 * Salva o cache JSON de um VIP no disco
 * @param {string} lid - LID do assinante
 * @param {Object} cacheData - Dados do cache
 * @returns {boolean} true se salvou com sucesso
 */
export async function saveVipJobsCache(lid, cacheData) {
  try {
    const filePath = getVipCachePath(lid)
    const content = JSON.stringify(cacheData, null, 2)

    // Escreve em arquivo temporário primeiro (atomic write)
    const tempPath = `${filePath}.tmp`
    fs.writeFileSync(tempPath, content, "utf-8")
    fs.renameSync(tempPath, filePath)

    successLog(`[VIP JSON CACHE] Cache salvo para ${lid}: ${cacheData.totalCompatible} vagas`)
    return true
  } catch (err) {
    errorLog(`[VIP JSON CACHE] Erro ao salvar cache de ${lid}: ${err.message}`)
    return false
  }
}

/**
 * Gera o cache JSON com todas as vagas compatíveis para um VIP
 * @param {string} lid - LID do assinante
 * @param {string} name - Nome do assinante
 * @param {Object} filters - Filtros do assinante
 * @param {Array} compatibleJobs - Array de vagas compatíveis
 * @param {Array} sentJobIds - IDs de vagas já enviadas
 * @returns {Object} Dados do cache gerado
 */
export async function generateVipJobsCache(lid, name, filters, compatibleJobs, sentJobIds = []) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + VIP_CACHE_TTL)

  // Mapeia as vagas com informações essenciais.
  // skills/description sao essenciais: o card e a legenda sao gerados a
  // partir do job vindo deste cache — sem eles o card perde as skills reais.
  const jobs = compatibleJobs.map(job => ({
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
    skills: Array.isArray(job.skills) ? job.skills : [],
    description: job.description || "",
    created_at: job.created_at,
    matchScore: job.matchScore || 0
  }))

  const cacheData = {
    lid,
    name: name || "VIP",
    filters,
    generatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    totalCompatible: jobs.length,
    jobs,
    sentJobIds: Array.isArray(sentJobIds) ? sentJobIds : Array.from(sentJobIds),
    metadata: {
      lastSentAt: null,
      jobsSentToday: 0,
      version: 1
    }
  }

  // Salva no disco
  await saveVipJobsCache(lid, cacheData)

  return cacheData
}

/**
 * Obtém a próxima vaga não enviada do cache
 * @param {string} lid - LID do assinante
 * @returns {Object|null} Próxima vaga ou null se não houver
 */
export async function getNextJobFromCache(lid) {
  const cacheData = await loadVipJobsCache(lid)

  if (!cacheData || !cacheData.jobs || cacheData.jobs.length === 0) {
    return null
  }

  const sentSet = new Set(cacheData.sentJobIds || [])

  // Encontra a primeira vaga não enviada
  for (const job of cacheData.jobs) {
    const jobId = job.id || job.job_url
    if (jobId && !sentSet.has(jobId)) {
      return job
    }
  }

  infoLog(`[VIP JSON CACHE] Todas as ${cacheData.jobs.length} vagas já foram enviadas para ${lid}`)
  return null
}

/**
 * Obtém todas as vagas disponíveis (não enviadas) do cache
 * @param {string} lid - LID do assinante
 * @returns {Array} Array de vagas disponíveis
 */
export async function getAvailableJobsFromCache(lid) {
  const cacheData = await loadVipJobsCache(lid)

  if (!cacheData || !cacheData.jobs || cacheData.jobs.length === 0) {
    return []
  }

  const sentSet = new Set(cacheData.sentJobIds || [])

  return cacheData.jobs.filter(job => {
    const jobId = job.id || job.job_url
    return jobId && !sentSet.has(jobId)
  })
}

/**
 * Marca uma vaga como enviada no cache JSON
 * @param {string} lid - LID do assinante
 * @param {string} jobId - ID da vaga enviada
 * @returns {boolean} true se atualizou com sucesso
 */
export async function markJobSentInCache(lid, jobId) {
  try {
    const cacheData = await loadVipJobsCache(lid)

    if (!cacheData) {
      warningLog(`[VIP JSON CACHE] Cache não encontrado para marcar vaga enviada: ${lid}`)
      return false
    }

    // Adiciona o jobId à lista de enviados se ainda não estiver
    if (!cacheData.sentJobIds) {
      cacheData.sentJobIds = []
    }

    if (!cacheData.sentJobIds.includes(jobId)) {
      cacheData.sentJobIds.push(jobId)
    }

    // Atualiza metadata
    cacheData.metadata = cacheData.metadata || {}
    cacheData.metadata.lastSentAt = Date.now()
    cacheData.metadata.jobsSentToday = (cacheData.metadata.jobsSentToday || 0) + 1

    // Salva o cache atualizado
    await saveVipJobsCache(lid, cacheData)

    const remaining = cacheData.jobs.length - cacheData.sentJobIds.length
    infoLog(`[VIP JSON CACHE] Vaga ${jobId} marcada como enviada para ${lid}. Restam ${remaining} vagas.`)

    return true
  } catch (err) {
    errorLog(`[VIP JSON CACHE] Erro ao marcar vaga enviada: ${err.message}`)
    return false
  }
}

/**
 * Invalida (deleta) o cache de um VIP específico
 * @param {string} lid - LID do assinante (se null, invalida todos)
 * @returns {boolean} true se invalidou com sucesso
 */
export async function invalidateVipJsonCache(lid = null) {
  try {
    ensureCacheDir()

    if (lid) {
      // Invalida cache de um VIP específico
      const filePath = getVipCachePath(lid)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        infoLog(`[VIP JSON CACHE] Cache invalidado para ${lid}`)
      }
      return true
    }

    // Invalida todos os caches
    const files = fs.readdirSync(VIP_CACHE_DIR)
    let count = 0

    for (const file of files) {
      if (file.endsWith(".json") && !file.startsWith("groups")) {
        const filePath = path.join(VIP_CACHE_DIR, file)
        fs.unlinkSync(filePath)
        count++
      }
    }

    infoLog(`[VIP JSON CACHE] ${count} caches invalidados`)
    return true
  } catch (err) {
    errorLog(`[VIP JSON CACHE] Erro ao invalidar cache: ${err.message}`)
    return false
  }
}

/**
 * Limpa caches expirados do disco
 * @returns {number} Número de caches removidos
 */
export async function cleanExpiredVipCaches() {
  try {
    ensureCacheDir()

    const files = fs.readdirSync(VIP_CACHE_DIR)
    let removedCount = 0

    for (const file of files) {
      if (!file.endsWith(".json") || file.startsWith("groups")) {
        continue
      }

      const filePath = path.join(VIP_CACHE_DIR, file)

      try {
        const content = fs.readFileSync(filePath, "utf-8")
        const cacheData = JSON.parse(content)

        if (!isVipCacheValid(cacheData)) {
          fs.unlinkSync(filePath)
          removedCount++
        }
      } catch {
        // Arquivo corrompido, remove
        fs.unlinkSync(filePath)
        removedCount++
      }
    }

    if (removedCount > 0) {
      infoLog(`[VIP JSON CACHE] ${removedCount} caches expirados removidos`)
    }

    return removedCount
  } catch (err) {
    errorLog(`[VIP JSON CACHE] Erro ao limpar caches expirados: ${err.message}`)
    return 0
  }
}

/**
 * Obtém estatísticas do cache de um VIP
 * @param {string} lid - LID do assinante
 * @returns {Object|null} Estatísticas do cache
 */
export async function getVipCacheStats(lid) {
  const cacheData = await loadVipJobsCache(lid)

  if (!cacheData) {
    return null
  }

  const sentCount = cacheData.sentJobIds?.length || 0
  const totalCount = cacheData.jobs?.length || 0
  const availableCount = totalCount - sentCount

  return {
    lid,
    name: cacheData.name,
    totalCompatible: totalCount,
    sent: sentCount,
    available: availableCount,
    generatedAt: cacheData.generatedAt,
    expiresAt: cacheData.expiresAt,
    isValid: isVipCacheValid(cacheData),
    metadata: cacheData.metadata
  }
}

/**
 * Lista todos os caches VIP existentes
 * @returns {Array} Array com informações básicas dos caches
 */
export async function listVipCaches() {
  try {
    ensureCacheDir()

    const files = fs.readdirSync(VIP_CACHE_DIR)
    const caches = []

    for (const file of files) {
      if (!file.endsWith(".json") || file.startsWith("groups")) {
        continue
      }

      const filePath = path.join(VIP_CACHE_DIR, file)

      try {
        const content = fs.readFileSync(filePath, "utf-8")
        const cacheData = JSON.parse(content)

        caches.push({
          lid: cacheData.lid,
          name: cacheData.name,
          totalJobs: cacheData.jobs?.length || 0,
          sentJobs: cacheData.sentJobIds?.length || 0,
          isValid: isVipCacheValid(cacheData),
          generatedAt: cacheData.generatedAt
        })
      } catch {
        // Arquivo corrompido, ignora
      }
    }

    return caches
  } catch (err) {
    errorLog(`[VIP JSON CACHE] Erro ao listar caches: ${err.message}`)
    return []
  }
}

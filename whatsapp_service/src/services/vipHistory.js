/**
 * Serviço de persistência do histórico de envios VIP
 * Garante que:
 * - Apenas 1 vaga seja enviada a cada 5 minutos por assinante
 * - A mesma vaga não seja enviada duas vezes (exceto após 48 horas)
 * - O estado persiste mesmo após reiniciar o bot
 *
 * @author Sonar Bot
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { errorLog, infoLog } from "../utils/logger.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Caminho do arquivo de histórico
const VIP_HISTORY_PATH = path.resolve(__dirname, "..", "..", "database", "vip-history.json")

// Intervalo mínimo entre envios (5 minutos em ms)
const MIN_SEND_INTERVAL = 5 * 60 * 1000

// Cooldown para reenvio da mesma vaga (48 horas em ms)
const JOB_REPOST_COOLDOWN = 48 * 60 * 60 * 1000

/**
 * Estrutura do histórico:
 * {
 *   "lid@lid": {
 *     "lastSentAt": timestamp,
 *     "sentJobs": {
 *       "jobId": timestamp
 *     }
 *   }
 * }
 */

/**
 * Carrega o histórico do arquivo
 * @returns {Object}
 */
function loadHistory() {
  try {
    if (!fs.existsSync(VIP_HISTORY_PATH)) {
      return {}
    }
    const data = fs.readFileSync(VIP_HISTORY_PATH, "utf8")
    if (!data.trim()) {
      return {}
    }
    return JSON.parse(data)
  } catch (err) {
    errorLog(`[VIP History] Erro ao carregar histórico: ${err.message}`)
    return {}
  }
}

/**
 * Salva o histórico no arquivo de forma atômica
 * @param {Object} history
 */
function saveHistory(history) {
  try {
    const dir = path.dirname(VIP_HISTORY_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const tempPath = `${VIP_HISTORY_PATH}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(history, null, 2), "utf8")

    if (fs.existsSync(VIP_HISTORY_PATH)) {
      fs.rmSync(VIP_HISTORY_PATH, { force: true })
    }
    fs.renameSync(tempPath, VIP_HISTORY_PATH)
  } catch (err) {
    errorLog(`[VIP History] Erro ao salvar histórico: ${err.message}`)
  }
}

/**
 * Verifica se pode enviar vaga para o assinante (intervalo de 5 minutos)
 * @param {string} lid - LID do assinante
 * @returns {boolean}
 */
export function canSendToSubscriber(lid) {
  const history = loadHistory()
  const subscriberHistory = history[lid]

  if (!subscriberHistory || !subscriberHistory.lastSentAt) {
    return true
  }

  const elapsed = Date.now() - subscriberHistory.lastSentAt
  return elapsed >= MIN_SEND_INTERVAL
}

/**
 * Retorna o tempo restante em ms até poder enviar novamente
 * @param {string} lid - LID do assinante
 * @returns {number} Tempo restante em ms (0 se pode enviar)
 */
export function getTimeUntilCanSend(lid) {
  const history = loadHistory()
  const subscriberHistory = history[lid]

  if (!subscriberHistory || !subscriberHistory.lastSentAt) {
    return 0
  }

  const elapsed = Date.now() - subscriberHistory.lastSentAt
  const remaining = MIN_SEND_INTERVAL - elapsed

  return remaining > 0 ? remaining : 0
}

/**
 * Verifica se a vaga já foi enviada para o assinante (dentro de 48h)
 * @param {string} lid - LID do assinante
 * @param {string} jobId - ID da vaga
 * @returns {boolean} true se já foi enviada recentemente
 */
export function wasJobSentRecently(lid, jobId) {
  const history = loadHistory()
  const subscriberHistory = history[lid]

  if (!subscriberHistory || !subscriberHistory.sentJobs) {
    return false
  }

  const sentAt = subscriberHistory.sentJobs[jobId]
  if (!sentAt) {
    return false
  }

  const elapsed = Date.now() - sentAt
  return elapsed < JOB_REPOST_COOLDOWN
}

/**
 * Registra o envio de uma vaga para o assinante
 * @param {string} lid - LID do assinante
 * @param {string} jobId - ID da vaga
 */
export function recordJobSent(lid, jobId) {
  const history = loadHistory()

  if (!history[lid]) {
    history[lid] = {
      lastSentAt: 0,
      sentJobs: {}
    }
  }

  const now = Date.now()
  history[lid].lastSentAt = now
  history[lid].sentJobs[jobId] = now

  saveHistory(history)
  infoLog(`[VIP History] Registrado envio para ${lid}: ${jobId}`)
}

/**
 * Limpa vagas antigas do histórico (mais de 48h)
 * Deve ser chamado periodicamente para evitar crescimento indefinido
 */
export function cleanOldEntries() {
  const history = loadHistory()
  const now = Date.now()
  let cleaned = 0

  for (const lid of Object.keys(history)) {
    const subscriberHistory = history[lid]
    if (!subscriberHistory.sentJobs) continue

    for (const jobId of Object.keys(subscriberHistory.sentJobs)) {
      const sentAt = subscriberHistory.sentJobs[jobId]
      if (now - sentAt > JOB_REPOST_COOLDOWN) {
        delete subscriberHistory.sentJobs[jobId]
        cleaned++
      }
    }
  }

  if (cleaned > 0) {
    saveHistory(history)
    infoLog(`[VIP History] Limpas ${cleaned} entradas antigas`)
  }
}

/**
 * Obtém estatísticas do histórico de um assinante
 * @param {string} lid - LID do assinante
 * @returns {Object}
 */
export function getSubscriberStats(lid) {
  const history = loadHistory()
  const subscriberHistory = history[lid]

  if (!subscriberHistory) {
    return {
      totalSent: 0,
      lastSentAt: null,
      canSendNow: true,
      timeUntilCanSend: 0
    }
  }

  const sentJobs = subscriberHistory.sentJobs || {}
  const totalSent = Object.keys(sentJobs).length
  const lastSentAt = subscriberHistory.lastSentAt
  const canSendNow = canSendToSubscriber(lid)
  const timeUntilCanSend = getTimeUntilCanSend(lid)

  return {
    totalSent,
    lastSentAt: lastSentAt ? new Date(lastSentAt).toISOString() : null,
    canSendNow,
    timeUntilCanSend
  }
}

/**
 * Obtém lista de IDs de vagas já enviadas para o assinante (dentro de 48h)
 * @param {string} lid - LID do assinante
 * @returns {Set<string>}
 */
export function getSentJobIds(lid) {
  const history = loadHistory()
  const subscriberHistory = history[lid]
  const result = new Set()

  if (!subscriberHistory || !subscriberHistory.sentJobs) {
    return result
  }

  const now = Date.now()
  for (const [jobId, sentAt] of Object.entries(subscriberHistory.sentJobs)) {
    // Só inclui se foi enviado nas últimas 48h
    if (now - sentAt < JOB_REPOST_COOLDOWN) {
      result.add(jobId)
    }
  }

  return result
}

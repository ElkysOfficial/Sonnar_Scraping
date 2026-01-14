/**
 * Gerenciador de histórico de vagas enviadas.
 * Persiste em JSON local, com suporte a cooldown por tempo.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Caminho do arquivo de histórico (no diretório database)
const HISTORY_FILE = path.resolve(__dirname, "..", "..", "database", "sent_history.json")

/**
 * @typedef {Object} SentRecord
 * @property {string} jobId - ID ou URL da vaga
 * @property {string} groupId - ID do grupo
 * @property {number} sentAt - Timestamp do envio
 */

/**
 * @typedef {Object} HistoryData
 * @property {SentRecord[]} records - Lista de registros
 * @property {string[]} recentStacks - Últimas stacks enviadas (para diversidade)
 */

/**
 * Carrega o histórico do arquivo JSON.
 * @returns {HistoryData}
 */
export function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return { records: [], recentStacks: [] }
    }
    const data = fs.readFileSync(HISTORY_FILE, "utf8")
    const parsed = JSON.parse(data)
    return {
      records: parsed.records || [],
      recentStacks: parsed.recentStacks || []
    }
  } catch (err) {
    console.error(`Erro ao carregar histórico: ${err.message}`)
    return { records: [], recentStacks: [] }
  }
}

/**
 * Salva o histórico no arquivo JSON.
 * @param {HistoryData} history
 */
export function saveHistory(history) {
  try {
    const dir = path.dirname(HISTORY_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2))
  } catch (err) {
    console.error(`Erro ao salvar histórico: ${err.message}`)
  }
}

/**
 * Registra uma vaga como enviada.
 * @param {string} groupId
 * @param {string} jobId - ID ou URL da vaga
 * @param {string} [stack] - Stack da vaga (para tracking de diversidade)
 */
export function markAsSent(groupId, jobId, stack = "other") {
  const history = loadHistory()

  history.records.push({
    jobId,
    groupId,
    sentAt: Date.now()
  })

  // Mantém apenas as últimas 10 stacks para tracking de diversidade
  history.recentStacks.push(stack)
  if (history.recentStacks.length > 10) {
    history.recentStacks = history.recentStacks.slice(-10)
  }

  saveHistory(history)
}

/**
 * Obtém IDs de vagas enviadas dentro do período de cooldown.
 * @param {string} groupId
 * @param {number} [cooldownDays=7] - Dias de cooldown
 * @returns {Set<string>}
 */
export function getSentIds(groupId, cooldownDays = 7) {
  const history = loadHistory()
  const cutoff = Date.now() - cooldownDays * 24 * 60 * 60 * 1000

  const sentIds = new Set()
  for (const record of history.records) {
    if (record.groupId === groupId && record.sentAt > cutoff) {
      sentIds.add(record.jobId)
    }
  }
  return sentIds
}

/**
 * Obtém as stacks recentes (para garantir diversidade).
 * @returns {string[]}
 */
export function getRecentStacks() {
  const history = loadHistory()
  return history.recentStacks
}

/**
 * Limpa registros antigos (mais velhos que cooldownDays).
 * Útil para manutenção periódica.
 * @param {number} [cooldownDays=7]
 */
export function cleanOldRecords(cooldownDays = 7) {
  const history = loadHistory()
  const cutoff = Date.now() - cooldownDays * 24 * 60 * 60 * 1000

  const originalCount = history.records.length
  history.records = history.records.filter((record) => record.sentAt > cutoff)

  if (history.records.length < originalCount) {
    saveHistory(history)
    console.log(`Histórico limpo: ${originalCount - history.records.length} registros removidos`)
  }
}

/**
 * Verifica se uma vaga específica já foi enviada (dentro do cooldown).
 * @param {string} groupId
 * @param {string} jobId
 * @param {number} [cooldownDays=7]
 * @returns {boolean}
 */
export function wasJobSent(groupId, jobId, cooldownDays = 7) {
  const sentIds = getSentIds(groupId, cooldownDays)
  return sentIds.has(jobId)
}

/**
 * Reseta o histórico completamente.
 * Útil para testes ou reinício forçado.
 */
export function resetHistory() {
  saveHistory({ records: [], recentStacks: [] })
}

/**
 * Obtém estatísticas do histórico.
 * @param {string} [groupId] - Filtrar por grupo (opcional)
 * @returns {{ total: number, byGroup: Record<string, number>, byStack: Record<string, number> }}
 */
export function getStats(groupId) {
  const history = loadHistory()

  const byGroup = {}
  for (const record of history.records) {
    if (groupId && record.groupId !== groupId) continue
    byGroup[record.groupId] = (byGroup[record.groupId] || 0) + 1
  }

  const byStack = {}
  for (const stack of history.recentStacks) {
    byStack[stack] = (byStack[stack] || 0) + 1
  }

  return {
    total: history.records.length,
    byGroup,
    byStack
  }
}

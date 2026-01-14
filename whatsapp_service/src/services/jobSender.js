/**
 * Serviço de envio automático de vagas para WhatsApp
 * Envia vagas do embeds.json para o grupo configurado com intervalo aleatório de 5-8 minutos
 * Utiliza seleção aleatória justa com diversidade de stacks.
 *
 * @author Sonar Bot
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { JOB_GROUP_ID, EMBEDS_FILE_PATH, BOT_EMOJI } from "../config.js"
import { selectNextJob, extractStack } from "./jobDistributor.js"
import { getSentIds, getRecentStacks, markAsSent, cleanOldRecords } from "./sentHistory.js"

// Intervalo aleatório entre 30s e 1 minuto (em milissegundos) - TESTE
const MIN_INTERVAL = 30 * 1000 // 30 segundos
const MAX_INTERVAL = 60 * 1000 // 1 minuto

// Configurações de distribuição
const COOLDOWN_DAYS = 7 // Dias antes de reenviar mesma vaga
const MAX_CONSECUTIVE_SAME_STACK = 1 // Máximo de vagas consecutivas da mesma stack (1 = nunca repete seguidas)

/**
 * Gera um intervalo aleatório entre MIN e MAX
 * @returns {number} Intervalo em milissegundos
 */
function getRandomInterval() {
  return Math.floor(Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)) + MIN_INTERVAL
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Carrega as vagas do arquivo embeds.json
 * @returns {Array} Array de vagas ou array vazio se arquivo não existir
 */
function loadEmbeds() {
  try {
    if (!fs.existsSync(EMBEDS_FILE_PATH)) {
      return []
    }
    const data = fs.readFileSync(EMBEDS_FILE_PATH, "utf8")
    return JSON.parse(data)
  } catch (err) {
    if (err instanceof SyntaxError) {
      errorLog("Erro de sintaxe no embeds.json")
    } else {
      errorLog(`Erro ao carregar embeds.json: ${err.message}`)
    }
    return []
  }
}

/**
 * Salva as vagas no arquivo embeds.json
 * @param {Array} embeds - Array de vagas
 */
function saveEmbeds(embeds) {
  try {
    fs.writeFileSync(EMBEDS_FILE_PATH, JSON.stringify(embeds, null, 2))
  } catch (err) {
    errorLog(`Erro ao salvar embeds.json: ${err.message}`)
  }
}

/**
 * Formata a mensagem da vaga para envio no WhatsApp
 * @param {Object} job - Objeto da vaga
 * @returns {string} Mensagem formatada
 */
function formatJobMessage(job) {
  // Extrai dados do embed (formato Discord) ou dados diretos
  const title = job.title || job.job_title || "Não informado"
  const company = job.author?.name || job.company || "Não informado"

  // Extrai campos do embed Discord
  const fields = job.fields || []
  const getFieldValue = name => {
    const field = fields.find(f => f.name?.toLowerCase().includes(name.toLowerCase()))
    return field?.value || null
  }

  const location = getFieldValue("local") || job.location || "Não informado"
  const salary = getFieldValue("salário") || getFieldValue("salario") || job.salary || "Não informado"
  const regime = getFieldValue("regime") || job.hiring_regime || "Não informado"
  const workType = getFieldValue("tipo") || job.work_type || "Não informado"
  const publicationDate = getFieldValue("publicação") || getFieldValue("publicacao") || job.publication_date || "Não informado"
  const jobUrl = job.url || job.job_url || ""

  let message = `💼 *NOVA VAGA DE EMPREGO*\n\n`
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

  message += `\n\n_Enviado automaticamente pelo ${BOT_EMOJI} Sonar Bot_`

  return message
}

/**
 * Envia uma vaga para o grupo do WhatsApp
 * @param {Object} socket - Socket do Baileys
 * @param {Object} job - Objeto da vaga
 * @returns {boolean} True se enviou com sucesso
 */
async function sendJob(socket, job) {
  try {
    const message = formatJobMessage(job)

    await socket.sendMessage(JOB_GROUP_ID, {
      text: message
    })

    return true
  } catch (err) {
    errorLog(`Erro ao enviar vaga: ${err.message}`)
    return false
  }
}

/**
 * Processa e envia a próxima vaga com seleção aleatória justa.
 * @param {Object} socket - Socket do Baileys
 */
async function processNextJob(socket) {
  const embeds = loadEmbeds()

  if (embeds.length === 0) {
    return
  }

  // Filtra apenas vagas ainda não marcadas como enviadas no arquivo
  const pendingJobs = embeds.filter((job) => job.whatsappSent !== true)

  if (pendingJobs.length === 0) {
    infoLog("📭 Todas as vagas do arquivo já foram enviadas")
    return
  }

  // Obtém histórico de envios (cooldown) e stacks recentes (diversidade)
  const sentIds = getSentIds(JOB_GROUP_ID, COOLDOWN_DAYS)
  const recentStacks = getRecentStacks()

  // Seleciona próxima vaga com algoritmo justo
  const job = selectNextJob({
    jobs: pendingJobs,
    groupId: JOB_GROUP_ID,
    sentIds,
    recentStacks,
    maxConsecutive: MAX_CONSECUTIVE_SAME_STACK
  })

  if (!job) {
    infoLog("📭 Nenhuma vaga disponível (todas em cooldown)")
    return
  }

  const title = job.title || job.job_title || "Vaga"
  const stack = extractStack(job)
  const jobId = job.id || job.url || job.job_url

  infoLog(`📤 Enviando vaga: ${title} [stack: ${stack}]`)

  const success = await sendJob(socket, job)

  if (success) {
    // Marca no arquivo embeds.json
    const jobIndex = embeds.findIndex((e) => (e.id || e.url || e.job_url) === jobId)
    if (jobIndex !== -1) {
      embeds[jobIndex].whatsappSent = true
      saveEmbeds(embeds)
    }

    // Registra no histórico local (para cooldown e diversidade)
    markAsSent(JOB_GROUP_ID, jobId, stack)

    successLog(`✅ Vaga enviada com sucesso: ${title}`)
  }
}

/**
 * Agenda o próximo envio com intervalo aleatório
 * @param {Object} socket - Socket do Baileys
 */
function scheduleNextJob(socket) {
  const interval = getRandomInterval()
  const minutes = Math.floor(interval / 60000)
  const seconds = Math.floor((interval % 60000) / 1000)

  infoLog(`⏱️ Próximo envio em ${minutes}m ${seconds}s`)

  setTimeout(async () => {
    await processNextJob(socket)
    scheduleNextJob(socket) // Agenda o próximo após enviar
  }, interval)
}

/**
 * Inicia o serviço de envio automático de vagas
 * @param {Object} socket - Socket do Baileys
 */
export function startJobSender(socket) {
  if (!JOB_GROUP_ID) {
    warningLog("⚠️ JOB_GROUP_ID não configurado no config.js. Serviço de vagas desativado.")
    warningLog("   Use o comando /get-group-id em um grupo para obter o ID.")
    return
  }

  if (!EMBEDS_FILE_PATH) {
    warningLog("⚠️ EMBEDS_FILE_PATH não configurado. Serviço de vagas desativado.")
    return
  }

  if (!fs.existsSync(EMBEDS_FILE_PATH)) {
    warningLog(`⚠️ Arquivo de vagas não encontrado: ${EMBEDS_FILE_PATH}`)
    warningLog("   O serviço aguardará o arquivo ser criado.")
  }

  // Limpa registros antigos do histórico
  cleanOldRecords(COOLDOWN_DAYS)

  infoLog("════════════════════════════════════════════════════")
  infoLog("       📋 SERVIÇO DE VAGAS INICIADO")
  infoLog("════════════════════════════════════════════════════")
  infoLog(`⏱️  Intervalo: aleatório entre ${MIN_INTERVAL / 60000}-${MAX_INTERVAL / 60000} minutos`)
  infoLog(`🔀 Seleção: aleatória com diversidade de stacks`)
  infoLog(`🔄 Cooldown: ${COOLDOWN_DAYS} dias`)
  infoLog(`📍 Grupo: ${JOB_GROUP_ID}`)
  infoLog(`📁 Arquivo: ${EMBEDS_FILE_PATH}`)
  infoLog("════════════════════════════════════════════════════")

  // Executa a primeira vez após 10 segundos
  setTimeout(async () => {
    await processNextJob(socket)
    scheduleNextJob(socket) // Inicia o ciclo de envios aleatórios
  }, 10000)
}

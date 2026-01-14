/**
 * Serviço de envio automático de vagas para WhatsApp
 * Envia vagas do embeds.json para o grupo configurado com intervalo aleatório de 5-8 minutos
 *
 * @author Sonar Bot
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { JOB_GROUP_ID, EMBEDS_FILE_PATH, BOT_EMOJI } from "../config.js"

// Intervalo aleatório entre 3 e 6 minutos (em milissegundos)
const MIN_INTERVAL = 3 * 60 * 1000 // 3 minutos
const MAX_INTERVAL = 6 * 60 * 1000 // 6 minutos

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
 * Processa e envia a próxima vaga não enviada
 * @param {Object} socket - Socket do Baileys
 */
async function processNextJob(socket) {
  const embeds = loadEmbeds()

  if (embeds.length === 0) {
    return
  }

  // Encontra a primeira vaga não enviada para WhatsApp
  const pendingJobIndex = embeds.findIndex(job => job.whatsappSent !== true)

  if (pendingJobIndex === -1) {
    return // Todas as vagas já foram enviadas
  }

  const job = embeds[pendingJobIndex]
  const title = job.title || job.job_title || "Vaga"

  infoLog(`📤 Enviando vaga: ${title}`)

  const success = await sendJob(socket, job)

  if (success) {
    // Marca a vaga como enviada para WhatsApp
    embeds[pendingJobIndex].whatsappSent = true
    saveEmbeds(embeds)
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

  infoLog("════════════════════════════════════════════════════")
  infoLog("       📋 SERVIÇO DE VAGAS INICIADO")
  infoLog("════════════════════════════════════════════════════")
  infoLog(`⏱️  Intervalo: aleatório entre 5-8 minutos`)
  infoLog(`📍 Grupo: ${JOB_GROUP_ID}`)
  infoLog(`📁 Arquivo: ${EMBEDS_FILE_PATH}`)
  infoLog("════════════════════════════════════════════════════")

  // Executa a primeira vez após 10 segundos
  setTimeout(async () => {
    await processNextJob(socket)
    scheduleNextJob(socket) // Inicia o ciclo de envios aleatórios
  }, 10000)
}

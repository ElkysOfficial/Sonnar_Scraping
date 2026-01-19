/**
 * Serviço de envio automático de vagas para WhatsApp
 * Envia vagas do embeds.json para o grupo configurado com intervalo fixo de 5 minutos
 * Utiliza seleção aleatória justa com diversidade de stacks.
 *
 * @author Sonar Bot
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { JOB_GROUP_ID, EMBEDS_FILE_PATH, BOT_EMOJI, JOB_SEND_INTERVAL } from "../config.js"
import { selectNextJob, extractStack } from "./jobDistributor.js"
import { getSentIds, getRecentStacks, markAsSent, cleanOldRecords } from "./sentHistory.js"
import { getCurrentSocket, isCurrentSocketReady } from "../utils/socketManager.js"

// Intervalo fixo entre envios (em milissegundos)
const FIXED_INTERVAL = JOB_SEND_INTERVAL || 5 * 60 * 1000
const VIP_PROMO_INTERVAL = 2 * 60 * 60 * 1000

// Configurações de distribuição
const COOLDOWN_DAYS = 1 // Dias antes de reenviar mesma vaga (24 horas)
const MAX_CONSECUTIVE_SAME_STACK = 1 // Máximo de vagas consecutivas da mesma stack (1 = nunca repete seguidas)
let jobSenderTimeoutId = null
let jobSenderToken = 0

/**
 * Gera o intervalo de envio
 * @returns {number} Intervalo em milissegundos
 */
function getNextInterval() {
  return FIXED_INTERVAL
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROMO_STATE_PATH = path.resolve(__dirname, "..", "..", "database", "vip-promo-state.json")

const VIP_PROMO_MESSAGE = `🚀 Quer receber vagas do seu stack em prioridade? Vira VIP.

No VIP, você não depende do fluxo geral:
✅ Você tem uma rota dedicada só pro seu perfil (ex: tech lead, python, java, frontend, devops, etc.)
✅ O bot faz scraping com todas as fontes ativas (se eu adicionar novas engines, você automaticamente ganha elas também)
✅ Nada de vaga repetida
✅ Entrega contínua e organizada: vagas novas enviadas em intervalos, sem spam e sem bagunça
✅ Você recebe vagas muito mais relevantes, com foco total no seu objetivo

📌 É literalmente o bot trabalhando pra você, em vez de você perder tempo filtrando vaga ruim.`

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
    if (!data.trim()) {
      return []
    }
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

function readPromoState() {
  try {
    if (!fs.existsSync(PROMO_STATE_PATH)) {
      return { lastSentAt: 0 }
    }
    const raw = fs.readFileSync(PROMO_STATE_PATH, "utf8")
    if (!raw.trim()) {
      return { lastSentAt: 0 }
    }
    const data = JSON.parse(raw)
    return { lastSentAt: data?.lastSentAt || 0 }
  } catch (err) {
    errorLog(`Erro ao ler estado da promo VIP: ${err.message}`)
    return { lastSentAt: 0 }
  }
}

function writePromoState(state) {
  try {
    const payload = JSON.stringify(state, null, 2)
    writeJsonAtomic(PROMO_STATE_PATH, payload)
  } catch (err) {
    errorLog(`Erro ao salvar estado da promo VIP: ${err.message}`)
  }
}

async function maybeSendVipPromo() {
  try {
    const socket = getCurrentSocket()
    if (!isCurrentSocketReady()) {
      warningLog("[PROMO] Conexao fechada. Envio de promo VIP aguardando reconexao.")
      return false
    }

    const state = readPromoState()
    const now = Date.now()
    if (now - state.lastSentAt < VIP_PROMO_INTERVAL) {
      infoLog("[PROMO] Promo VIP ainda em cooldown (2h)")
      return false
    }

    infoLog(`[PROMO] Enviando promo VIP para o grupo ${JOB_GROUP_ID}...`)
    await socket.sendMessage(JOB_GROUP_ID, { text: VIP_PROMO_MESSAGE })
    writePromoState({ lastSentAt: now })
    successLog("[PROMO] Promo VIP enviada com sucesso!")
    return true
  } catch (err) {
    errorLog(`[PROMO] Erro ao enviar promo VIP: ${err.message}`)
    return false
  }
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  const tempPath = path.join(dir, `.tmp-${base}-${process.pid}-${Date.now()}`)
  fs.writeFileSync(tempPath, data, "utf8")
  try {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
    }
    fs.renameSync(tempPath, filePath)
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true })
    }
    throw error
  }
}

/**
 * Salva as vagas no arquivo embeds.json
 * @param {Array} embeds - Array de vagas
 */
function saveEmbeds(embeds) {
  try {
    const payload = JSON.stringify(embeds, null, 2)
    writeJsonAtomic(EMBEDS_FILE_PATH, payload)
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

  // Extrai campos do embed Discord (normalizando nome para evitar mismatch)
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
 * @param {Object} job - Objeto da vaga
 * @returns {boolean} True se enviou com sucesso
 */
async function sendJob(job) {
  try {
    const socket = getCurrentSocket()
    if (!isCurrentSocketReady()) {
      warningLog("Conexao fechada. Envio de vaga aguardando reconexao.")
      return false
    }
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
 */
async function processNextJob() {
  infoLog("[GRUPO] Iniciando processamento de vaga para o grupo...")

  if (!isCurrentSocketReady()) {
    warningLog("[GRUPO] Conexao fechada. Processamento de vagas aguardando reconexao.")
    return
  }

  infoLog("[GRUPO] Socket pronto. Carregando embeds...")
  const embeds = loadEmbeds()

  if (embeds.length === 0) {
    warningLog("[GRUPO] Nenhuma vaga no arquivo embeds.json")
    return
  }

  infoLog(`[GRUPO] Total de vagas carregadas: ${embeds.length}`)

  // Filtra apenas vagas ainda não marcadas como enviadas no arquivo
  const pendingJobs = embeds.filter(job => job.whatsappSent !== true)

  infoLog(`[GRUPO] Vagas pendentes (whatsappSent != true): ${pendingJobs.length}`)

  if (pendingJobs.length === 0) {
    infoLog("📭 [GRUPO] Todas as vagas do arquivo já foram enviadas")
    return
  }

  // Obtém histórico de envios (cooldown) e stacks recentes (diversidade)
  const sentIds = getSentIds(JOB_GROUP_ID, COOLDOWN_DAYS)
  const recentStacks = getRecentStacks()

  infoLog(`[GRUPO] IDs em cooldown: ${sentIds.size}, Stacks recentes: ${recentStacks.length}`)

  // Seleciona próxima vaga com algoritmo justo
  const job = selectNextJob({
    jobs: pendingJobs,
    groupId: JOB_GROUP_ID,
    sentIds,
    recentStacks,
    maxConsecutive: MAX_CONSECUTIVE_SAME_STACK
  })

  if (!job) {
    infoLog("📭 [GRUPO] Nenhuma vaga disponível (todas em cooldown ou diversidade)")
    return
  }

  const title = job.title || job.job_title || "Vaga"
  const stack = extractStack(job)
  const jobId = job.id || job.url || job.job_url

  infoLog(`📤 Enviando vaga: ${title} [stack: ${stack}]`)

  const success = await sendJob(job)

  if (success) {
    // Marca no arquivo embeds.json
    const jobIndex = embeds.findIndex(e => (e.id || e.url || e.job_url) === jobId)
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
 * Agenda o próximo envio com intervalo fixo
 */
function scheduleNextJob() {
  const token = jobSenderToken
  const interval = getNextInterval()
  const minutes = Math.floor(interval / 60000)
  const seconds = Math.floor((interval % 60000) / 1000)

  infoLog(`⏱️ Próximo envio de vaga no grupo em ${minutes}m ${seconds}s`)

  jobSenderTimeoutId = setTimeout(async () => {
    if (token !== jobSenderToken) {
      return
    }
    await processNextJob()
    await maybeSendVipPromo()
    scheduleNextJob() // Agenda o próximo após enviar
  }, interval)
}

/**
 * Inicia o serviço de envio automático de vagas
 * @param {Object} socket - Socket do Baileys (usado apenas para inicialização)
 */
export function startJobSender(socket) {
  if (jobSenderTimeoutId) {
    clearTimeout(jobSenderTimeoutId)
    jobSenderTimeoutId = null
  }
  jobSenderToken += 1
  const token = jobSenderToken

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
  infoLog("       📋 SERVIÇO DE VAGAS DO GRUPO INICIADO")
  infoLog("════════════════════════════════════════════════════")
  infoLog(`⏱️  Intervalo: ${FIXED_INTERVAL / 60000} minutos`)
  infoLog(`🔀 Seleção: aleatória com diversidade de stacks`)
  infoLog(`🔄 Cooldown: ${COOLDOWN_DAYS * 24} horas`)
  infoLog(`📍 Grupo: ${JOB_GROUP_ID}`)
  infoLog(`📁 Arquivo: ${EMBEDS_FILE_PATH}`)
  infoLog("════════════════════════════════════════════════════")

  // Primeira execução após 30 segundos para permitir conexão estabilizar
  infoLog(`⏱️ Primeira vaga do grupo será enviada em 30 segundos`)
  jobSenderTimeoutId = setTimeout(async () => {
    if (token !== jobSenderToken) {
      return
    }
    infoLog("[GRUPO] Executando primeiro envio de vaga...")
    await processNextJob()
    await maybeSendVipPromo()
    scheduleNextJob() // Inicia o ciclo de envios fixos
  }, 30 * 1000)
}

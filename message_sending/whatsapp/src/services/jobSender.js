/**
 * Serviço de envio automático de vagas para WhatsApp
 * Busca vagas do Supabase e envia para o grupo configurado
 * Utiliza seleção aleatória justa com diversidade de stacks.
 *
 * @author Sonar Bot
 */

import "dotenv/config"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { JOB_GROUP_ID, BOT_EMOJI, JOB_SEND_INTERVAL } from "../config.js"
import { selectNextJob, extractStack } from "./jobDistributor.js"
import { getCurrentSocket, isCurrentSocketReady } from "../utils/socketManager.js"
import {
  getPendingWhatsAppJobs,
  markJobSentToWhatsApp,
  getSenderState,
  updateSenderState,
  recordGroupDelivery,
  getGroupSentJobsToday
} from "./database.js"

// Intervalo fixo entre envios (em milissegundos)
const FIXED_INTERVAL = JOB_SEND_INTERVAL || 5 * 60 * 1000
const VIP_PROMO_INTERVAL = 2 * 60 * 60 * 1000

// Configurações de distribuição
const MAX_CONSECUTIVE_SAME_STACK = 1

let jobSenderTimeoutId = null
let jobSenderToken = 0

// Cache local de stacks recentes (para diversidade)
const recentStacksCache = []
const MAX_RECENT_STACKS = 10

/**
 * Gera o intervalo de envio
 */
function getNextInterval() {
  return FIXED_INTERVAL
}

/**
 * Lê o estado do job sender do Supabase
 */
async function readJobSenderState() {
  try {
    const state = await getSenderState("job")
    return {
      lastSentAt: state?.last_sent_at ? new Date(state.last_sent_at).getTime() : 0
    }
  } catch (err) {
    errorLog(`Erro ao ler estado do job sender: ${err.message}`)
    return { lastSentAt: 0 }
  }
}

/**
 * Salva o estado do job sender no Supabase
 */
async function writeJobSenderState(lastSentAt) {
  try {
    await updateSenderState("job", new Date(lastSentAt))
  } catch (err) {
    errorLog(`Erro ao salvar estado do job sender: ${err.message}`)
  }
}

/**
 * Calcula o tempo restante até o próximo envio
 */
async function getTimeUntilNextSend() {
  const state = await readJobSenderState()
  const now = Date.now()
  const elapsed = now - state.lastSentAt

  if (elapsed >= FIXED_INTERVAL) {
    return 5000
  }

  const remaining = FIXED_INTERVAL - elapsed
  return Math.max(5000, remaining)
}

/**
 * Lê o estado do VIP promo do Supabase
 */
async function readPromoState() {
  try {
    const state = await getSenderState("vip_promo")
    return {
      lastSentAt: state?.last_sent_at ? new Date(state.last_sent_at).getTime() : 0
    }
  } catch (err) {
    errorLog(`Erro ao ler estado da promo VIP: ${err.message}`)
    return { lastSentAt: 0 }
  }
}

/**
 * Salva o estado do VIP promo no Supabase
 */
async function writePromoState(lastSentAt) {
  try {
    await updateSenderState("vip_promo", new Date(lastSentAt))
  } catch (err) {
    errorLog(`Erro ao salvar estado da promo VIP: ${err.message}`)
  }
}

const VIP_PROMO_MESSAGE = `🚀 Quer receber vagas do seu stack em prioridade? Vira VIP.

No VIP, você não depende do fluxo geral:
✅ Você tem uma rota dedicada só pro seu perfil (ex: tech lead, python, java, frontend, devops, etc.)
✅ O bot faz scraping com todas as fontes ativas (se eu adicionar novas engines, você automaticamente ganha elas também)
✅ Nada de vaga repetida
✅ Entrega contínua e organizada: vagas novas enviadas em intervalos, sem spam e sem bagunça
✅ Você recebe vagas muito mais relevantes, com foco total no seu objetivo

📌 É literalmente o bot trabalhando pra você, em vez de você perder tempo filtrando vaga ruim.`

/**
 * Envia mensagem de promo VIP se necessário
 */
async function maybeSendVipPromo() {
  try {
    const socket = getCurrentSocket()
    if (!isCurrentSocketReady()) {
      warningLog("[PROMO] Conexao fechada. Envio de promo VIP aguardando reconexao.")
      return false
    }

    const state = await readPromoState()
    const now = Date.now()
    if (now - state.lastSentAt < VIP_PROMO_INTERVAL) {
      infoLog("[PROMO] Promo VIP ainda em cooldown (2h)")
      return false
    }

    infoLog(`[PROMO] Enviando promo VIP para o grupo ${JOB_GROUP_ID}...`)
    await socket.sendMessage(JOB_GROUP_ID, { text: VIP_PROMO_MESSAGE })
    await writePromoState(now)
    successLog("[PROMO] Promo VIP enviada com sucesso!")
    return true
  } catch (err) {
    errorLog(`[PROMO] Erro ao enviar promo VIP: ${err.message}`)
    return false
  }
}

/**
 * Formata a mensagem da vaga para envio no WhatsApp
 */
function formatJobMessage(job) {
  const title = job.job_title || "Não informado"
  const company = job.company || "Não informado"
  const location = job.location || "Não informado"
  const salary = job.salary || "Não informado"
  const regime = job.hiring_regime || "Não informado"
  const workType = job.work_type || "Não informado"
  const publicationDate = job.publication_date || "Não informado"
  const jobUrl = job.job_url || ""

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

  infoLog("[GRUPO] Socket pronto. Buscando vagas pendentes do Supabase...")

  try {
    // Busca vagas pendentes do Supabase
    const pendingJobs = await getPendingWhatsAppJobs(100)

    if (!pendingJobs || pendingJobs.length === 0) {
      infoLog("📭 [GRUPO] Nenhuma vaga pendente no banco de dados")
      return
    }

    infoLog(`[GRUPO] Total de vagas pendentes: ${pendingJobs.length}`)

    // Obtém vagas já enviadas hoje para esse grupo (cooldown)
    const sentToday = await getGroupSentJobsToday(JOB_GROUP_ID)

    infoLog(`[GRUPO] Vagas já enviadas hoje para este grupo: ${sentToday.size}`)

    // Seleciona próxima vaga com algoritmo justo
    const job = selectNextJob({
      jobs: pendingJobs,
      groupId: JOB_GROUP_ID,
      sentIds: sentToday,
      recentStacks: recentStacksCache,
      maxConsecutive: MAX_CONSECUTIVE_SAME_STACK
    })

    if (!job) {
      infoLog("📭 [GRUPO] Nenhuma vaga disponível (todas em cooldown ou diversidade)")
      return
    }

    const stack = extractStack(job)
    infoLog(`📤 Enviando vaga: ${job.job_title} [stack: ${stack}]`)

    const success = await sendJob(job)

    if (success) {
      // Marca como enviada no Supabase
      await markJobSentToWhatsApp(job.id)

      // Registra no histórico de entrega do grupo
      await recordGroupDelivery(job.id, JOB_GROUP_ID)

      // Atualiza cache de stacks recentes
      recentStacksCache.push(stack)
      if (recentStacksCache.length > MAX_RECENT_STACKS) {
        recentStacksCache.shift()
      }

      // Persiste o timestamp do envio
      await writeJobSenderState(Date.now())

      successLog(`✅ Vaga enviada com sucesso: ${job.job_title}`)
    }
  } catch (err) {
    errorLog(`[GRUPO] Erro ao processar vaga: ${err.message}`)
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
    scheduleNextJob()
  }, interval)
}

/**
 * Inicia o serviço de envio automático de vagas
 */
export async function startJobSender(socket) {
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

  // Calcula tempo restante baseado no último envio (persistido no Supabase)
  const timeUntilNext = await getTimeUntilNextSend()
  const state = await readJobSenderState()
  const lastSentAgo = state.lastSentAt > 0 ? Math.floor((Date.now() - state.lastSentAt) / 1000) : 0

  infoLog("════════════════════════════════════════════════════")
  infoLog("       📋 SERVIÇO DE VAGAS DO GRUPO INICIADO")
  infoLog("════════════════════════════════════════════════════")
  infoLog(`⏱️  Intervalo: ${FIXED_INTERVAL / 60000} minutos`)
  infoLog(`🔀 Seleção: aleatória com diversidade de stacks`)
  infoLog(`💾 Storage: Supabase (database)`)
  infoLog(`📍 Grupo: ${JOB_GROUP_ID}`)
  if (state.lastSentAt > 0) {
    infoLog(`📅 Último envio: há ${lastSentAgo} segundos`)
  } else {
    infoLog(`📅 Último envio: nunca (primeiro ciclo)`)
  }
  infoLog("════════════════════════════════════════════════════")

  const minutes = Math.floor(timeUntilNext / 60000)
  const seconds = Math.floor((timeUntilNext % 60000) / 1000)
  infoLog(`⏱️ Próxima vaga do grupo será enviada em ${minutes}m ${seconds}s`)

  jobSenderTimeoutId = setTimeout(async () => {
    if (token !== jobSenderToken) {
      return
    }
    infoLog("[GRUPO] Executando envio de vaga...")
    await processNextJob()
    await maybeSendVipPromo()
    scheduleNextJob()
  }, timeUntilNext)
}

/**
 * Para o serviço de envio de vagas
 */
export function stopJobSender() {
  if (jobSenderTimeoutId) {
    clearTimeout(jobSenderTimeoutId)
    jobSenderTimeoutId = null
  }
  jobSenderToken += 1
  infoLog("[GRUPO] Job sender stopped")
}

export default { startJobSender, stopJobSender }

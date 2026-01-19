/**
 * Serviço de envio de vagas personalizadas para assinantes VIP
 * Envia vagas filtradas por stack para o privado dos assinantes
 *
 * REGRAS:
 * - Apenas 1 vaga enviada a cada 5 minutos por assinante
 * - Mesma vaga não é enviada duas vezes (exceto após 48 horas)
 * - Estado persistido em arquivo para sobreviver a reinicializações
 *
 * @author Sonar Bot
 */

import fs from "node:fs"
import { delay } from "baileys"
import { infoLog, infoLogAlways, successLog, warningLog, errorLog } from "../utils/logger.js"
import { EMBEDS_FILE_PATH, BOT_EMOJI, TIMEOUT_IN_MILLISECONDS_BY_EVENT } from "../config.js"
import { extractStack } from "./jobDistributor.js"
import { getVipSubscribers } from "../utils/database.js"
import { getCurrentSocket, isCurrentSocketReady } from "../utils/socketManager.js"
import {
  canSendToSubscriber,
  wasJobSentRecently,
  recordJobSent,
  getTimeUntilCanSend,
  getSentJobIds,
  cleanOldEntries
} from "./vipHistory.js"

// Intervalo entre verificações (5 minutos)
const CHECK_INTERVAL = 5 * 60 * 1000
let vipTimeoutId = null
let vipIntervalId = null
let vipRunToken = 0
let vipPendingTimeoutId = null

// Buscas VIP pendentes quando a conexao esta fechada
const pendingVipSearches = new Map()

function queueVipSearch(lid, stacks) {
  pendingVipSearches.set(lid, { stacks, queuedAt: Date.now() })
}

async function processPendingVipSearches() {
  if (pendingVipSearches.size === 0) {
    return
  }

  for (const [lid, data] of pendingVipSearches.entries()) {
    const result = await triggerVipSearch(lid, data.stacks, { allowQueue: false })

    if (result.success && (result.jobsFound === 0 || result.jobsSent > 0)) {
      pendingVipSearches.delete(lid)
    }

    await delay(1000)
  }
}

/**
 * Carrega as vagas do arquivo embeds.json
 * @returns {Array} Array de vagas
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
    errorLog(`[VIP] Erro ao carregar embeds.json: ${err.message}`)
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
  return stack
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .trim()
}

/**
 * Verifica se a vaga corresponde às stacks do assinante
 * IMPORTANTE: Somente retorna true se a vaga corresponder EXATAMENTE ao que o assinante deseja
 * @param {Object} job - Vaga
 * @param {string[]} subscriberStacks - Stacks do assinante
 * @returns {boolean}
 */
function jobMatchesStacks(job, subscriberStacks) {
  const jobTitle = (job.title || job.job_title || "").toLowerCase()
  const normalizedJobTitle = normalizeStack(jobTitle)

  // Termos que indicam vagas de nível junior/estagiário (para exclusão em algumas stacks)
  const juniorTerms = ["junior", "jr", "estagio", "estágio", "intern", "trainee", "aprendiz"]

  for (const stack of subscriberStacks) {
    const normalizedStack = normalizeStack(stack)

    // Se o assinante quer "todas" as vagas
    if (normalizedStack === "todas" || normalizedStack === "all") {
      return true
    }

    // Mapeamentos específicos e restritos
    const stackMappings = {
      // Tech Lead - vagas de liderança técnica, senior e pleno (NUNCA junior/estagiário)
      "tech lead": {
        terms: ["tech lead", "lider tecnico", "lider de tecnologia", "technical lead", "lead developer", "lead engineer", "engineering lead", "lider de engenharia", "lider de desenvolvimento", "senior", "sr.", "pleno", "pl.", "especialista", "arquiteto", "architect", "principal", "staff", "gerente", "manager", "coordenador", "head"],
        excludeJunior: true
      },

      // Design - vagas de design
      "design": {
        terms: ["design", "designer", "ux", "ui", "ux/ui", "ui/ux", "product design", "product designer", "grafico", "visual design", "web design", "web designer"],
        excludeJunior: false
      },

      // Frontend
      "frontend": {
        terms: ["frontend", "front-end", "front end"],
        excludeJunior: false
      },

      // Backend
      "backend": {
        terms: ["backend", "back-end", "back end"],
        excludeJunior: false
      },

      // Fullstack
      "fullstack": {
        terms: ["fullstack", "full-stack", "full stack"],
        excludeJunior: false
      },

      // Mobile
      "mobile": {
        terms: ["mobile", "android", "ios", "flutter", "react native"],
        excludeJunior: false
      },

      // DevOps
      "devops": {
        terms: ["devops", "dev ops", "sre", "site reliability"],
        excludeJunior: false
      },

      // Data
      "data": {
        terms: ["data", "dados", "data science", "data engineer", "cientista de dados", "engenheiro de dados"],
        excludeJunior: false
      },

      // QA
      "qa": {
        terms: ["qa", "quality", "teste", "tester", "testing", "qualidade"],
        excludeJunior: false
      },

      // Estágio
      "estagio": {
        terms: ["estagio", "estágio", "intern", "internship"],
        excludeJunior: false
      },

      // Python
      "python": {
        terms: ["python"],
        excludeJunior: false
      },

      // Java
      "java": {
        terms: ["java"],
        excludeJunior: false
      },

      // Node
      "node": {
        terms: ["node", "nodejs", "node.js"],
        excludeJunior: false
      },

      // React
      "react": {
        terms: ["react", "reactjs", "react.js"],
        excludeJunior: false
      },

      // Angular
      "angular": {
        terms: ["angular", "angularjs"],
        excludeJunior: false
      },

      // Vue
      "vue": {
        terms: ["vue", "vuejs", "vue.js"],
        excludeJunior: false
      },
    }

    // Verifica se a stack aparece diretamente no título
    if (normalizedJobTitle.includes(normalizedStack)) {
      // Se for tech lead, verificar se não é junior/estagiário
      if (normalizedStack === "tech lead") {
        const isJunior = juniorTerms.some(term => normalizedJobTitle.includes(normalizeStack(term)))
        if (isJunior) {
          return false
        }
      }
      return true
    }

    // Verifica mapeamentos específicos
    const mapping = stackMappings[normalizedStack]
    if (mapping) {
      // Se deve excluir junior, verifica primeiro
      if (mapping.excludeJunior) {
        const isJunior = juniorTerms.some(term => normalizedJobTitle.includes(normalizeStack(term)))
        if (isJunior) {
          continue // Pula para a próxima stack do assinante
        }
      }

      // Verifica se algum termo corresponde
      for (const term of mapping.terms) {
        if (normalizedJobTitle.includes(normalizeStack(term))) {
          return true
        }
      }
    }
  }

  return false
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
 * Envia uma vaga para um assinante VIP
 * IMPORTANTE: Verifica intervalo de 5 minutos e histórico de 48h via persistência
 * @param {string} lid - LID do assinante
 * @param {Object} job - Vaga a enviar
 * @returns {{success: boolean, reason?: string}}
 */
async function sendJobToSubscriber(lid, job) {
  try {
    const socket = getCurrentSocket()
    if (!isCurrentSocketReady()) {
      warningLog("Conexao fechada. Envio VIP aguardando reconexao.")
      return { success: false, reason: "connection_closed" }
    }

    // Verifica intervalo de 5 minutos (persistido)
    if (!canSendToSubscriber(lid)) {
      const remaining = getTimeUntilCanSend(lid)
      const remainingMin = Math.ceil(remaining / 60000)
      warningLog(`[VIP] Cooldown ativo para ${lid}. Aguardar ${remainingMin} minutos.`)
      return { success: false, reason: "cooldown" }
    }

    const jobId = job.id || job.url || job.job_url

    // Verifica se a vaga já foi enviada nas últimas 48h (persistido)
    if (wasJobSentRecently(lid, jobId)) {
      return { success: false, reason: "already_sent" }
    }

    const jid = lidToJid(lid)
    const message = formatJobMessage(job)

    await delay(TIMEOUT_IN_MILLISECONDS_BY_EVENT)
    await socket.sendMessage(jid, { text: message })

    // Registra o envio (persiste em arquivo)
    recordJobSent(lid, jobId)

    return { success: true }
  } catch (err) {
    errorLog(`[VIP] Erro ao enviar vaga para ${lid}: ${err.message}`)
    return { success: false, reason: "error" }
  }
}

/**
 * Processa novas vagas e envia para assinantes VIP
 */
async function processVipJobs() {
  if (!isCurrentSocketReady()) {
    warningLog("Conexao fechada. Verificacao VIP aguardando reconexao.")
    return
  }

  await processPendingVipSearches()

  // Limpa entradas antigas periodicamente
  cleanOldEntries()

  const embeds = loadEmbeds()
  const subscribers = getVipSubscribers()

  if (embeds.length === 0 || subscribers.length === 0) {
    return
  }

  infoLog(`[VIP] Verificando vagas para ${subscribers.length} assinantes`)

  for (const subscriber of subscribers) {
    // Verifica cooldown de 5 minutos (persistido)
    if (!canSendToSubscriber(subscriber.lid)) {
      continue
    }

    // Obtém IDs de vagas já enviadas nas últimas 48h
    const sentJobIds = getSentJobIds(subscriber.lid)

    for (const job of embeds.slice(-200)) {
      const jobId = job.id || job.url || job.job_url

      // Pula vagas já enviadas nas últimas 48h
      if (sentJobIds.has(jobId)) {
        continue
      }

      // Verifica se a vaga corresponde às stacks
      if (!jobMatchesStacks(job, subscriber.stacks)) {
        continue
      }

      const result = await sendJobToSubscriber(subscriber.lid, job)

      if (result.success) {
        successLog(`[VIP] Vaga enviada para ${subscriber.lid}: ${job.title || job.job_title}`)
      }

      // Independente do resultado, só tenta enviar uma vaga por ciclo
      break
    }

    await delay(1000)
  }
}

/**
 * Inicia o serviço de envio de vagas VIP
 * @param {Object} socket - Socket do Baileys (usado apenas para registrar evento)
 */
export function startVipJobSender(socket) {
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
  const subscribers = getVipSubscribers()

  // Limpa entradas antigas do histórico ao iniciar
  cleanOldEntries()

  infoLog("════════════════════════════════════════════════════")
  infoLog("       ⭐ SERVIÇO DE VAGAS VIP INICIADO")
  infoLog("════════════════════════════════════════════════════")
  infoLogAlways(`👥 Assinantes ativos: ${subscribers.length}`)
  infoLog(`⏱️  Intervalo de verificação: ${CHECK_INTERVAL / 60000} minutos`)
  infoLog(`⏱️  Cooldown por assinante: 5 minutos`)
  infoLog(`⏱️  Cooldown para reenvio: 48 horas`)
  infoLog("════════════════════════════════════════════════════")

  if (subscribers.length > 0) {
    subscribers.forEach((s) => {
      infoLog(`   └─ ${s.lid}: ${s.stacks.join(", ")}`)
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

  // Primeira execução após 30 segundos
  infoLog(`⏱️ Primeira verificação VIP em 30 segundos`)
  vipTimeoutId = setTimeout(async () => {
    if (token != vipRunToken) {
      return
    }
    infoLog(`[VIP] Executando primeira verificação de vagas...`)
    await processVipJobs()
  }, 30 * 1000)

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
 * @param {string} lid - LID do assinante
 */
export async function forceVipJobCheck(lid) {
  const embeds = loadEmbeds()
  const subscriber = getVipSubscribers().find((s) => s.lid === lid)

  if (!subscriber) {
    return { success: false, message: "Assinante não encontrado" }
  }

  // Verifica cooldown
  if (!canSendToSubscriber(lid)) {
    const remaining = getTimeUntilCanSend(lid)
    const remainingMin = Math.ceil(remaining / 60000)
    return { success: false, message: `Aguarde ${remainingMin} minutos para o próximo envio` }
  }

  // Obtém vagas já enviadas
  const sentJobIds = getSentJobIds(lid)

  for (const job of embeds.slice(-50)) {
    const jobId = job.id || job.url || job.job_url

    // Pula vagas já enviadas nas últimas 48h
    if (sentJobIds.has(jobId)) {
      continue
    }

    if (!jobMatchesStacks(job, subscriber.stacks)) {
      continue
    }

    const result = await sendJobToSubscriber(lid, job)
    if (result.success) {
      return { success: true, message: "1 vaga enviada" }
    }

    if (result.reason === "cooldown") {
      const remaining = getTimeUntilCanSend(lid)
      const remainingMin = Math.ceil(remaining / 60000)
      return { success: false, message: `Aguarde ${remainingMin} minutos para o próximo envio` }
    }

    return { success: false, message: `Erro: ${result.reason}` }
  }

  return { success: true, message: "Nenhuma vaga nova encontrada" }
}

/**
 * Dispara busca VIP dedicada para um cliente
 * Busca vagas no embeds.json que correspondem às stacks do assinante
 * @param {string} lid - LID do assinante
 * @param {string[]} stacks - Stacks/keywords para buscar
 * @param {Object} options - Opções adicionais
 * @returns {Promise<{success: boolean, jobsFound: number, jobsSent: number, error?: string}>}
 */
export async function triggerVipSearch(lid, stacks, options = {}) {
  try {
    if (!isCurrentSocketReady()) {
      warningLog("Conexao fechada. Busca VIP aguardando reconexao.")
      if (options.allowQueue !== false) {
        queueVipSearch(lid, stacks)
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

    infoLog(`[VIP SEARCH] Disparando busca para ${lid} com stacks: ${stacks.join(", ")}`)

    // Verifica cooldown de 5 minutos
    if (!canSendToSubscriber(lid)) {
      const remaining = getTimeUntilCanSend(lid)
      const remainingMin = Math.ceil(remaining / 60000)
      warningLog(`[VIP SEARCH] Cooldown ativo para ${lid}. Aguardar ${remainingMin} minutos.`)
      return {
        success: true,
        jobsFound: 0,
        jobsSent: 0,
        error: `Aguarde ${remainingMin} minutos para o próximo envio`,
      }
    }

    // Carrega todas as vagas do embeds.json
    const embeds = loadEmbeds()

    if (embeds.length === 0) {
      warningLog("[VIP SEARCH] Nenhuma vaga disponível no embeds.json")
      return {
        success: false,
        jobsFound: 0,
        jobsSent: 0,
        error: "Nenhuma vaga disponível no momento",
      }
    }

    // Obtém IDs de vagas já enviadas nas últimas 48h
    const sentJobIds = getSentJobIds(lid)

    // Filtra vagas que correspondem às stacks e não foram enviadas recentemente
    const matchingJobs = []
    for (const job of embeds) {
      const jobId = job.id || job.url || job.job_url

      // Pula vagas já enviadas nas últimas 48h
      if (sentJobIds.has(jobId)) {
        continue
      }

      // Verifica se a vaga corresponde às stacks
      if (jobMatchesStacks(job, stacks)) {
        matchingJobs.push(job)
      }
    }

    infoLog(`[VIP SEARCH] Encontradas ${matchingJobs.length} vagas novas para ${lid}`)

    if (matchingJobs.length === 0) {
      return {
        success: true,
        jobsFound: 0,
        jobsSent: 0,
        error: "Nenhuma vaga nova encontrada para as stacks informadas",
      }
    }

    // Envia apenas uma vaga (regra: 1 vaga a cada 5 minutos)
    let jobsSent = 0
    const job = matchingJobs[0]

    const result = await sendJobToSubscriber(lid, job)
    if (result.success) {
      jobsSent = 1
      successLog(`[VIP SEARCH] Vaga enviada para ${lid}: ${job.title || job.job_title}`)
    } else {
      warningLog(`[VIP SEARCH] Não foi possível enviar: ${result.reason}`)
    }

    successLog(`[VIP SEARCH] Busca concluída para ${lid}: ${jobsSent}/${matchingJobs.length} vagas enviadas`)

    return {
      success: true,
      jobsFound: matchingJobs.length,
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

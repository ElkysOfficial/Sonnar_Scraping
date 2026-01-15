/**
 * Serviço de envio de vagas personalizadas para assinantes VIP
 * Envia vagas filtradas por stack para o privado dos assinantes
 *
 * @author Sonar Bot
 */

import fs from "node:fs"
import { delay } from "baileys"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { EMBEDS_FILE_PATH, BOT_EMOJI, TIMEOUT_IN_MILLISECONDS_BY_EVENT } from "../config.js"
import { extractStack } from "./jobDistributor.js"
import { getVipSubscribers } from "../utils/database.js"

// Intervalo entre verificações (5 minutos)
const CHECK_INTERVAL = 5 * 60 * 1000

// Histórico de vagas enviadas para cada assinante (em memória)
// Formato: { "lid": Set<jobId> }
const sentJobsPerSubscriber = new Map()

// Último ID de vaga processado globalmente
let lastProcessedIndex = 0

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
 * @param {Object} job - Vaga
 * @param {string[]} subscriberStacks - Stacks do assinante
 * @returns {boolean}
 */
function jobMatchesStacks(job, subscriberStacks) {
  const jobStack = extractStack(job)
  const jobTitle = (job.title || job.job_title || "").toLowerCase()
  const normalizedJobStack = normalizeStack(jobStack)

  for (const stack of subscriberStacks) {
    const normalizedStack = normalizeStack(stack)

    // Se o assinante quer "todas" as vagas
    if (normalizedStack === "todas" || normalizedStack === "all") {
      return true
    }

    // Verifica correspondência direta da stack
    if (normalizedJobStack === normalizedStack) {
      return true
    }

    // Verifica se a stack aparece no título
    if (jobTitle.includes(normalizedStack)) {
      return true
    }

    // Mapeamentos especiais
    const stackMappings = {
      estagio: ["estágio", "estagio", "intern", "trainee", "junior", "júnior"],
      frontend: ["front-end", "front end", "react", "vue", "angular", "html", "css", "javascript"],
      backend: ["back-end", "back end", "node", "python", "java", "php", "ruby", "go", ".net", "c#"],
      fullstack: ["full-stack", "full stack", "fullstack"],
      mobile: ["android", "ios", "flutter", "react native", "kotlin", "swift"],
      devops: ["sre", "cloud", "aws", "azure", "gcp", "kubernetes", "docker"],
      data: ["dados", "data science", "machine learning", "ml", "ai", "bi", "analytics"],
      qa: ["quality", "teste", "test", "testing", "automação"],
    }

    // Verifica mapeamentos
    const mappedStacks = stackMappings[normalizedStack]
    if (mappedStacks) {
      for (const mapped of mappedStacks) {
        if (jobTitle.includes(mapped) || normalizedJobStack.includes(normalizeStack(mapped))) {
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
  const company = job.author?.name || job.company || "Não informado"

  const fields = job.fields || []
  const getFieldValue = (name) => {
    const field = fields.find((f) => f.name?.toLowerCase().includes(name.toLowerCase()))
    return field?.value || null
  }

  const location = getFieldValue("local") || job.location || "Não informado"
  const salary = getFieldValue("salário") || getFieldValue("salario") || job.salary || "Não informado"
  const regime = getFieldValue("regime") || job.hiring_regime || "Não informado"
  const workType = getFieldValue("tipo") || job.work_type || "Não informado"
  const publicationDate = getFieldValue("publicação") || getFieldValue("publicacao") || job.publication_date || "Não informado"
  const jobUrl = job.url || job.job_url || ""

  let message = `${BOT_EMOJI} *VAGA PERSONALIZADA PARA VOCÊ!*\n\n`
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
  if (lid.includes("@s.whatsapp.net")) {
    return lid
  }

  // Remove @lid e adiciona @s.whatsapp.net
  const number = lid.replace("@lid", "").replace("@s.whatsapp.net", "")
  return `${number}@s.whatsapp.net`
}

/**
 * Envia uma vaga para um assinante VIP
 * @param {Object} socket - Socket do Baileys
 * @param {string} lid - LID do assinante
 * @param {Object} job - Vaga a enviar
 * @returns {boolean}
 */
async function sendJobToSubscriber(socket, lid, job) {
  try {
    const jid = lidToJid(lid)
    const message = formatJobMessage(job)

    await delay(TIMEOUT_IN_MILLISECONDS_BY_EVENT)
    await socket.sendMessage(jid, { text: message })

    return true
  } catch (err) {
    errorLog(`[VIP] Erro ao enviar vaga para ${lid}: ${err.message}`)
    return false
  }
}

/**
 * Processa novas vagas e envia para assinantes VIP
 * @param {Object} socket - Socket do Baileys
 */
async function processVipJobs(socket) {
  const embeds = loadEmbeds()
  const subscribers = getVipSubscribers()

  if (embeds.length === 0 || subscribers.length === 0) {
    return
  }

  // Processa apenas vagas novas (após o último índice processado)
  const newJobs = embeds.slice(lastProcessedIndex)

  if (newJobs.length === 0) {
    return
  }

  infoLog(`[VIP] Processando ${newJobs.length} novas vagas para ${subscribers.length} assinantes`)

  for (const job of newJobs) {
    const jobId = job.id || job.url || job.job_url

    for (const subscriber of subscribers) {
      // Verifica se já enviou essa vaga para esse assinante
      if (!sentJobsPerSubscriber.has(subscriber.lid)) {
        sentJobsPerSubscriber.set(subscriber.lid, new Set())
      }

      const sentJobs = sentJobsPerSubscriber.get(subscriber.lid)

      if (sentJobs.has(jobId)) {
        continue
      }

      // Verifica se a vaga corresponde às stacks do assinante
      if (!jobMatchesStacks(job, subscriber.stacks)) {
        continue
      }

      // Envia a vaga
      const success = await sendJobToSubscriber(socket, subscriber.lid, job)

      if (success) {
        sentJobs.add(jobId)
        successLog(`[VIP] Vaga enviada para ${subscriber.lid}: ${job.title || job.job_title}`)
      }

      // Pequeno delay entre envios para evitar spam
      await delay(1000)
    }
  }

  // Atualiza o índice processado
  lastProcessedIndex = embeds.length
}

/**
 * Inicia o serviço de envio de vagas VIP
 * @param {Object} socket - Socket do Baileys
 */
export function startVipJobSender(socket) {
  const subscribers = getVipSubscribers()

  infoLog("════════════════════════════════════════════════════")
  infoLog("       ⭐ SERVIÇO DE VAGAS VIP INICIADO")
  infoLog("════════════════════════════════════════════════════")
  infoLog(`👥 Assinantes ativos: ${subscribers.length}`)
  infoLog(`⏱️  Intervalo de verificação: ${CHECK_INTERVAL / 60000} minutos`)
  infoLog("════════════════════════════════════════════════════")

  if (subscribers.length > 0) {
    subscribers.forEach((s) => {
      infoLog(`   └─ ${s.lid}: ${s.stacks.join(", ")}`)
    })
  }

  // Primeira execução após 30 segundos
  setTimeout(async () => {
    await processVipJobs(socket)
  }, 30000)

  // Execuções periódicas
  setInterval(async () => {
    await processVipJobs(socket)
  }, CHECK_INTERVAL)
}

/**
 * Força o envio imediato para um assinante (útil para testes)
 * @param {Object} socket - Socket do Baileys
 * @param {string} lid - LID do assinante
 */
export async function forceVipJobCheck(socket, lid) {
  const embeds = loadEmbeds()
  const subscriber = getVipSubscribers().find((s) => s.lid === lid)

  if (!subscriber) {
    return { success: false, message: "Assinante não encontrado" }
  }

  let sent = 0
  for (const job of embeds.slice(-10)) {
    // Últimas 10 vagas
    if (jobMatchesStacks(job, subscriber.stacks)) {
      const success = await sendJobToSubscriber(socket, lid, job)
      if (success) sent++
      if (sent >= 3) break // Máximo 3 vagas por vez
    }
  }

  return { success: true, message: `${sent} vagas enviadas` }
}

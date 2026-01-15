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

// Controle de intervalo por assinante
const lastSentAtPerSubscriber = new Map()

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
  if (lid.includes("@lid") || lid.includes("@s.whatsapp.net")) {
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
    const lastSentAt = lastSentAtPerSubscriber.get(lid) || 0
    if (Date.now() - lastSentAt < CHECK_INTERVAL) {
      return false
    }

    const jid = lidToJid(lid)
    const message = formatJobMessage(job)

    await delay(TIMEOUT_IN_MILLISECONDS_BY_EVENT)
    await socket.sendMessage(jid, { text: message })

    lastSentAtPerSubscriber.set(lid, Date.now())
    return true
  } catch (err) {
    errorLog(`[VIP] Erro ao enviar vaga para ${lid}: ${err.message}`)
    return false
  }
}

async function sendRecentEmbedsToSubscriber(socket, lid, stacks, maxJobs = 5) {
  const embeds = loadEmbeds()
  let sent = 0

  if (!sentJobsPerSubscriber.has(lid)) {
    sentJobsPerSubscriber.set(lid, new Set())
  }

  const sentJobs = sentJobsPerSubscriber.get(lid)

  for (const job of embeds.slice(-50)) {
    const jobId = job.id || job.url || job.job_url

    if (sentJobs.has(jobId)) {
      continue
    }

    if (!jobMatchesStacks(job, stacks)) {
      continue
    }

    const success = await sendJobToSubscriber(socket, lid, job)
    if (success) {
      sentJobs.add(jobId)
      sent++
    }

    if (sent >= maxJobs) {
      break
    }

    await delay(1000)
  }

  return sent
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

  infoLog(`[VIP] Verificando vagas para ${subscribers.length} assinantes`)

  for (const subscriber of subscribers) {
    if (!sentJobsPerSubscriber.has(subscriber.lid)) {
      sentJobsPerSubscriber.set(subscriber.lid, new Set())
    }

    const sentJobs = sentJobsPerSubscriber.get(subscriber.lid)
    const lastSentAt = lastSentAtPerSubscriber.get(subscriber.lid) || 0

    if (Date.now() - lastSentAt < CHECK_INTERVAL) {
      continue
    }

    for (const job of embeds.slice(-200)) {
      const jobId = job.id || job.url || job.job_url

      if (sentJobs.has(jobId)) {
        continue
      }

      if (!jobMatchesStacks(job, subscriber.stacks)) {
        continue
      }

      const success = await sendJobToSubscriber(socket, subscriber.lid, job)

      if (success) {
        sentJobs.add(jobId)
        successLog(`[VIP] Vaga enviada para ${subscriber.lid}: ${job.title || job.job_title}`)
      }

      break
    }

    await delay(1000)
  }
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
  }, CHECK_INTERVAL)

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

/**
 * Dispara busca VIP dedicada para um cliente
 * Chama o servidor Python para buscar vagas novas com as keywords do cliente
 * @param {Object} socket - Socket do Baileys
 * @param {string} lid - LID do assinante
 * @param {string[]} stacks - Stacks/keywords para buscar
 * @returns {Promise<{success: boolean, jobsFound: number, jobsSent: number, error?: string}>}
 */
export async function triggerVipSearch(socket, lid, stacks) {
  const VIP_SERVER_URL = "http://localhost:3001/vip/search"
  let preloadPromise = null

  try {
    infoLog(`[VIP SEARCH] Disparando busca para ${lid} com stacks: ${stacks.join(", ")}`)
    preloadPromise = sendRecentEmbedsToSubscriber(socket, lid, stacks, 5).catch((err) => {
      errorLog(`[VIP SEARCH] Erro ao enviar embeds durante busca: ${err.message}`)
      return 0
    })

    // Mapeia stacks para keywords de busca
    const keywordMappings = {
      estagio: ["Estagiarioa_em_TI", "estágio", "trainee", "junior"],
      estágio: ["Estagiarioa_em_TI", "estágio", "trainee", "junior"],
      frontend: ["Desenvolvedor_FrontEnd", "React_js", "Vue_js", "Angular_js", "JavaScript"],
      backend: ["Desenvolvedor_BackEnd", "Node_js", "Python", "Java", "PHP"],
      fullstack: ["Desenvolvedor_FullStack", "fullstack"],
      mobile: ["Desenvolvedor_Mobile", "React_Native", "Flutter", "Kotlin", "Swift"],
      devops: ["DevOps", "AWS", "Azure", "Kubernetes", "Docker"],
      data: ["Cientista_de_Dados", "Analista_de_Dados", "Power_BI", "Python"],
      qa: ["Analista_de_Testes", "QA", "teste", "quality"],
      react: ["React_js", "React_Native"],
      node: ["Node_js", "Expressjs"],
      python: ["Python", "Django"],
      java: ["Java", "Spring_Boot"],
      todas: ["Desenvolvedor", "Analista", "Engenheiro"],
    }

    // Expande stacks para keywords
    const keywords = []
    for (const stack of stacks) {
      const normalizedStack = stack.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      const mappedKeywords = keywordMappings[normalizedStack]
      if (mappedKeywords) {
        keywords.push(...mappedKeywords)
      } else {
        // Se não tem mapeamento, usa a própria stack
        keywords.push(stack)
      }
    }

    // Remove duplicatas
    const uniqueKeywords = [...new Set(keywords)]

    infoLog(`[VIP SEARCH] Keywords expandidas: ${uniqueKeywords.join(", ")}`)

    // Chama o servidor Python de busca VIP
    const response = await fetch(VIP_SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keywords: uniqueKeywords,
        max_results: 20,
        client_id: lid,
      }),
      timeout: 120000, // 2 minutos de timeout
    })

    if (!response.ok) {
      throw new Error(`Servidor VIP retornou ${response.status}`)
    }

    const data = await response.json()

    if (!data.success) {
      if (preloadPromise) {
        await preloadPromise
      }
      return { success: false, jobsFound: 0, jobsSent: 0, error: data.error || "Erro desconhecido" }
    }

    const jobs = data.jobs || []
    infoLog(`[VIP SEARCH] Encontradas ${jobs.length} vagas para ${lid}`)

    // Envia as vagas para o cliente
    let jobsSent = 0
    const jid = lidToJid(lid)

    // Inicializa histórico de envios se não existir
    if (!sentJobsPerSubscriber.has(lid)) {
      sentJobsPerSubscriber.set(lid, new Set())
    }
    const sentJobs = sentJobsPerSubscriber.get(lid)

    for (const job of jobs) {
      const jobId = job.job_url

      // Verifica se já enviou essa vaga
      if (sentJobs.has(jobId)) {
        continue
      }

      try {
        // Formata a mensagem
        let message = `${BOT_EMOJI} *VAGA PERSONALIZADA PARA VOCÊ!*\n\n`
        message += `📌 *Título:* ${job.job_title || "Não informado"}\n`
        message += `🏢 *Empresa:* ${job.company || "Não informado"}\n`
        message += `📍 *Local:* ${job.location || "Não informado"}\n`
        message += `💰 *Salário:* ${job.salary || "Não informado"}\n`
        message += `📝 *Regime:* ${job.hiring_regime || "Não informado"}\n`
        message += `🏠 *Tipo:* ${job.work_type || "Não informado"}\n`

        if (job.job_url) {
          message += `\n🔗 *Link para candidatura:*\n${job.job_url}`
        }

        message += `\n\n_Enviado pelo Sonar Bot VIP_ ⭐`

        await delay(TIMEOUT_IN_MILLISECONDS_BY_EVENT)
        await socket.sendMessage(jid, { text: message })

        sentJobs.add(jobId)
        jobsSent++

        successLog(`[VIP SEARCH] Vaga enviada para ${lid}: ${job.job_title}`)

        // Limite de 10 vagas por busca
        if (jobsSent >= 10) {
          break
        }

        // Delay entre envios
        await delay(2000)
      } catch (err) {
        errorLog(`[VIP SEARCH] Erro ao enviar vaga: ${err.message}`)
      }
    }

    successLog(`[VIP SEARCH] Busca concluída para ${lid}: ${jobsSent}/${jobs.length} vagas enviadas`)

    if (preloadPromise) {
      await preloadPromise
    }
    return {
      success: true,
      jobsFound: jobs.length,
      jobsSent,
    }
  } catch (err) {
    errorLog(`[VIP SEARCH] Erro na busca VIP: ${err.message}`)
    if (preloadPromise) {
      await preloadPromise
    }

    // Se o servidor VIP não está disponível, tenta buscar das vagas existentes
    if (err.code === "ECONNREFUSED" || err.message.includes("fetch")) {
      warningLog("[VIP SEARCH] Servidor VIP indisponível, buscando em vagas existentes...")

      const embeds = loadEmbeds()
      let jobsSent = 0

      for (const job of embeds.slice(-50)) {
        if (jobMatchesStacks(job, stacks)) {
          const success = await sendJobToSubscriber(socket, lid, job)
          if (success) jobsSent++
          if (jobsSent >= 5) break
        }
      }

      return {
        success: true,
        jobsFound: embeds.length,
        jobsSent,
        error: "Servidor VIP indisponível, usou vagas existentes",
      }
    }

    return {
      success: false,
      jobsFound: 0,
      jobsSent: 0,
      error: err.message,
    }
  }
}

/**
 * Serviço de envio de vagas personalizadas para assinantes VIP
 * Envia vagas filtradas por stack para o privado dos assinantes
 *
 * REGRAS:
 * - Apenas 1 vaga enviada a cada 7 minutos por assinante
 * - Mesma vaga não é enviada duas vezes (exceto após 48 horas)
 * - Estado persistido em arquivo para sobreviver a reinicializações
 *
 * @author Sonar Bot
 */

import fs from "node:fs"
import axios from "axios"
import { delay } from "baileys"
import { infoLog, infoLogAlways, successLog, warningLog, errorLog } from "../utils/logger.js"
import { EMBEDS_FILE_PATH, BOT_EMOJI, TIMEOUT_IN_MILLISECONDS_BY_EVENT, CARD_API_URL } from "../config.js"
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

// Intervalo entre verificações (7 minutos)
const CHECK_INTERVAL = 7 * 60 * 1000
let vipTimeoutId = null
let vipIntervalId = null
let vipRunToken = 0
let vipPendingTimeoutId = null

// Buscas VIP pendentes quando a conexao esta fechada
const pendingVipSearches = new Map()

function queueVipSearch(lid, filters) {
  pendingVipSearches.set(lid, { filters, queuedAt: Date.now() })
}

async function processPendingVipSearches() {
  if (pendingVipSearches.size === 0) {
    return
  }

  for (const [lid, data] of pendingVipSearches.entries()) {
    const result = await triggerVipSearch(lid, data.filters, { allowQueue: false })

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
 * Verifica se a vaga corresponde aos filtros do assinante
 * Usa sistema de pontuação com weights e must fields
 * @param {Object} job - Vaga
 * @param {Object} filters - Filtros do assinante (roles, stacks, seniority, locations, workMode, contract, languages, weights, must)
 * @returns {boolean|{match: boolean, score: number}}
 */
function jobMatchesFilters(job, filters, returnScore = false) {
  if (!filters) return returnScore ? { match: false, score: 0 } : false

  const jobTitle = normalizeStack(job.title || job.job_title || "")
  const jobDescription = normalizeStack(job.description || "")
  const jobText = `${jobTitle} ${jobDescription}`
  const jobLocation = normalizeStack(job.location || "")
  const jobWorkType = normalizeStack(job.work_type || "")
  const jobRegime = normalizeStack(job.hiring_regime || "")

  // Pesos padrão para cada categoria
  const weights = filters.weights || {
    roles: 20,
    stacks: 30,
    seniority: 15,
    locations: 10,
    workMode: 10,
    contract: 10,
    languages: 5
  }

  // Campos obrigatórios (must match)
  const must = filters.must || {
    roles: true,
    stacks: true,
    workMode: false,
    contract: false,
    languages: false
  }

  // Sinônimos expandidos para melhor matching
  const synonyms = {
    // Senioridade
    seniority: {
      "junior": ["junior", "jr", "jr.", "júnior", "nivel i", "nivel 1", "n1"],
      "pleno": ["pleno", "pl", "pl.", "mid", "mid-level", "middle", "nivel ii", "nivel 2", "n2"],
      "senior": ["senior", "sr", "sr.", "sênior", "especialista", "nivel iii", "nivel 3", "n3", "expert"],
      "estagio": ["estagio", "estágio", "intern", "internship", "estagiario", "estagiária"],
      "trainee": ["trainee", "aprendiz", "jovem aprendiz"]
    },
    // Modalidade de trabalho
    workMode: {
      "remoto": ["remoto", "remote", "home office", "trabalho remoto", "100% remoto", "anywhere", "full remote"],
      "hibrido": ["hibrido", "híbrido", "hybrid", "semi-presencial", "semi presencial", "parcialmente remoto"],
      "presencial": ["presencial", "on-site", "onsite", "in-office", "no escritorio", "local"]
    },
    // Tipo de contrato
    contract: {
      "clt": ["clt", "efetivo", "carteira assinada", "regime clt", "contratacao clt"],
      "pj": ["pj", "pessoa juridica", "pessoa jurídica", "freelance", "contractor", "contrato pj", "mei"],
      "estagio": ["estagio", "estágio", "intern", "internship", "contrato de estagio"]
    },
    // Stacks/tecnologias expandidas
    stacks: {
      "frontend": ["frontend", "front-end", "front end"],
      "backend": ["backend", "back-end", "back end"],
      "fullstack": ["fullstack", "full-stack", "full stack"],
      "mobile": ["mobile", "android", "ios", "flutter", "react native", "kotlin", "swift", "mobile developer"],
      "devops": ["devops", "dev ops", "sre", "site reliability", "kubernetes", "docker", "aws", "azure", "gcp", "cloud", "infraestrutura", "infra"],
      "data": ["data", "dados", "data science", "data engineer", "cientista de dados", "machine learning", "ml", "ai", "big data", "analytics", "bi"],
      "qa": ["qa", "quality", "teste", "tester", "testing", "qualidade", "automacao", "quality assurance"],
      "design": ["design", "designer", "ux", "ui", "ux/ui", "ui/ux", "product design", "grafico", "figma"],
      "python": ["python", "django", "flask", "fastapi", "pandas", "numpy"],
      "java": ["java", "spring", "springboot", "spring boot", "maven", "gradle"],
      "javascript": ["javascript", "js", "ecmascript", "es6"],
      "typescript": ["typescript", "ts"],
      "node": ["node", "nodejs", "node.js", "express", "nestjs", "nest.js"],
      "react": ["react", "reactjs", "react.js", "next", "nextjs", "next.js", "redux"],
      "angular": ["angular", "angularjs", "angular.js"],
      "vue": ["vue", "vuejs", "vue.js", "nuxt", "nuxtjs"],
      "csharp": ["c#", "csharp", ".net", "dotnet", "asp.net", "blazor"],
      "go": ["go", "golang"],
      "rust": ["rust", "rustlang"],
      "php": ["php", "laravel", "symfony", "wordpress"],
      "ruby": ["ruby", "rails", "ruby on rails"],
      "sql": ["sql", "mysql", "postgresql", "postgres", "oracle", "sql server", "database", "banco de dados"],
      "spring": ["spring", "springboot", "spring boot", "spring framework"]
    },
    // Cargos/roles expandidos
    roles: {
      "desenvolvedor": ["desenvolvedor", "developer", "dev", "programador", "engineer", "engenheiro", "software engineer"],
      "analista": ["analista", "analyst", "analista de sistemas"],
      "tech lead": ["tech lead", "lider tecnico", "lider de tecnologia", "technical lead", "lead developer", "lead engineer"],
      "arquiteto": ["arquiteto", "architect", "solution architect", "software architect"],
      "gerente": ["gerente", "manager", "coordenador", "head", "diretor", "supervisor"],
      "backend": ["backend", "back-end", "back end", "desenvolvedor backend"],
      "frontend": ["frontend", "front-end", "front end", "desenvolvedor frontend"]
    }
  }

  let totalScore = 0
  let maxScore = 0

  // Função para verificar match com sinônimos
  const checkMatch = (terms, text, synonymGroup) => {
    if (!terms || terms.length === 0) return { matched: true, isEmpty: true }

    for (const term of terms) {
      const normalized = normalizeStack(term)

      // Verifica sinônimos do grupo específico
      if (synonymGroup) {
        for (const [key, syns] of Object.entries(synonymGroup)) {
          if (normalized === key || syns.includes(normalized)) {
            if (syns.some(s => text.includes(s))) return { matched: true, isEmpty: false }
          }
        }
      }

      // Verifica diretamente
      if (text.includes(normalized)) return { matched: true, isEmpty: false }
    }
    return { matched: false, isEmpty: false }
  }

  // Verifica STACKS (peso: weights.stacks)
  const stacks = filters.stacks || []
  if (stacks.length > 0) {
    maxScore += weights.stacks
    const stackResult = checkMatch(stacks, jobText, synonyms.stacks)
    if (stackResult.matched && !stackResult.isEmpty) {
      totalScore += weights.stacks
    } else if (must.stacks && !stackResult.matched) {
      return returnScore ? { match: false, score: 0 } : false
    }
  }

  // Verifica ROLES (peso: weights.roles)
  const roles = filters.roles || []
  if (roles.length > 0) {
    maxScore += weights.roles
    const roleResult = checkMatch(roles, jobText, synonyms.roles)
    if (roleResult.matched && !roleResult.isEmpty) {
      totalScore += weights.roles
    } else if (must.roles && !roleResult.matched) {
      return returnScore ? { match: false, score: 0 } : false
    }
  }

  // Verifica SENIORITY (peso: weights.seniority)
  const seniority = filters.seniority || []
  if (seniority.length > 0) {
    maxScore += weights.seniority
    const seniorityResult = checkMatch(seniority, jobText, synonyms.seniority)
    if (seniorityResult.matched && !seniorityResult.isEmpty) {
      totalScore += weights.seniority
    } else if (must.seniority && !seniorityResult.matched) {
      return returnScore ? { match: false, score: 0 } : false
    }
  }

  // Verifica WORK MODE (peso: weights.workMode)
  const workMode = filters.workMode || []
  if (workMode.length > 0) {
    maxScore += weights.workMode
    const workText = `${jobWorkType} ${jobText}`
    const workResult = checkMatch(workMode, workText, synonyms.workMode)
    if (workResult.matched && !workResult.isEmpty) {
      totalScore += weights.workMode
    } else if (must.workMode && !workResult.matched) {
      return returnScore ? { match: false, score: 0 } : false
    }
  }

  // Verifica CONTRACT (peso: weights.contract)
  const contract = filters.contract || []
  if (contract.length > 0) {
    maxScore += weights.contract
    const contractText = `${jobRegime} ${jobText}`
    const contractResult = checkMatch(contract, contractText, synonyms.contract)
    if (contractResult.matched && !contractResult.isEmpty) {
      totalScore += weights.contract
    } else if (must.contract && !contractResult.matched) {
      return returnScore ? { match: false, score: 0 } : false
    }
  }

  // Verifica LOCATIONS (peso: weights.locations)
  const locations = filters.locations || []
  if (locations.length > 0) {
    maxScore += weights.locations
    const locationMatch = locations.some(loc => {
      const normalized = normalizeStack(loc)
      return jobLocation.includes(normalized) || jobText.includes(normalized)
    })
    if (locationMatch) {
      totalScore += weights.locations
    } else if (must.locations && !locationMatch) {
      return returnScore ? { match: false, score: 0 } : false
    }
  }

  // Precisa ter pelo menos uma stack ou role (se ambos estiverem definidos)
  if (stacks.length === 0 && roles.length === 0) {
    return returnScore ? { match: false, score: 0 } : false
  }

  // Calcula score mínimo para match (30% do máximo possível)
  const minScore = maxScore * 0.3
  const matched = totalScore >= minScore

  if (returnScore) {
    return { match: matched, score: totalScore, maxScore, percentage: maxScore > 0 ? (totalScore / maxScore * 100).toFixed(1) : 0 }
  }

  return matched
}

/**
 * Verifica se a vaga corresponde às stacks do assinante (compatibilidade legada)
 * @param {Object} job - Vaga
 * @param {string[]|Object} stacksOrFilters - Stacks do assinante ou objeto de filtros
 * @returns {boolean}
 */
function jobMatchesStacks(job, stacksOrFilters) {
  // Se recebeu um objeto de filtros, usa a nova função
  if (stacksOrFilters && typeof stacksOrFilters === 'object' && !Array.isArray(stacksOrFilters)) {
    return jobMatchesFilters(job, stacksOrFilters)
  }

  // Se recebeu array de stacks, converte para filtros
  const filters = { stacks: stacksOrFilters || [] }
  return jobMatchesFilters(job, filters)
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
 * Solicita ao serviço de cards um card para a vaga
 * @param {Object} job
 * @param {string} to
 * @returns {Object|null}
 */
async function fetchJobCard(job, to) {
  try {
    const response = await axios.post(
      `${CARD_API_URL}/cards/generate`,
      { embed: job, to },
      { timeout: 30000 }
    )
    return response.data || null
  } catch (err) {
    errorLog(`[VIP CARD] Erro ao gerar card: ${err.message}`)
    return null
  }
}

/**
 * Envia o card gerado para o assinante
 * @param {string} jid
 * @param {Object} cardData
 * @param {Object} socket
 * @returns {boolean}
 */
async function sendCardPayload(jid, jobId, cardData, socket) {
  if (!cardData?.image?.base64) {
    return false
  }

  try {
    const buffer = Buffer.from(cardData.image.base64, "base64")
    await delay(TIMEOUT_IN_MILLISECONDS_BY_EVENT)
    await socket.sendMessage(jid, {
      image: buffer,
      caption: cardData.text,
      mimetype: cardData.image.mimeType
    })
    const timestamp = new Date().toISOString()
    successLog(`[VIP CARD] Job ${jobId} sent to ${jid} at ${timestamp}`)
    return true
  } catch (err) {
    errorLog(`[VIP CARD] Falha ao enviar card para ${jid}: ${err.message}`)
    return false
  }
}

/**
 * Envia uma vaga para um assinante VIP
 * IMPORTANTE: Verifica intervalo de 7 minutos e histórico de 48h via persistência
 * @param {string} lid - LID do assinante
 * @param {Object} job - Vaga a enviar
 * @returns {{success: boolean, reason?: string}}
 */
async function sendJobToSubscriber(lid, job) {
  try {
    // Valida LID
    if (!lid || lid.trim() === "") {
      warningLog("[VIP] Tentativa de envio para LID vazio")
      return { success: false, reason: "invalid_lid" }
    }

    const socket = getCurrentSocket()
    if (!isCurrentSocketReady()) {
      warningLog("Conexao fechada. Envio VIP aguardando reconexao.")
      return { success: false, reason: "connection_closed" }
    }

    // Verifica intervalo de 7 minutos (persistido)
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
    const cardPayload = await fetchJobCard(job, jid)
    if (!cardPayload) {
      const reason = "card_generation_failed"
      warningLog(`[VIP] Card não gerado para ${lid}: ${reason}`)
      return { success: false, reason }
    }

    const sent = await sendCardPayload(jid, jobId, cardPayload, socket)
    if (!sent) {
      const reason = "card_send_failed"
      warningLog(`[VIP] Falha ao enviar card para ${lid}: ${reason}`)
      return { success: false, reason }
    }

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
    // Pula assinantes sem LID válido
    if (!subscriber.lid || subscriber.lid.trim() === "") {
      warningLog(`[VIP] Assinante ${subscriber.name || "desconhecido"} sem LID válido, pulando...`)
      continue
    }

    // Verifica cooldown de 7 minutos (persistido)
    if (!canSendToSubscriber(subscriber.lid)) {
      continue
    }

    // Obtém IDs de vagas já enviadas nas últimas 48h
    const sentJobIds = getSentJobIds(subscriber.lid)

    // Usa filtros completos se disponível, senão usa stacks (compatibilidade legada)
    const filters = subscriber.filters || { stacks: subscriber.stacks || [] }

    for (const job of embeds) {
      const jobId = job.id || job.url || job.job_url

      // Pula vagas já enviadas nas últimas 48h
      if (sentJobIds.has(jobId)) {
        continue
      }

      // Verifica se a vaga corresponde aos filtros
      if (!jobMatchesFilters(job, filters)) {
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
  infoLog(`⏱️  Cooldown por assinante: 7 minutos`)
  infoLog(`⏱️  Cooldown para reenvio: 48 horas`)
  infoLog("════════════════════════════════════════════════════")

  if (subscribers.length > 0) {
    subscribers.forEach((s) => {
      const filters = s.filters || { stacks: s.stacks || [] }
      const filterSummary = []
      if (filters.stacks?.length) filterSummary.push(`stacks: ${filters.stacks.join(",")}`)
      if (filters.roles?.length) filterSummary.push(`roles: ${filters.roles.join(",")}`)
      if (filters.seniority?.length) filterSummary.push(`seniority: ${filters.seniority.join(",")}`)
      if (filters.workMode?.length) filterSummary.push(`workMode: ${filters.workMode.join(",")}`)
      const lidStatus = s.lid && s.lid.trim() !== "" ? s.lid : "SEM LID!"
      infoLog(`   └─ ${s.name || "Sem nome"} (${lidStatus}): ${filterSummary.join(" | ") || "sem filtros"}`)
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

  // Primeira execução IMEDIATA (após 5 segundos para garantir conexão estável)
  infoLog(`⏱️ Primeira verificação VIP em 5 segundos (envio imediato)`)
  vipTimeoutId = setTimeout(async () => {
    if (token != vipRunToken) {
      return
    }
    infoLog(`[VIP] Executando primeira verificação de vagas (envio imediato)...`)
    await processVipJobs()
  }, 5 * 1000)

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

  // Usa filtros completos se disponível
  const filters = subscriber.filters || { stacks: subscriber.stacks || [] }

  for (const job of embeds.slice(-50)) {
    const jobId = job.id || job.url || job.job_url

    // Pula vagas já enviadas nas últimas 48h
    if (sentJobIds.has(jobId)) {
      continue
    }

    if (!jobMatchesFilters(job, filters)) {
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
 * Busca vagas no embeds.json que correspondem aos filtros do assinante
 * @param {string} lid - LID do assinante
 * @param {string[]|Object} stacksOrFilters - Stacks/keywords para buscar ou objeto de filtros
 * @param {Object} options - Opções adicionais
 * @returns {Promise<{success: boolean, jobsFound: number, jobsSent: number, error?: string}>}
 */
export async function triggerVipSearch(lid, stacksOrFilters, options = {}) {
  // Normaliza para objeto de filtros
  const filters = (stacksOrFilters && typeof stacksOrFilters === 'object' && !Array.isArray(stacksOrFilters))
    ? stacksOrFilters
    : { stacks: stacksOrFilters || [] }

  try {
    if (!isCurrentSocketReady()) {
      warningLog("Conexao fechada. Busca VIP aguardando reconexao.")
      if (options.allowQueue !== false) {
        queueVipSearch(lid, filters)
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

    const filterSummary = []
    if (filters.stacks?.length) filterSummary.push(`stacks: ${filters.stacks.join(",")}`)
    if (filters.roles?.length) filterSummary.push(`roles: ${filters.roles.join(",")}`)
    if (filters.seniority?.length) filterSummary.push(`seniority: ${filters.seniority.join(",")}`)
    infoLog(`[VIP SEARCH] Disparando busca para ${lid} com ${filterSummary.join(" | ") || "filtros vazios"}`)

    // Verifica cooldown de 7 minutos
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

    // Filtra vagas que correspondem aos filtros e não foram enviadas recentemente
    const matchingJobs = []
    for (const job of embeds) {
      const jobId = job.id || job.url || job.job_url

      // Pula vagas já enviadas nas últimas 48h
      if (sentJobIds.has(jobId)) {
        continue
      }

      // Verifica se a vaga corresponde aos filtros
      if (jobMatchesFilters(job, filters)) {
        matchingJobs.push(job)
      }
    }

    infoLog(`[VIP SEARCH] Encontradas ${matchingJobs.length} vagas novas para ${lid}`)

    if (matchingJobs.length === 0) {
      return {
        success: true,
        jobsFound: 0,
        jobsSent: 0,
        error: "Nenhuma vaga nova encontrada para os filtros informados",
      }
    }

    // Envia apenas uma vaga (regra: 1 vaga a cada 7 minutos)
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

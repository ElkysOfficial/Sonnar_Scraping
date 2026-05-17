/**
 * Middleware customizado para o menu interativo da Elkys
 *
 * Fluxos:
 * 1. Solicitar Orçamento -> Notifica os números configurados
 * 2. Agendar Horário -> Envia link do Google Calendar
 * 3. Sonar Bot -> Submenu com opções de grupo ou vagas privadas
 *
 * @author Dev Gui
 */
import { delay, downloadContentFromMessage } from "baileys"
import {
  BOT_EMOJI,
  BOT_LID,
  ORCAMENTO_NUMBERS,
  PAYMENT_NOTIFICATION_NUMBERS,
  CALENDAR_LINK,
  PAYMENT_LINK_GROUP,
  PAYMENT_LINK_PRIVATE,
  JOB_GROUP_LINK,
  TIMEOUT_IN_MILLISECONDS_BY_EVENT,
  PREFIX,
  OWNER_LID
} from "../config.js"
import { extractDataFromMessage, toUserLid } from "../utils/index.js"
import { errorLog, infoLog } from "../utils/logger.js"
import { pairSubscriberByToken } from "../services/whatsappLinker.js"
import { triggerVipSearch } from "../services/vipJobSender.js"
import {
  addVipPendingSubscriber,
  approveVipSubscriber,
  rejectVipSubscriber,
  updateVipPendingPaymentProof
} from "../utils/database.js"

// Timeout de 5 minutos em milissegundos
const SESSION_TIMEOUT_MS = 5 * 60 * 1000

// Estado das conversas em memória
// Estrutura: { "userId": { state: "menu" | "sonar_menu" | "awaiting_budget_name" | "awaiting_budget_description" | "awaiting_payment_group" | "awaiting_payment_private", timestamp: Date, budgetData: { name: "", description: "" }, previousState: "", timeout: timerId } }
const conversationStates = new Map()
const userTimeouts = new Map()

// Limpa estados antigos (mais de 30 minutos)
function cleanOldStates() {
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
  for (const [userId, data] of conversationStates.entries()) {
    if (data.timestamp < thirtyMinutesAgo) {
      conversationStates.delete(userId)
    }
  }
}

// Executa limpeza a cada 10 minutos
setInterval(cleanOldStates, 10 * 60 * 1000)

/**
 * Configura timeout para a sessão do usuário
 */
function setupSessionTimeout(socket, userId, remoteJid) {
  // Limpa timeout anterior se existir
  if (userTimeouts.has(userId)) {
    clearTimeout(userTimeouts.get(userId))
  }

  // Cria novo timeout
  const timeout = setTimeout(async () => {
    try {
      infoLog(`[SESSION TIMEOUT] Timeout de 5 minutos atingido para ${userId}`)

      // Envia mensagem de encerramento
      await sendWithDelay(socket, remoteJid, {
        text: getSessionTimeoutMessage()
      })

      // Reseta o estado para menu
      conversationStates.set(userId, {
        state: "menu",
        timestamp: Date.now(),
        budgetData: {},
        previousState: ""
      })

      // Remove o timeout do mapa
      userTimeouts.delete(userId)
    } catch (error) {
      errorLog(`[SESSION TIMEOUT] Erro ao processar timeout: ${error.message}`)
    }
  }, SESSION_TIMEOUT_MS)

  userTimeouts.set(userId, timeout)
}

/**
 * Atualiza o timestamp da sessão (reseta timeout)
 */
function updateSessionTimeout(socket, userId, remoteJid) {
  setupSessionTimeout(socket, userId, remoteJid)
}

/**
 * Verifica se a mensagem é privada (não é grupo)
 */
function isPrivateMessage(remoteJid) {
  // Grupos terminam com @g.us
  // Mensagens privadas podem terminar com @s.whatsapp.net ou @lid
  return !remoteJid?.endsWith("@g.us")
}

/**
 * Envia mensagem com delay para evitar banimento
 */
async function sendWithDelay(socket, jid, content) {
  await delay(TIMEOUT_IN_MILLISECONDS_BY_EVENT)
  return await socket.sendMessage(jid, content)
}

/**
 * Obtém o conteúdo de mídia da mensagem (trata viewOnce, etc.)
 */
function getMediaContent(webMessage, context) {
  return (
    webMessage?.message?.[`${context}Message`] ||
    webMessage?.message?.viewOnceMessage?.message?.[`${context}Message`] ||
    webMessage?.message?.viewOnceMessageV2?.message?.[`${context}Message`] ||
    webMessage?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.[`${context}Message`] ||
    webMessage?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.[`${context}Message`] ||
    webMessage?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2?.message?.[`${context}Message`]
  )
}

/**
 * Verifica se a mensagem contém mídia (imagem ou documento)
 */
function hasMediaContent(webMessage) {
  return !!(getMediaContent(webMessage, "image") || getMediaContent(webMessage, "document"))
}

/**
 * Baixa mídia (imagem ou documento) de uma mensagem do WhatsApp
 * @returns {Promise<{buffer: Buffer, mimetype: string, filename?: string} | null>}
 */
async function downloadMediaFromMessage(webMessage) {
  try {
    const imageMessage = getMediaContent(webMessage, "image")
    const documentMessage = getMediaContent(webMessage, "document")

    if (!imageMessage && !documentMessage) {
      infoLog(`[DOWNLOAD MEDIA] Nenhuma mídia encontrada na mensagem`)
      return null
    }

    const mediaMessage = imageMessage || documentMessage
    const mediaType = imageMessage ? "image" : "document"

    infoLog(`[DOWNLOAD MEDIA] Iniciando download de ${mediaType}...`)

    const stream = await downloadContentFromMessage(mediaMessage, mediaType)
    let buffer = Buffer.from([])

    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    infoLog(`[DOWNLOAD MEDIA] Download concluído. Tamanho: ${buffer.length} bytes`)

    return {
      buffer,
      mimetype: mediaMessage.mimetype || (imageMessage ? "image/jpeg" : "application/octet-stream"),
      filename: documentMessage?.fileName || null,
      isImage: !!imageMessage,
      isDocument: !!documentMessage
    }
  } catch (error) {
    errorLog(`[DOWNLOAD MEDIA] Erro ao baixar mídia: ${error.message}`)
    errorLog(`[DOWNLOAD MEDIA] Stack: ${error.stack}`)
    return null
  }
}

function normalizePhone(text) {
  return (text || "").replace(/\D/g, "")
}

function isValidPhone(text) {
  const digits = normalizePhone(text)
  return digits.length >= 10 && digits.length <= 13
}

function isValidEmail(email) {
  const value = (email || "").trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidName(name) {
  const value = (name || "").trim()
  if (value.length < 5) {
    return false
  }
  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length < 2) {
    return false
  }
  return parts.every(part => /\p{L}/u.test(part))
}

function formatPhone(text) {
  const digits = normalizePhone(text)
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return digits
}

function formatLeadLines(leadData) {
  if (!leadData) {
    return ""
  }
  const parts = []
  if (leadData.name) parts.push(`*Nome:* ${leadData.name}`)
  if (leadData.phone) parts.push(`*Telefone:* ${leadData.phone}`)
  if (leadData.email) parts.push(`*E-mail:* ${leadData.email}`)
  return parts.length ? parts.join("\n") + "\n" : ""
}

/**
 * Menu principal da Elkys
 */
function getMainMenu() {
  return `*ELKYS*

_Software, automacao e produtos digitais para escalar negocios._

> Como podemos te ajudar hoje?

- 1️⃣ - _Orcamento: receba uma proposta sob medida._
- 2️⃣ - _Reuniao: agende um horario com nosso time._
- 3️⃣ - _Vagas: oportunidades e conteudos exclusivos._
- 4️⃣ - _Quero ser parceiro_
_______________________
Digite o numero da opcao desejada`
}

/**
 * Submenu do Sonar Bot
 */
function getSonarMenu() {
  return `*Vagas de Emprego*

> Escolha como deseja receber as oportunidades:

- 1️⃣ - Grupo de Vagas: _Acesso exclusivo a vagas diarias_
- 2️⃣ - Vagas Personalizadas: _Receba filtradas por seu perfil_

----------------------------------------
Digite o numero da opcao desejada
_ou digite "voltar" para retornar_`
}

/**
 * Mensagem para parceiros
 */
function getPartnerMessage() {
  return `*Programa de Parceria*

> Interessado em fazer parte do nosso time?

> Fale diretamente com nosso time de parcerias: https://wa.me/553198478235

----------------------------------------
Digite *menu* para voltar`
}

/**
 * Mensagem solicitando nome para orçamento
 */
function getBudgetNameMessage() {
  return `*Solicitar Orcamento*

> Para continuar, me diga seu nome completo.

----------------------------------------
_ou digite "voltar" para retornar_`
}

function getBudgetPhoneMessage(name) {
  return `*Perfeito, ${name}!*

> Qual seu telefone com DDD?
_Ex: (31) 99999-9999_

----------------------------------------
_ou digite "voltar" para retornar_`
}

function getBudgetEmailMessage(name) {
  return `*Obrigado, ${name}!*

> Qual o seu melhor e-mail?
_Ex: seuemail@dominio.com_

----------------------------------------
_ou digite "voltar" para retornar_`
}

function getBudgetCompanyTypeMessage(name) {
  return `*So mais uma, ${name}!*

> Voce esta entrando em contato como empresa?

*1* - Sim, sou empresa
*2* - Nao, pessoa fisica

----------------------------------------
Digite *1* ou *2*
_ou digite "voltar" para retornar_`
}

/**
 * Mensagem solicitando descrição para orçamento
 */
function getBudgetDescriptionMessage(name) {
  return `*Otimo, ${name}!*

> Conte rapidamente sobre o seu projeto.
_Ex: sistema de vendas online, app mobile, automacao de processos..._

----------------------------------------
Digite a descricao
_ou digite "voltar" para retornar_`
}

/**
 * Mensagem de confirmação de orçamento enviado
 */
function getBudgetConfirmationMessage() {
  return `*Obrigado!*

> Suas informacoes foram enviadas com sucesso.
Nossa equipe analisara seu projeto e entrara em contato em breve.

----------------------------------------
Digite *menu* para voltar`
}

/**
 * Mensagem de solicitação de orçamento enviada para a equipe
 */
function getOrcamentoNotification(userNumber) {
  return `*Um novo cliente solicitou um orçamento*

_Cliente:_ ${userNumber}
_Data:_ ${new Date().toLocaleString("pt-BR")}

Entrar em contato assim que possível.`
}

/**
 * Mensagem com detalhes completos do orçamento
 */
function getBudgetDetailsMessage(budgetData) {
  return `*Novo Orcamento Solicitado*

*Nome do Cliente:* ${budgetData.name}
*Telefone:* ${budgetData.phone || "-"}
*E-mail:* ${budgetData.email || "-"}
*Tipo:* ${budgetData.companyType || "-"}
*Numero:* ${budgetData.clientNumber}
*Data:* ${new Date().toLocaleString("pt-BR")}

*Descricao do Projeto:*
${budgetData.description}

----------------------------------------
_Favor, entrar em contato com o cliente em breve._`
}

/**
 * Mensagem de confirmação para o cliente após solicitar orçamento
 */
function getOrcamentoConfirmation() {
  return `*Solicitação Enviada*

Obrigado! Nossa equipe entrará em contato em breve.

──────────────────
Digite *menu* para voltar`
}

/**
 * Mensagem com link do calendário
 */
function getCalendarMessage() {
  return `*Agendar Reuniao*

> Clique no link para escolher o melhor horario:

${CALENDAR_LINK}

----------------------------------------
Digite *menu* para voltar`
}

/**
 * Mensagem de pagamento para acesso ao grupo
 */
function getPaymentGroupMessage() {
  return `*Acesso ao Grupo de Vagas*

> Efetue o pagamento para liberar o acesso:

*Cartao / Stripe:*
${PAYMENT_LINK_GROUP}

*PIX:*
CNPJ: 64.095.868/0001-03

_Apos confirmacao, voce recebera o acesso._

----------------------------------------
Digite *pago* apos o pagamento
_ou digite "voltar" para retornar_
Digite *menu* para menu principal`
}

/**
 * Coleta de filtros VIP — fluxo guiado em 4 passos (Fluxo B, via WhatsApp).
 * Substitui o antigo formato "copie e cole", que os usuarios achavam dificil.
 *
 * Campos coletados: stacks, senioridade, modalidade e localizacao.
 * Removidos de proposito:
 *  - roles: nao eh mais criterio (o portal/Fluxo A tambem nao coleta cargo).
 *  - idioma: nao eh mais filtro.
 *  - regime de contrato (CLT/PJ/estagio): nao eh mais filtro.
 * Vagas 100% remotas sao sempre enviadas — "remoto" entra fixo na modalidade.
 */
function getVipAreaMessage() {
  return `*Vagas Personalizadas — Passo 1 de 5*

Em qual *area* voce quer vagas? Pode escolher mais de uma.

*1* - Backend
*2* - Frontend
*3* - Fullstack
*4* - Mobile
*5* - DevOps / SRE
*6* - Infraestrutura / Redes
*7* - Dados / ML
*8* - QA / Testes
*9* - Seguranca
*10* - Suporte / Helpdesk

_Ex: 1,3 — numeros separados por virgula_
----------------------------------------
_ou digite "voltar" para retornar_`
}

function getVipStacksMessage() {
  return `*Passo 2 de 5 — Tecnologias*

Quais *tecnologias / stacks* voce quer nas vagas?

Pode informar varias, separadas por virgula.
_Ex: react, node, python_

----------------------------------------
_ou digite "voltar" para retornar_`
}

function getVipSeniorityMessage() {
  return `*Passo 3 de 5 — Senioridade*

Qual nivel voce procura? Pode escolher mais de um.

*1* - Junior
*2* - Pleno
*3* - Senior

_Ex: 2,3 — ou digite 0 para qualquer nivel_
----------------------------------------
_ou digite "voltar" para retornar_`
}

function getVipWorkModeMessage() {
  return `*Passo 4 de 5 — Modalidade*

Vagas *100% remotas* voce ja recebe automaticamente.

Quer receber TAMBEM vagas:
*1* - Hibridas
*2* - Presenciais
*3* - Nao, somente remotas

_Pode combinar 1 e 2 (ex: 1,2)_
----------------------------------------
_ou digite "voltar" para retornar_`
}

function getVipLocationMessage() {
  return `*Passo 5 de 5 — Localizacao*

Para as vagas hibridas/presenciais, quais *estados ou paises* te interessam?

Pode informar varios, separados por virgula.
_Ex: SP, MG, RJ_
----------------------------------------
_ou digite "voltar" para retornar_`
}

// Mapeia a opcao numerica de senioridade para o termo do matchingEngine.
const SENIORITY_OPTION_MAP = { "1": "junior", "2": "pleno", "3": "senior" }

// Mapeia a opcao numerica de area para o valor canonico (ver gate de area).
const AREA_OPTION_MAP = {
  "1": "backend", "2": "frontend", "3": "fullstack", "4": "mobile",
  "5": "devops", "6": "infra", "7": "dados", "8": "qa",
  "9": "seguranca", "10": "suporte"
}

/** Interpreta a escolha de area(s) de atuacao. */
function parseAreaInput(text) {
  const tokens = (text || "").split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)
  const out = []
  for (const t of tokens) {
    if (AREA_OPTION_MAP[t]) out.push(AREA_OPTION_MAP[t])
  }
  return [...new Set(out)]
}

/** Quebra uma entrada livre em lista (virgula / ponto-e-virgula / quebra de linha). */
function parseListInput(text) {
  return (text || "")
    .split(/[,;\n]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

/** Interpreta a escolha de senioridade. "0" (ou vazio) = qualquer nivel. */
function parseSeniorityInput(text) {
  const tokens = (text || "").split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)
  if (tokens.length === 0 || tokens.includes("0")) return []
  const out = []
  for (const t of tokens) {
    if (SENIORITY_OPTION_MAP[t]) out.push(SENIORITY_OPTION_MAP[t])
  }
  return [...new Set(out)]
}

/** Interpreta a escolha de modalidade. */
function parseWorkModeInput(text) {
  const tokens = (text || "").split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)
  return {
    hybrid: tokens.includes("1"),
    onsite: tokens.includes("2"),
    onlyRemote: tokens.includes("3")
  }
}

/**
 * Monta o objeto de filtros final a partir do rascunho coletado passo a passo.
 * "remoto" entra sempre — vagas remotas sao enviadas a todos os assinantes plus.
 */
function assembleVipFilters(draft) {
  const workMode = ["remoto"]
  if (draft.hybrid) workMode.push("hibrido")
  if (draft.onsite) workMode.push("presencial")

  return {
    roles: [],
    areas: draft.areas || [],
    stacks: draft.stacks || [],
    seniority: draft.seniority || [],
    locations: draft.locations || [],
    workMode,
    contract: [],
    languages: [],
    weights: {
      roles: 0,
      stacks: 45,
      seniority: 20,
      locations: 15,
      workMode: 20,
      contract: 0,
      languages: 0
    },
    must: {
      roles: false,
      stacks: true,
      workMode: true,
      contract: false,
      languages: false
    },
    ignoreUnknown: true
  }
}

/**
 * Parseia os filtros VIP enviados pelo usuário
 * @param {string} text - Texto com os filtros
 * @returns {Object|null} Objeto com filtros parseados ou null se inválido
 */
function parseVipFilters(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean)
  const filters = {
    roles: [],
    stacks: [],
    seniority: [],
    locations: [],
    workMode: [],
    contract: [],
    languages: [],
    weights: {
      roles: 20,
      stacks: 30,
      seniority: 15,
      locations: 10,
      workMode: 10,
      contract: 10,
      languages: 5
    },
    must: {
      roles: true,
      stacks: true,
      workMode: false,
      contract: false,
      languages: false
    },
    ignoreUnknown: true
  }

  const fieldMappings = {
    "roles": "roles",
    "role": "roles",
    "cargos": "roles",
    "cargo": "roles",
    "stacks": "stacks",
    "stack": "stacks",
    "tecnologias": "stacks",
    "senioridade": "seniority",
    "seniority": "seniority",
    "nivel": "seniority",
    "local": "locations",
    "locais": "locations",
    "locations": "locations",
    "localizacao": "locations",
    "modalidade": "workMode",
    "workmode": "workMode",
    "tipo": "workMode",
    "contrato": "contract",
    "contract": "contract",
    "regime": "contract",
    "idiomas": "languages",
    "idioma": "languages",
    "languages": "languages"
  }

  for (const line of lines) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    const rawKey = line.substring(0, colonIndex).trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const rawValue = line.substring(colonIndex + 1).trim()

    const fieldName = fieldMappings[rawKey]
    if (!fieldName) continue

    const values = rawValue.split(",").map(v => v.trim().toLowerCase()).filter(Boolean)
    if (values.length > 0) {
      filters[fieldName] = values
    }
  }

  // Valida campos obrigatórios
  if (filters.roles.length === 0 || filters.stacks.length === 0) {
    return null
  }

  return filters
}

/**
 * Formata os filtros VIP para exibição
 */
function formatVipFiltersForDisplay(filters) {
  if (!filters) return "Nenhum filtro definido"

  const AREA_LABEL = {
    backend: "Backend", frontend: "Frontend", fullstack: "Fullstack", mobile: "Mobile",
    devops: "DevOps/SRE", infra: "Infra/Redes", dados: "Dados/ML", qa: "QA/Testes",
    seguranca: "Seguranca", suporte: "Suporte"
  }
  const lines = []
  if (filters.areas?.length) {
    lines.push(`Areas: ${filters.areas.map((a) => AREA_LABEL[a] || a).join(", ")}`)
  }
  if (filters.roles?.length) lines.push(`Cargos: ${filters.roles.join(", ")}`)
  if (filters.stacks?.length) lines.push(`Stacks: ${filters.stacks.join(", ")}`)
  if (filters.seniority?.length) lines.push(`Senioridade: ${filters.seniority.join(", ")}`)
  if (filters.locations?.length) lines.push(`Local: ${filters.locations.join(", ")}`)
  if (filters.workMode?.length) lines.push(`Modalidade: ${filters.workMode.join(", ")}`)
  if (filters.contract?.length) lines.push(`Contrato: ${filters.contract.join(", ")}`)
  if (filters.languages?.length) lines.push(`Idiomas: ${filters.languages.join(", ")}`)

  return lines.length > 0 ? lines.join("\n") : "Nenhum filtro definido"
}

/**
 * Mensagem de pagamento para vagas privadas
 */
function getPaymentPrivateMessage() {
  return `*Vagas Personalizadas*

> Receba oportunidades filtradas por seu perfil:

*Cartao / Stripe:*
${PAYMENT_LINK_PRIVATE}

*PIX:*
CNPJ: 64.095.868/0001-03

_Apos confirmacao, voce recebera vagas personalizadas._

----------------------------------------
Digite *pago* apos o pagamento
_ou digite "voltar" para retornar_
Digite *menu* para menu principal`
}

function getLeadNameMessage(planLabel) {
  return `*${planLabel}*

> Para continuar, qual o seu nome completo?

----------------------------------------
Digite seu nome
_ou digite "voltar" para retornar_`
}

function getLeadPhoneMessage(name) {
  return `*Obrigado, ${name}!*

> Qual seu telefone com DDD?
_Ex: (31) 99999-9999_

----------------------------------------
Digite seu telefone
_ou digite "voltar" para retornar_`
}

function getLeadEmailMessage(name) {
  return `*Quase la, ${name}!*

> Informe seu e-mail para enviarmos a confirmacao:
_Ex: seuemail@dominio.com_

----------------------------------------
Digite seu e-mail
_ou digite "voltar" para retornar_`
}

/**
 * Mensagem após confirmação de pagamento do grupo
 */
function getGroupAccessMessage() {
  return `*Bem-vindo!*

Obrigado pela sua assinatura.

> Acesse o grupo exclusivo:
${JOB_GROUP_LINK}

Boas oportunidades!

----------------------------------------
Digite *menu* para voltar`
}

/**
 * Mensagem após confirmação de pagamento das vagas privadas
 */
function getPrivateAccessMessage() {
  return `*Bem-vindo!*

Obrigado pela sua assinatura.

Voce comecara a receber vagas personalizadas aqui no WhatsApp.
_Fique atento as notificacoes._

----------------------------------------
Digite *menu* para voltar`
}

/**
 * Mensagem de opção inválida
 */
function getInvalidOptionMessage() {
  return `*Opcao invalida*

_Responda com um dos numeros do menu atual._

> Digite *menu* para voltar ao inicio.`
}

/**
 * Mensagem de timeout de sessão
 */
function getSessionTimeoutMessage() {
  return `*Sessao Encerrada*

> Demoramos uma resposta e encerramos seu atendimento.
Para iniciar novamente, digite *menu*.

----------------------------------------
Estaremos felizes em ajudar novamente!`
}

/**
 * Notificação de pagamento - Grupo de Vagas
 */
function getPaymentNotificationGroup(clientNumber, leadData) {
  const leadLines = formatLeadLines(leadData)
  return `*Notificacao de Pagamento*

_Usuario pagou para acesso ao Grupo de Vagas._

*Cliente:* ${clientNumber}
${leadLines}*Data:* ${new Date().toLocaleString("pt-BR")}

----------------------------------------
> Ative o acesso no grupo!`
}

/**
 * Notificação de pagamento - Vagas Personalizadas
 */
function getPaymentNotificationPrivate(clientNumber, leadData) {
  const leadLines = formatLeadLines(leadData)
  return `*Notificacao de Pagamento*

_Usuario pagou para acesso as Vagas Personalizadas._

*Cliente:* ${clientNumber}
${leadLines}*Data:* ${new Date().toLocaleString("pt-BR")}

----------------------------------------
> Configure o acesso as vagas do cliente!`
}

/**
 * Solicita comprovante de pagamento
 */
function getPaymentReceiptRequestMessage() {
  return `*Comprovante de Pagamento*

> Para validar sua transacao, envie o comprovante.

_Voce pode enviar:_
- Screenshot do pagamento
- Comprovante da transferencia PIX
- Qualquer imagem que comprove o pagamento

----------------------------------------
_ou digite "voltar" para retornar_`
}

export async function customMiddleware({ socket, webMessage, type, commonFunctions, action, data }) {
  try {
    // Processa mensagens de texto e mídia
    if (type !== "message") {
      return
    }

    const { fullMessage, remoteJid, userLid, prefix } = extractDataFromMessage(webMessage)

    // DEBUG: Log para mensagens privadas com mídia
    const debugHasMedia = hasMediaContent(webMessage)
    if (debugHasMedia) {
      infoLog(`[DEBUG CUSTOM] Mídia recebida de ${remoteJid}`)
      infoLog(`[DEBUG CUSTOM] fullMessage: "${fullMessage}"`)
      infoLog(`[DEBUG CUSTOM] Message keys: ${Object.keys(webMessage?.message || {}).join(', ')}`)
    }

    // Ignora mensagens do próprio bot em QUALQUER contexto (privado ou grupo)
    const botLidClean = BOT_LID.replace("@lid", "").replace("@s.whatsapp.net", "")
    const userLidClean = userLid?.replace("@lid", "").replace("@s.whatsapp.net", "") || ""

    if (userLidClean === botLidClean || remoteJid === BOT_LID || remoteJid === BOT_LID.replace("@lid", "@s.whatsapp.net")) {
      if (debugHasMedia) infoLog(`[DEBUG CUSTOM] Ignorando: mensagem do próprio bot`)
      return
    }

    // Só processa mensagens privadas (não grupos)
    if (!isPrivateMessage(remoteJid)) {
      if (debugHasMedia) infoLog(`[DEBUG CUSTOM] Ignorando: não é mensagem privada`)
      return
    }

    // Log apenas para mensagens privadas e comandos
    const isCommand = prefix === PREFIX
    if (isCommand) {
      infoLog(`[CUSTOM MIDDLEWARE] Comando recebido: ${fullMessage}`)
    }

    // Se for um comando (começa com prefixo configurado), deixa passar sem interceptar
    if (isCommand) {
      return
    }

    // Processa estados que aceitam mídia ANTES de ignorar #auto-command
    // Isso permite que imagens sem caption sejam processadas quando o usuário está aguardando comprovante
    const userId = remoteJid
    let userState = conversationStates.get(userId)
    const messageTextRaw = fullMessage?.trim() || ""
    const messageText = messageTextRaw.toLowerCase()

    // Pareamento com o portal web: "parear <token>" (vindo do deep-link wa.me).
    // Tem prioridade sobre toda a maquina de estados do menu.
    const pairMatch = messageTextRaw.match(/^parear\s+([a-z0-9]{6})$/i)
    if (pairMatch) {
      await handleWhatsAppPairing(socket, remoteJid, userLid, pairMatch[1])
      return
    }

    // Verifica se há mídia na mensagem (imagem ou documento) - usa função que trata viewOnce, etc.
    const hasMedia = hasMediaContent(webMessage)

    // DEBUG: Log do estado atual
    if (hasMedia) {
      infoLog(`[DEBUG STATE] userId: ${userId}`)
      infoLog(`[DEBUG STATE] userState existe: ${!!userState}`)
      infoLog(`[DEBUG STATE] userState.state: ${userState?.state || 'undefined'}`)
      infoLog(`[DEBUG STATE] Todos estados salvos: ${Array.from(conversationStates.keys()).join(', ')}`)
    }

    if (userState && (userState.state === "awaiting_payment_receipt_group" || userState.state === "awaiting_payment_receipt_private")) {
      // Se estiver aguardando comprovante, processa a mensagem com webMessage completo
      // Aceita tanto mídia quanto texto (como "voltar")

      infoLog(`[CUSTOM MIDDLEWARE] Usuario aguardando comprovante. hasMedia: ${hasMedia}, messageText: "${messageText}"`)

      // Atualiza timeout
      updateSessionTimeout(socket, userId, remoteJid)
      userState.timestamp = Date.now()

      if (userState.state === "awaiting_payment_receipt_group") {
        await handlePaymentReceiptGroup(socket, remoteJid, messageText, userId, webMessage)
      } else if (userState.state === "awaiting_payment_receipt_private") {
        await handlePaymentReceiptPrivate(socket, remoteJid, messageText, userId, webMessage)
      }
      return
    }

    // Ignora mensagens #auto-command (mídia sem texto/caption) SOMENTE se não estiver aguardando comprovante
    // Essas mensagens são placeholders gerados automaticamente e não devem ser processadas como opções de menu
    if (fullMessage === "#auto-command") {
      return
    }

    infoLog(`[CUSTOM MIDDLEWARE] Mensagem privada recebida: "${fullMessage?.substring(0, 50)}${fullMessage?.length > 50 ? "..." : ""}"`)

    // Obtém o estado atual da conversa (verificado novamente para os demais casos)
    userState = conversationStates.get(userId)

    // Se o usuário digitar "menu", volta para o menu principal
    if (messageText === "menu") {
      conversationStates.set(userId, { state: "menu", timestamp: Date.now(), budgetData: {}, previousState: "" })
      await sendWithDelay(socket, remoteJid, { text: getMainMenu() })
      updateSessionTimeout(socket, userId, remoteJid)
      return
    }

    // Se não tem estado ou é primeira mensagem, mostra menu principal
    if (!userState) {
      conversationStates.set(userId, { state: "menu", timestamp: Date.now(), budgetData: {}, previousState: "" })
      await sendWithDelay(socket, remoteJid, { text: getMainMenu() })
      updateSessionTimeout(socket, userId, remoteJid)
      return
    }

    // Atualiza timeout (reseta o timer)
    updateSessionTimeout(socket, userId, remoteJid)

    // Atualiza timestamp
    userState.timestamp = Date.now()

    // Processa de acordo com o estado atual
    switch (userState.state) {
      case "menu":
        await handleMainMenu(socket, remoteJid, messageText, userId)
        break

      case "sonar_menu":
        await handleSonarMenu(socket, remoteJid, messageText, userId)
        break

      case "awaiting_budget_name":
        await handleBudgetName(socket, remoteJid, messageText, userId, messageTextRaw)
        break

      case "awaiting_budget_phone":
        await handleBudgetPhone(socket, remoteJid, messageText, userId)
        break

      case "awaiting_budget_email":
        await handleBudgetEmail(socket, remoteJid, messageText, userId)
        break

      case "awaiting_budget_company_type":
        await handleBudgetCompanyType(socket, remoteJid, messageText, userId)
        break

      case "awaiting_budget_description":
        await handleBudgetDescription(socket, remoteJid, messageText, userId, messageTextRaw)
        break

      case "awaiting_plan_name":
        await handlePlanName(socket, remoteJid, messageText, userId, messageTextRaw)
        break

      case "awaiting_plan_phone":
        await handlePlanPhone(socket, remoteJid, messageText, userId)
        break

      case "awaiting_plan_email":
        await handlePlanEmail(socket, remoteJid, messageText, userId)
        break

      case "awaiting_vip_area":
        await handleVipArea(socket, remoteJid, messageText, userId, messageTextRaw)
        break

      case "awaiting_vip_stacks":
        await handleVipStacks(socket, remoteJid, messageText, userId, messageTextRaw)
        break

      case "awaiting_vip_seniority":
        await handleVipSeniority(socket, remoteJid, messageText, userId, messageTextRaw)
        break

      case "awaiting_vip_workmode":
        await handleVipWorkMode(socket, remoteJid, messageText, userId, messageTextRaw)
        break

      case "awaiting_vip_location":
        await handleVipLocation(socket, remoteJid, messageText, userId, messageTextRaw)
        break

      case "awaiting_payment_group":
        await handlePaymentGroup(socket, remoteJid, messageText, userId)
        break

      case "awaiting_payment_private":
        await handlePaymentPrivate(socket, remoteJid, messageText, userId)
        break

      case "awaiting_payment_receipt_group":
        await handlePaymentReceiptGroup(socket, remoteJid, messageText, userId, webMessage)
        break

      case "awaiting_payment_receipt_private":
        await handlePaymentReceiptPrivate(socket, remoteJid, messageText, userId, webMessage)
        break

      case "awaiting_vip_release_decision":
        await handleVipReleaseDecision(socket, remoteJid, messageText, userId)
        break

      default:
        conversationStates.set(userId, { state: "menu", timestamp: Date.now() })
        await sendWithDelay(socket, remoteJid, { text: getMainMenu() })
    }
  } catch (error) {
    errorLog(`[CUSTOM MIDDLEWARE] Erro no middleware customizado: ${error.message}`)
    errorLog(`[CUSTOM MIDDLEWARE] Stack: ${error.stack}`)
  }
}

/**
 * Processa o nome do orçamento
 */
async function handleBudgetName(socket, remoteJid, messageText, userId, rawMessage) {
  try {
    if (messageText === "voltar") {
      const userState = conversationStates.get(userId)
      userState.state = "menu"
      userState.timestamp = Date.now()
      userState.budgetData = {}
      userState.previousState = ""
      conversationStates.set(userId, userState)

      infoLog(`[HANDLE BUDGET NAME] Usuario voltou ao menu`)
      await sendWithDelay(socket, remoteJid, { text: getMainMenu() })
      return
    }

    const nameInput = (rawMessage || messageText).trim()

    if (!isValidName(nameInput)) {
      infoLog(`[HANDLE BUDGET NAME] Nome invalido recebido`)
      await sendWithDelay(socket, remoteJid, { text: `*Nome invalido*\n_Digite seu nome completo (nome e sobrenome)._` })
      return
    }

    let userState = conversationStates.get(userId)
    userState.budgetData.name = nameInput
    userState.state = "awaiting_budget_phone"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)

    infoLog(`[HANDLE BUDGET NAME] Nome registrado: ${nameInput}`)
    await sendWithDelay(socket, remoteJid, { text: getBudgetPhoneMessage(nameInput) })
  } catch (error) {
    errorLog(`[HANDLE BUDGET NAME] Erro: ${error.message}`)
    errorLog(`[HANDLE BUDGET NAME] Stack: ${error.stack}`)
  }
}

async function handleBudgetPhone(socket, remoteJid, messageText, userId) {
  try {
    if (messageText === "voltar") {
      const userState = conversationStates.get(userId)
      userState.state = "awaiting_budget_name"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)

      infoLog(`[HANDLE BUDGET PHONE] Usuario voltou ao passo anterior`)
      await sendWithDelay(socket, remoteJid, { text: getBudgetNameMessage() })
      return
    }

    if (!isValidPhone(messageText)) {
      infoLog(`[HANDLE BUDGET PHONE] Telefone invalido recebido`)
      await sendWithDelay(socket, remoteJid, { text: `*Telefone invalido*\n_Envie com DDD. Ex: 31999999999._` })
      return
    }

    let userState = conversationStates.get(userId)
    userState.budgetData.phone = formatPhone(messageText)
    userState.state = "awaiting_budget_email"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)

    infoLog(`[HANDLE BUDGET PHONE] Telefone registrado: ${messageText}`)
    await sendWithDelay(socket, remoteJid, { text: getBudgetEmailMessage(userState.budgetData.name || "") })
  } catch (error) {
    errorLog(`[HANDLE BUDGET PHONE] Erro: ${error.message}`)
    errorLog(`[HANDLE BUDGET PHONE] Stack: ${error.stack}`)
  }
}

async function handleBudgetEmail(socket, remoteJid, messageText, userId) {
  try {
    if (messageText === "voltar") {
      const userState = conversationStates.get(userId)
      userState.state = "awaiting_budget_phone"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)

      infoLog(`[HANDLE BUDGET EMAIL] Usuario voltou ao passo anterior`)
      await sendWithDelay(socket, remoteJid, { text: getBudgetPhoneMessage(userState.budgetData.name || "") })
      return
    }

    if (!isValidEmail(messageText)) {
      infoLog(`[HANDLE BUDGET EMAIL] Email invalido recebido`)
      await sendWithDelay(socket, remoteJid, { text: `*E-mail invalido*\n_Verifique e envie novamente._` })
      return
    }

    let userState = conversationStates.get(userId)
    userState.budgetData.email = messageText.trim()
    userState.state = "awaiting_budget_company_type"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)

    infoLog(`[HANDLE BUDGET EMAIL] Email registrado: ${messageText}`)
    await sendWithDelay(socket, remoteJid, { text: getBudgetCompanyTypeMessage(userState.budgetData.name || "") })
  } catch (error) {
    errorLog(`[HANDLE BUDGET EMAIL] Erro: ${error.message}`)
    errorLog(`[HANDLE BUDGET EMAIL] Stack: ${error.stack}`)
  }
}

async function handleBudgetCompanyType(socket, remoteJid, messageText, userId) {
  try {
    if (messageText === "voltar") {
      const userState = conversationStates.get(userId)
      userState.state = "awaiting_budget_email"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)

      infoLog(`[HANDLE BUDGET COMPANY] Usuario voltou ao passo anterior`)
      await sendWithDelay(socket, remoteJid, { text: getBudgetEmailMessage(userState.budgetData.name || "") })
      return
    }

    if (!["1", "2"].includes(messageText)) {
      await sendWithDelay(socket, remoteJid, { text: `*Opcao invalida*\n_Digite 1 para empresa ou 2 para pessoa fisica._` })
      return
    }

    let userState = conversationStates.get(userId)
    userState.budgetData.companyType = messageText === "1" ? "Empresa" : "Pessoa fisica"
    userState.state = "awaiting_budget_description"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)

    infoLog(`[HANDLE BUDGET COMPANY] Tipo registrado: ${userState.budgetData.companyType}`)
    await sendWithDelay(socket, remoteJid, { text: getBudgetDescriptionMessage(userState.budgetData.name || "") })
  } catch (error) {
    errorLog(`[HANDLE BUDGET COMPANY] Erro: ${error.message}`)
    errorLog(`[HANDLE BUDGET COMPANY] Stack: ${error.stack}`)
  }
}

/**
 * Processa a descrição do orçamento
 */
async function handleBudgetDescription(socket, remoteJid, messageText, userId, rawMessage) {
  try {
    if (messageText === "voltar") {
      const userState = conversationStates.get(userId)
      userState.state = "awaiting_budget_company_type"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)

      infoLog(`[HANDLE BUDGET DESCRIPTION] Usuario voltou ao passo anterior`)
      await sendWithDelay(socket, remoteJid, { text: getBudgetCompanyTypeMessage(userState.budgetData.name || "") })
      return
    }

    const descriptionInput = (rawMessage || messageText).trim()

    if (!descriptionInput || descriptionInput.length === 0) {
      infoLog(`[HANDLE BUDGET DESCRIPTION] Descricao vazia recebida`)
      await sendWithDelay(socket, remoteJid, { text: `*Descricao invalida*\n_Escreva uma descricao breve do projeto._` })
      return
    }

    let userState = conversationStates.get(userId)
    userState.budgetData.description = descriptionInput
    userState.budgetData.clientNumber = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "")
    userState.state = "menu"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)

    const budgetData = userState.budgetData

    infoLog(`[HANDLE BUDGET DESCRIPTION] Orcamento completo: ${JSON.stringify(budgetData)}`)

    for (const targetNumber of ORCAMENTO_NUMBERS) {
      try {
        await sendWithDelay(socket, targetNumber, {
          text: getBudgetDetailsMessage(budgetData)
        })
        infoLog(`[HANDLE BUDGET DESCRIPTION] Orcamento enviado para ${targetNumber}`)
      } catch (error) {
        errorLog(`[HANDLE BUDGET DESCRIPTION] Erro ao enviar orcamento para ${targetNumber}: ${error.message}`)
      }
    }

    await sendWithDelay(socket, remoteJid, { text: getBudgetConfirmationMessage() })
  } catch (error) {
    errorLog(`[HANDLE BUDGET DESCRIPTION] Erro: ${error.message}`)
    errorLog(`[HANDLE BUDGET DESCRIPTION] Stack: ${error.stack}`)
  }
}

/**
 * Processa opções do menu principal
 */
async function handleMainMenu(socket, remoteJid, messageText, userId) {
  try {
    const validOptions = ["1", "2", "3", "4"]

    if (!validOptions.includes(messageText)) {
      infoLog(`[HANDLE MAIN MENU] Opcao invalida: "${messageText}". Enviando mensagem de erro.`)
      await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() })
      return
    }

    switch (messageText) {
      case "1":
        conversationStates.set(userId, {
          state: "awaiting_budget_name",
          timestamp: Date.now(),
          budgetData: { name: "", phone: "", email: "", companyType: "", description: "" },
          previousState: ""
        })
        await sendWithDelay(socket, remoteJid, { text: getBudgetNameMessage() })
        break

      case "2":
        await sendWithDelay(socket, remoteJid, { text: getCalendarMessage() })
        conversationStates.set(userId, { state: "menu", timestamp: Date.now() })
        break

      case "3":
        conversationStates.set(userId, { state: "sonar_menu", timestamp: Date.now() })
        await sendWithDelay(socket, remoteJid, { text: getSonarMenu() })
        break

      case "4":
        await sendWithDelay(socket, remoteJid, { text: getPartnerMessage() })
        conversationStates.set(userId, { state: "menu", timestamp: Date.now() })
        break

      default:
        await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() })
    }
  } catch (error) {
    errorLog(`[HANDLE MAIN MENU] Erro: ${error.message}`)
    errorLog(`[HANDLE MAIN MENU] Stack: ${error.stack}`)
  }
}

/**
 * Processa opções do submenu Sonar Bot
 */
async function handleSonarMenu(socket, remoteJid, messageText, userId) {
  try {
    // Validação de entrada: apenas voltar, 1 ou 2 são válidos
    const validOptions = ["voltar", "1", "2"]

    if (!validOptions.includes(messageText)) {
      infoLog(`[HANDLE SONAR MENU] Opção inválida: "${messageText}". Enviando mensagem de erro.`)
      await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() })
      return
    }

    switch (messageText) {
      case "voltar":
        // Volta ao menu principal
        conversationStates.set(userId, { state: "menu", timestamp: Date.now() })
        await sendWithDelay(socket, remoteJid, { text: getMainMenu() })
        break

      case "1":
        // Op??o 1 - Grupo de Vagas (coleta de dados)
        conversationStates.set(userId, {
          state: "awaiting_plan_name",
          timestamp: Date.now(),
          planType: "group",
          leadData: { name: "", phone: "", email: "" }
        })
        await sendWithDelay(socket, remoteJid, { text: getLeadNameMessage("Grupo de Vagas") })
        break

      case "2":
        // Op??o 2 - Vagas personalizadas no privado (coleta de dados)
        conversationStates.set(userId, {
          state: "awaiting_plan_name",
          timestamp: Date.now(),
          planType: "private",
          leadData: { name: "", phone: "", email: "" }
        })
        await sendWithDelay(socket, remoteJid, { text: getLeadNameMessage("Vagas Personalizadas") })
        break

      default:
        await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() })
    }
  } catch (error) {
    errorLog(`[HANDLE SONAR MENU] Erro: ${error.message}`)
    errorLog(`[HANDLE SONAR MENU] Stack: ${error.stack}`)
  }
}

/**
 * Processa confirmação de pagamento para acesso ao grupo
 */

async function handlePlanName(socket, remoteJid, messageText, userId, rawMessage) {
  try {
    if (messageText === "voltar") {
      conversationStates.set(userId, { state: "sonar_menu", timestamp: Date.now() })
      await sendWithDelay(socket, remoteJid, { text: getSonarMenu() })
      return
    }

    const nameInput = (rawMessage || messageText).trim()

    if (!isValidName(nameInput)) {
      await sendWithDelay(socket, remoteJid, { text: `*Nome invalido*\n_Digite seu nome completo (nome e sobrenome)._` })
      return
    }

    const userState = conversationStates.get(userId)
    userState.leadData.name = nameInput
    userState.state = "awaiting_plan_phone"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)

    await sendWithDelay(socket, remoteJid, { text: getLeadPhoneMessage(userState.leadData.name) })
  } catch (error) {
    errorLog(`[HANDLE PLAN NAME] Erro: ${error.message}`)
  }
}

async function handlePlanPhone(socket, remoteJid, messageText, userId) {
  try {
    if (messageText === "voltar") {
      const userState = conversationStates.get(userId)
      userState.state = "awaiting_plan_name"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)

      await sendWithDelay(socket, remoteJid, { text: getLeadNameMessage(userState.planType === "group" ? "Grupo de Vagas" : "Vagas Personalizadas") })
      return
    }

    if (!isValidPhone(messageText)) {
      await sendWithDelay(socket, remoteJid, { text: `*Telefone invalido*\n_Envie com DDD. Ex: 31999999999._` })
      return
    }

    const userState = conversationStates.get(userId)
    userState.leadData.phone = formatPhone(messageText)
    userState.state = "awaiting_plan_email"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)

    await sendWithDelay(socket, remoteJid, { text: getLeadEmailMessage(userState.leadData.name) })
  } catch (error) {
    errorLog(`[HANDLE PLAN PHONE] Erro: ${error.message}`)
  }
}

async function handlePlanEmail(socket, remoteJid, messageText, userId) {
  try {
    if (messageText === "voltar") {
      const userState = conversationStates.get(userId)
      userState.state = "awaiting_plan_phone"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)

      await sendWithDelay(socket, remoteJid, { text: getLeadPhoneMessage(userState.leadData.name) })
      return
    }

    if (!isValidEmail(messageText)) {
      await sendWithDelay(socket, remoteJid, { text: `*E-mail invalido*\n_Verifique e envie novamente._` })
      return
    }

    const userState = conversationStates.get(userId)
    userState.leadData.email = messageText.trim()
    userState.timestamp = Date.now()

    if (userState.planType === "group") {
      userState.state = "awaiting_payment_group"
      conversationStates.set(userId, userState)
      await sendWithDelay(socket, remoteJid, { text: getPaymentGroupMessage() })
      return
    }

    // Para VIP (plano Plus), coleta os filtros em fluxo guiado passo a passo.
    userState.state = "awaiting_vip_area"
    userState.vipDraft = {}
    conversationStates.set(userId, userState)
    await sendWithDelay(socket, remoteJid, { text: getVipAreaMessage() })
  } catch (error) {
    errorLog(`[HANDLE PLAN EMAIL] Erro: ${error.message}`)
  }
}

/**
 * Passo 1/5 — Area de atuacao (obrigatorio, aceita varias).
 */
async function handleVipArea(socket, remoteJid, messageText, userId, rawMessage) {
  try {
    const userState = conversationStates.get(userId)
    if (messageText === "voltar") {
      userState.state = "awaiting_plan_email"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)
      await sendWithDelay(socket, remoteJid, { text: getLeadEmailMessage(userState.leadData?.name || "") })
      return
    }

    const areas = parseAreaInput(rawMessage || messageText)
    if (areas.length === 0) {
      await sendWithDelay(socket, remoteJid, {
        text: `*Nao entendi a area*\n\nDigite o(s) numero(s) da area.\n_Ex: 1 (Backend) ou 1,3_`
      })
      return
    }

    userState.vipDraft = { ...(userState.vipDraft || {}), areas }
    userState.state = "awaiting_vip_stacks"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)
    await sendWithDelay(socket, remoteJid, { text: getVipStacksMessage() })
  } catch (error) {
    errorLog(`[HANDLE VIP AREA] Erro: ${error.message}`)
  }
}

/**
 * Passo 2/5 — Stacks (obrigatorio, aceita varias).
 */
async function handleVipStacks(socket, remoteJid, messageText, userId, rawMessage) {
  try {
    const userState = conversationStates.get(userId)
    if (messageText === "voltar") {
      userState.state = "awaiting_vip_area"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)
      await sendWithDelay(socket, remoteJid, { text: getVipAreaMessage() })
      return
    }

    const stacks = parseListInput(rawMessage || messageText)
    if (stacks.length === 0) {
      await sendWithDelay(socket, remoteJid, {
        text: `*Nao entendi as stacks*\n\nInforme ao menos uma tecnologia.\n_Ex: react, node, python_`
      })
      return
    }

    userState.vipDraft = { ...(userState.vipDraft || {}), stacks }
    userState.state = "awaiting_vip_seniority"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)
    await sendWithDelay(socket, remoteJid, { text: getVipSeniorityMessage() })
  } catch (error) {
    errorLog(`[HANDLE VIP STACKS] Erro: ${error.message}`)
  }
}

/**
 * Passo 2/4 — Senioridade (aceita varias; 0 = qualquer nivel).
 */
async function handleVipSeniority(socket, remoteJid, messageText, userId, rawMessage) {
  try {
    const userState = conversationStates.get(userId)
    if (messageText === "voltar") {
      userState.state = "awaiting_vip_stacks"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)
      await sendWithDelay(socket, remoteJid, { text: getVipStacksMessage() })
      return
    }

    const seniority = parseSeniorityInput(rawMessage || messageText)
    userState.vipDraft = { ...(userState.vipDraft || {}), seniority }
    userState.state = "awaiting_vip_workmode"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)
    await sendWithDelay(socket, remoteJid, { text: getVipWorkModeMessage() })
  } catch (error) {
    errorLog(`[HANDLE VIP SENIORITY] Erro: ${error.message}`)
  }
}

/**
 * Passo 3/4 — Modalidade. Remoto eh sempre incluido; aqui escolhe-se
 * hibrido/presencial. Se for so remoto, pula a localizacao.
 */
async function handleVipWorkMode(socket, remoteJid, messageText, userId, rawMessage) {
  try {
    const userState = conversationStates.get(userId)
    if (messageText === "voltar") {
      userState.state = "awaiting_vip_seniority"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)
      await sendWithDelay(socket, remoteJid, { text: getVipSeniorityMessage() })
      return
    }

    const wm = parseWorkModeInput(rawMessage || messageText)
    if (!wm.hybrid && !wm.onsite && !wm.onlyRemote) {
      await sendWithDelay(socket, remoteJid, {
        text: `*Opcao invalida*\n\nDigite *1* (hibrido), *2* (presencial) ou *3* (so remoto).\n_Pode combinar, ex: 1,2_`
      })
      return
    }

    userState.vipDraft = { ...(userState.vipDraft || {}), hybrid: wm.hybrid, onsite: wm.onsite }
    userState.timestamp = Date.now()

    if (wm.hybrid || wm.onsite) {
      userState.state = "awaiting_vip_location"
      conversationStates.set(userId, userState)
      await sendWithDelay(socket, remoteJid, { text: getVipLocationMessage() })
      return
    }

    // So remoto: nao precisa de localizacao — finaliza os filtros.
    userState.vipFilters = assembleVipFilters({ ...userState.vipDraft, locations: [] })
    userState.state = "awaiting_payment_private"
    conversationStates.set(userId, userState)
    infoLog(`[HANDLE VIP WORKMODE] Filtros (so remoto) para ${userId}: ${JSON.stringify(userState.vipFilters)}`)
    await sendWithDelay(socket, remoteJid, { text: getPaymentPrivateMessage() })
  } catch (error) {
    errorLog(`[HANDLE VIP WORKMODE] Erro: ${error.message}`)
  }
}

/**
 * Passo 4/4 — Localizacao (estados/paises) para vagas hibridas/presenciais.
 */
async function handleVipLocation(socket, remoteJid, messageText, userId, rawMessage) {
  try {
    const userState = conversationStates.get(userId)
    if (messageText === "voltar") {
      userState.state = "awaiting_vip_workmode"
      userState.timestamp = Date.now()
      conversationStates.set(userId, userState)
      await sendWithDelay(socket, remoteJid, { text: getVipWorkModeMessage() })
      return
    }

    const locations = parseListInput(rawMessage || messageText)
    if (locations.length === 0) {
      await sendWithDelay(socket, remoteJid, {
        text: `*Nao entendi a localizacao*\n\nInforme ao menos um estado ou pais.\n_Ex: SP, MG, RJ_`
      })
      return
    }

    userState.vipFilters = assembleVipFilters({ ...userState.vipDraft, locations })
    userState.state = "awaiting_payment_private"
    userState.timestamp = Date.now()
    conversationStates.set(userId, userState)
    infoLog(`[HANDLE VIP LOCATION] Filtros para ${userId}: ${JSON.stringify(userState.vipFilters)}`)
    await sendWithDelay(socket, remoteJid, { text: getPaymentPrivateMessage() })
  } catch (error) {
    errorLog(`[HANDLE VIP LOCATION] Erro: ${error.message}`)
  }
}

async function handlePaymentGroup(socket, remoteJid, messageText, userId) {
  try {
    switch (messageText) {
      case "voltar":
        conversationStates.set(userId, { state: "sonar_menu", timestamp: Date.now() })
        await sendWithDelay(socket, remoteJid, { text: getSonarMenu() })
        break

      case "pago": {
        const userState = conversationStates.get(userId)
        conversationStates.set(userId, {
          state: "awaiting_payment_receipt_group",
          timestamp: Date.now(),
          clientNumber: remoteJid,
          leadData: userState?.leadData || {}
        })
        await sendWithDelay(socket, remoteJid, { text: getPaymentReceiptRequestMessage() })
        break
      }

      default:
        await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() })
    }
  } catch (error) {
    errorLog(`[HANDLE PAYMENT GROUP] Erro: ${error.message}`)
    errorLog(`[HANDLE PAYMENT GROUP] Stack: ${error.stack}`)
  }
}

/**
 * Processa confirmação de pagamento para vagas privadas
 */
async function handlePaymentPrivate(socket, remoteJid, messageText, userId) {
  try {
    const userState = conversationStates.get(userId)

    switch (messageText) {
      case "voltar":
        // Volta para o ultimo passo da coleta de filtros (modalidade).
        userState.state = "awaiting_vip_workmode"
        userState.timestamp = Date.now()
        conversationStates.set(userId, userState)
        await sendWithDelay(socket, remoteJid, { text: getVipWorkModeMessage() })
        break

      case "pago": {
        infoLog(`[DEBUG PAGO] Definindo estado awaiting_payment_receipt_private para userId: ${userId}`)
        conversationStates.set(userId, {
          state: "awaiting_payment_receipt_private",
          timestamp: Date.now(),
          clientNumber: remoteJid,
          leadData: userState?.leadData || {},
          vipFilters: userState?.vipFilters || null
        })
        infoLog(`[DEBUG PAGO] Estado salvo. Filtros VIP: ${JSON.stringify(userState?.vipFilters)}`)
        await sendWithDelay(socket, remoteJid, { text: getPaymentReceiptRequestMessage() })
        break
      }

      default:
        await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() })
    }
  } catch (error) {
    errorLog(`[HANDLE PAYMENT PRIVATE] Erro: ${error.message}`)
    errorLog(`[HANDLE PAYMENT PRIVATE] Stack: ${error.stack}`)
  }
}

/**
 * Processa comprovante de pagamento para grupo de vagas
 */
async function handlePaymentReceiptGroup(socket, remoteJid, messageText, userId, webMessage) {
  try {
    const userState = conversationStates.get(userId)

    if (messageText === "voltar") {
      conversationStates.set(userId, { state: "awaiting_payment_group", timestamp: Date.now(), leadData: userState?.leadData || {} })
      await sendWithDelay(socket, remoteJid, { text: getPaymentGroupMessage() })
      return
    }

    if (hasMediaContent(webMessage)) {
      const clientNumber = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "")
      const leadData = userState?.leadData || {}

      infoLog(`[HANDLE PAYMENT RECEIPT GROUP] Mídia detectada do cliente ${clientNumber}. Iniciando download...`)

      // Baixa a mídia antes de encaminhar
      const media = await downloadMediaFromMessage(webMessage)

      if (!media) {
        errorLog(`[HANDLE PAYMENT RECEIPT GROUP] Falha ao baixar mídia do cliente ${clientNumber}`)
        await sendWithDelay(socket, remoteJid, { text: `*Erro ao processar comprovante*\n\nPor favor, envie novamente a imagem ou documento.` })
        return
      }

      infoLog(`[HANDLE PAYMENT RECEIPT GROUP] Mídia baixada com sucesso: ${media.isImage ? 'imagem' : 'documento'}`)

      for (const targetNumber of PAYMENT_NOTIFICATION_NUMBERS) {
        try {
          // Envia a mídia usando o buffer baixado
          if (media.isImage) {
            await sendWithDelay(socket, targetNumber, {
              image: media.buffer,
              caption: `*Comprovante de Pagamento - Grupo de Vagas*

*Cliente:* ${clientNumber}
*Data:* ${new Date().toLocaleString("pt-BR")}`
            })
          } else {
            await sendWithDelay(socket, targetNumber, {
              document: media.buffer,
              mimetype: media.mimetype,
              fileName: media.filename || `comprovante_${clientNumber}.pdf`,
              caption: `*Comprovante de Pagamento - Grupo de Vagas*

*Cliente:* ${clientNumber}
*Data:* ${new Date().toLocaleString("pt-BR")}`
            })
          }

          await sendWithDelay(socket, targetNumber, {
            text: getPaymentNotificationGroup(clientNumber, leadData)
          })

          infoLog(`[HANDLE PAYMENT RECEIPT GROUP] Comprovante enviado para ${targetNumber}`)
        } catch (error) {
          errorLog(`[HANDLE PAYMENT RECEIPT GROUP] Erro ao enviar para ${targetNumber}: ${error.message}`)
        }
      }

      await sendWithDelay(socket, remoteJid, { text: getGroupAccessMessage() })
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() })
    } else {
      await sendWithDelay(socket, remoteJid, { text: getPaymentReceiptRequestMessage() })
    }
  } catch (error) {
    errorLog(`[HANDLE PAYMENT RECEIPT GROUP] Erro: ${error.message}`)
    errorLog(`[HANDLE PAYMENT RECEIPT GROUP] Stack: ${error.stack}`)
  }
}

/**
 * Processa comprovante de pagamento para vagas privadas
 * Agora salva como PENDENTE e aguarda aprovação do owner
 */
async function handlePaymentReceiptPrivate(socket, remoteJid, messageText, userId, webMessage) {
  try {
    const userState = conversationStates.get(userId)

    if (messageText === "voltar") {
      conversationStates.set(userId, {
        state: "awaiting_payment_private",
        timestamp: Date.now(),
        leadData: userState?.leadData || {},
        vipFilters: userState?.vipFilters || null
      })
      await sendWithDelay(socket, remoteJid, { text: getPaymentPrivateMessage() })
      return
    }

    if (hasMediaContent(webMessage)) {
      const clientNumber = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "")
      // Captura o LID REAL do remetente (Fluxo B). Os digitos do LID nao sao
      // o telefone, entao montar `${numero}@lid` daria um LID invalido.
      const { userLid: senderLid } = extractDataFromMessage(webMessage)
      const clientLid = senderLid && senderLid.includes("@lid")
        ? senderLid
        : (remoteJid.includes("@lid") ? remoteJid : `${clientNumber}@lid`)
      const leadData = userState?.leadData || {}
      const clientName = leadData?.name || "Não informado"
      const vipFilters = userState?.vipFilters || null

      infoLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Mídia detectada do cliente ${clientNumber}. Iniciando download...`)

      // Baixa a mídia antes de encaminhar
      const media = await downloadMediaFromMessage(webMessage)

      if (!media) {
        errorLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Falha ao baixar mídia do cliente ${clientNumber}`)
        await sendWithDelay(socket, remoteJid, { text: `*Erro ao processar comprovante*\n\nPor favor, envie novamente a imagem ou documento.` })
        return
      }

      infoLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Mídia baixada com sucesso: ${media.isImage ? 'imagem' : 'documento'}`)

      // Salva como PENDENTE (NÃO como VIP ainda)
      await addVipPendingSubscriber(clientName, clientLid, vipFilters)
      await updateVipPendingPaymentProof(clientLid, {
        type: media.isImage ? "image" : "document",
        receivedAt: new Date().toISOString()
      })

      infoLog(`[VIP] Cliente ${clientName} (${clientLid}) salvo como PENDENTE. Aguardando aprovação.`)

      // Notifica os aprovadores
      const approvalTargets = [...(PAYMENT_NOTIFICATION_NUMBERS || [])]
      if (OWNER_LID && !approvalTargets.includes(OWNER_LID)) {
        approvalTargets.push(OWNER_LID)
      }

      for (const targetNumber of approvalTargets) {
        try {
          // Envia a mídia usando o buffer baixado
          if (media.isImage) {
            await sendWithDelay(socket, targetNumber, {
              image: media.buffer,
              caption: `*COMPROVANTE VIP*

Cliente: ${clientName}
Número: ${clientNumber}
Data: ${new Date().toLocaleString("pt-BR")}`
            })
          } else {
            await sendWithDelay(socket, targetNumber, {
              document: media.buffer,
              mimetype: media.mimetype,
              fileName: media.filename || `comprovante_vip_${clientNumber}.pdf`,
              caption: `*COMPROVANTE VIP*

Cliente: ${clientName}
Número: ${clientNumber}
Data: ${new Date().toLocaleString("pt-BR")}`
            })
          }

          // Formata os filtros para exibição
          const filtersSummary = formatVipFiltersForDisplay(vipFilters)

          const approvalMessage = `*SOLICITAÇÃO DE VIP*
━━━━━━━━━━━━━━━━━━━━━
Nome: ${clientName}
Número: ${clientNumber}
Data: ${new Date().toLocaleString("pt-BR")}
━━━━━━━━━━━━━━━━━━━━━

*FILTROS SOLICITADOS:*
${filtersSummary}

━━━━━━━━━━━━━━━━━━━━━
*Deseja liberar o VIP?*

*1* - Liberar VIP
*2* - Não liberar
━━━━━━━━━━━━━━━━━━━━━`

          await sendWithDelay(socket, targetNumber, { text: approvalMessage })

          // Salva estado para aguardar decisão
          conversationStates.set(targetNumber, {
            state: "awaiting_vip_release_decision",
            timestamp: Date.now(),
            approval: {
              clientNumber,
              clientLid,
              clientName,
              vipFilters
            }
          })

          infoLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Aguardando aprovação de ${targetNumber}`)
        } catch (error) {
          errorLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Erro ao enviar para ${targetNumber}: ${error.message}`)
        }
      }

      // Informa o cliente que o comprovante foi recebido
      await sendWithDelay(socket, remoteJid, {
        text: `*Comprovante recebido!*

Seu pagamento está sendo verificado.
Você receberá uma confirmação assim que for aprovado.

_Aguarde a liberação do seu acesso VIP._`
      })

      conversationStates.set(userId, { state: "menu", timestamp: Date.now() })
    } else {
      await sendWithDelay(socket, remoteJid, { text: getPaymentReceiptRequestMessage() })
    }
  } catch (error) {
    errorLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Erro: ${error.message}`)
    errorLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Stack: ${error.stack}`)
  }
}

/**
 * Processa a decisão de liberação do VIP (1-Liberar / 2-Negar)
 */
async function handleVipReleaseDecision(socket, remoteJid, messageText, userId) {
  try {
    const userState = conversationStates.get(userId)
    const approval = userState?.approval
    if (!approval) {
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() })
      return
    }

    const clientLid = approval.clientLid
    const approverLid = remoteJid.includes("@lid") ? remoteJid : `${remoteJid.replace("@s.whatsapp.net", "")}@lid`

    if (messageText === "1") {
      // Aprova o VIP
      const result = await approveVipSubscriber(clientLid, approverLid)

      if (result.ok) {
        const successMsg = `*VIP LIBERADO!*

Cliente: ${approval.clientName || approval.clientNumber}
LID: ${clientLid}

O cliente agora receberá vagas personalizadas.`

        await sendWithDelay(socket, remoteJid, { text: successMsg })

        // Notifica o cliente que foi aprovado.
        // Envia direto para o LID: os digitos do LID NAO sao o telefone,
        // entao converter para @s.whatsapp.net mandaria para o numero errado.
        try {
          await sendWithDelay(socket, clientLid, {
            text: `*Parabéns! Seu VIP foi ativado!*

Você agora receberá vagas personalizadas de acordo com seu perfil.

Fique atento às notificações!`
          })
        } catch (notifyError) {
          errorLog(`[VIP RELEASE] Erro ao notificar cliente: ${notifyError.message}`)
        }

        infoLog(`[VIP] Cliente ${approval.clientName} (${clientLid}) APROVADO por ${approverLid}`)
      } else {
        await sendWithDelay(socket, remoteJid, { text: `Erro ao liberar VIP: ${result.reason}` })
      }

      conversationStates.set(userId, { state: "menu", timestamp: Date.now() })
      return
    }

    if (messageText === "2") {
      // Rejeita o VIP
      const result = await rejectVipSubscriber(clientLid, approverLid, "Pagamento não confirmado")

      if (result.ok) {
        await sendWithDelay(socket, remoteJid, {
          text: `*VIP NÃO LIBERADO*

Cliente: ${approval.clientName || approval.clientNumber}

O cliente não foi adicionado como VIP.`
        })

        infoLog(`[VIP] Cliente ${approval.clientName} (${clientLid}) REJEITADO por ${approverLid}`)
      } else {
        await sendWithDelay(socket, remoteJid, { text: `Erro ao rejeitar: ${result.reason}` })
      }

      conversationStates.set(userId, { state: "menu", timestamp: Date.now() })
      return
    }

    await sendWithDelay(socket, remoteJid, {
      text: `*Opção inválida*

Digite *1* para LIBERAR o VIP
Digite *2* para NÃO liberar`
    })
  } catch (error) {
    errorLog(`[HANDLE VIP RELEASE] Erro: ${error.message}`)
  }
}

/**
 * Processa o pareamento de um assinante do portal web.
 *
 * O assinante gera um token no dashboard e o envia ao bot ("parear <token>").
 * Esta mensagem carrega o LID do WhatsApp; o token identifica o assinante.
 * Validamos o token no portal, gravamos o vinculo e disparamos a busca VIP.
 */
async function handleWhatsAppPairing(socket, remoteJid, userLid, token) {
  try {
    // Em chat privado o LID vem em remoteJid; userLid cobre o caso de grupo.
    const identity = userLid || remoteJid || ""
    const digits = identity.replace("@s.whatsapp.net", "").replace("@lid", "")

    if (!digits) {
      await sendWithDelay(socket, remoteJid, {
        text: "*Nao consegui identificar seu WhatsApp.*\n\nTente novamente pelo botao do painel."
      })
      return
    }

    const lid = `${digits}@lid`
    const normalizedToken = token.toUpperCase()

    await sendWithDelay(socket, remoteJid, {
      text: "*Conectando...*\n\nValidando seu codigo, um instante."
    })

    const result = await pairSubscriberByToken({ token: normalizedToken, lid })

    if (!result.ok) {
      const msg = result.reason === "invalid_or_used_token"
        ? `*Codigo invalido*

O codigo *${normalizedToken}* nao foi encontrado ou ja foi usado.

Abra o painel em sonnarjobs.com.br, va em Vagas e gere um novo codigo.`
        : `*Nao foi possivel conectar agora*

Tente novamente em instantes. Se o problema persistir, fale com o suporte.`
      await sendWithDelay(socket, remoteJid, { text: msg })
      return
    }

    // Mensagem e comportamento dependem do plano (free / pro / plus).
    const plan = (result.plan || "free").toLowerCase()

    if (plan === "plus") {
      await sendWithDelay(socket, remoteJid, {
        text: `*WhatsApp conectado!*

Ola, ${result.name}! Seu WhatsApp foi vinculado a sua conta Sonnar (plano Plus).

Voce vai comecar a receber vagas personalizadas do seu perfil aqui. Fique atento as notificacoes!`
      })

      // Plano Plus: primeira busca de vagas personalizadas em background.
      triggerVipSearch(lid, result.filters)
        .then((r) => infoLog(`[PAREAMENTO] Busca inicial para ${lid}: ${r?.jobsSent ?? 0} vagas enviadas`))
        .catch((err) => errorLog(`[PAREAMENTO] Erro na busca inicial: ${err.message}`))
    } else if (plan === "pro") {
      // Plano Pro: recebe vagas pelo grupo, nao no privado.
      await sendWithDelay(socket, remoteJid, {
        text: `*WhatsApp conectado!*

Ola, ${result.name}! Seu WhatsApp foi vinculado a sua conta Sonnar (plano Pro).

As vagas chegam pelo grupo exclusivo. Para receber vagas personalizadas no privado, faca upgrade para o plano Plus no painel.`
      })
    } else {
      await sendWithDelay(socket, remoteJid, {
        text: `*WhatsApp conectado!*

Ola, ${result.name}! Seu WhatsApp foi vinculado a sua conta Sonnar.

Seu plano atual (Free) nao inclui envio de vagas. Conheca os planos Pro e Plus no painel.`
      })
    }

    // Reseta o estado da conversa.
    conversationStates.set(remoteJid, {
      state: "menu",
      timestamp: Date.now(),
      budgetData: {},
      previousState: ""
    })
  } catch (error) {
    errorLog(`[HANDLE PAIRING] Erro: ${error.message}`)
    errorLog(`[HANDLE PAIRING] Stack: ${error.stack}`)
  }
}

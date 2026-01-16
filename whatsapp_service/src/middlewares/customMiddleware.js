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
import { delay } from "baileys"
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
  PREFIX
} from "../config.js"
import { extractDataFromMessage } from "../utils/index.js"
import { errorLog, infoLog } from "../utils/logger.js"

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
Digite o numero da opcao desejada
_ou digite "voltar" para retornar_`
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

    // Ignora mensagens do próprio bot em QUALQUER contexto (privado ou grupo)
    const botLidClean = BOT_LID.replace("@lid", "").replace("@s.whatsapp.net", "")
    const userLidClean = userLid?.replace("@lid", "").replace("@s.whatsapp.net", "") || ""

    if (userLidClean === botLidClean || remoteJid === BOT_LID || remoteJid === BOT_LID.replace("@lid", "@s.whatsapp.net")) {
      return
    }

    // Só processa mensagens privadas (não grupos)
    if (!isPrivateMessage(remoteJid)) {
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

    // Ignora mensagens #auto-command (mídia sem texto/caption)
    // Essas mensagens são placeholders gerados automaticamente e não devem ser processadas como opções de menu
    if (fullMessage === "#auto-command") {
      return
    }

    infoLog(`[CUSTOM MIDDLEWARE] Mensagem privada recebida: "${fullMessage?.substring(0, 50)}${fullMessage?.length > 50 ? "..." : ""}"`)

    // Processa estados que aceitam mídia
    const userId = remoteJid
    let userState = conversationStates.get(userId)
    const messageTextRaw = fullMessage?.trim() || ""
    const messageText = messageTextRaw.toLowerCase()

    if (userState && (userState.state === "awaiting_payment_receipt_group" || userState.state === "awaiting_payment_receipt_private")) {
      // Se estiver aguardando comprovante, processa a mensagem com webMessage completo

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

    userState.state = "awaiting_payment_private"
    conversationStates.set(userId, userState)
    await sendWithDelay(socket, remoteJid, { text: getPaymentPrivateMessage() })
  } catch (error) {
    errorLog(`[HANDLE PLAN EMAIL] Erro: ${error.message}`)
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
    switch (messageText) {
      case "voltar":
        conversationStates.set(userId, { state: "sonar_menu", timestamp: Date.now() })
        await sendWithDelay(socket, remoteJid, { text: getSonarMenu() })
        break

      case "pago": {
        const userState = conversationStates.get(userId)
        conversationStates.set(userId, {
          state: "awaiting_payment_receipt_private",
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

    if (webMessage?.message?.imageMessage || webMessage?.message?.documentMessage) {
      const clientNumber = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "")
      const leadData = userState?.leadData || {}

      for (const targetNumber of PAYMENT_NOTIFICATION_NUMBERS) {
        try {
          await sendWithDelay(socket, targetNumber, {
            image: webMessage.message.imageMessage || webMessage.message.documentMessage,
            caption: `*Comprovante de Pagamento - Grupo de Vagas*

*Cliente:* ${clientNumber}
*Data:* ${new Date().toLocaleString("pt-BR")}`
          })

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
 */
async function handlePaymentReceiptPrivate(socket, remoteJid, messageText, userId, webMessage) {
  try {
    const userState = conversationStates.get(userId)

    if (messageText === "voltar") {
      conversationStates.set(userId, { state: "awaiting_payment_private", timestamp: Date.now(), leadData: userState?.leadData || {} })
      await sendWithDelay(socket, remoteJid, { text: getPaymentPrivateMessage() })
      return
    }

    if (webMessage?.message?.imageMessage || webMessage?.message?.documentMessage) {
      const clientNumber = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "")
      const leadData = userState?.leadData || {}

      for (const targetNumber of PAYMENT_NOTIFICATION_NUMBERS) {
        try {
          await sendWithDelay(socket, targetNumber, {
            image: webMessage.message.imageMessage || webMessage.message.documentMessage,
            caption: `*Comprovante de Pagamento - Vagas Personalizadas*

*Cliente:* ${clientNumber}
*Data:* ${new Date().toLocaleString("pt-BR")}`
          })

          await sendWithDelay(socket, targetNumber, {
            text: getPaymentNotificationPrivate(clientNumber, leadData)
          })

          infoLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Comprovante enviado para ${targetNumber}`)
        } catch (error) {
          errorLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Erro ao enviar para ${targetNumber}: ${error.message}`)
        }
      }

      await sendWithDelay(socket, remoteJid, { text: getPrivateAccessMessage() })
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() })
    } else {
      await sendWithDelay(socket, remoteJid, { text: getPaymentReceiptRequestMessage() })
    }
  } catch (error) {
    errorLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Erro: ${error.message}`)
    errorLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Stack: ${error.stack}`)
  }
}

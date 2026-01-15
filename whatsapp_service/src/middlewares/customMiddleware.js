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
import { delay } from "baileys";
import {
  BOT_EMOJI,
  ELKYS_NUMBER,
  ORCAMENTO_NUMBERS,
  CALENDAR_LINK,
  PAYMENT_LINK_GROUP,
  PAYMENT_LINK_PRIVATE,
  JOB_GROUP_LINK,
  TIMEOUT_IN_MILLISECONDS_BY_EVENT,
} from "../config.js";
import { extractDataFromMessage } from "../utils/index.js";

// Estado das conversas em memória
// Estrutura: { "userId": { state: "menu" | "sonar_menu" | "awaiting_payment_group" | "awaiting_payment_private", timestamp: Date } }
const conversationStates = new Map();

// Limpa estados antigos (mais de 30 minutos)
function cleanOldStates() {
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  for (const [userId, data] of conversationStates.entries()) {
    if (data.timestamp < thirtyMinutesAgo) {
      conversationStates.delete(userId);
    }
  }
}

// Executa limpeza a cada 10 minutos
setInterval(cleanOldStates, 10 * 60 * 1000);

/**
 * Verifica se a mensagem é do número da Elkys (privado)
 */
function isElkysPrivateMessage(remoteJid) {
  return remoteJid === ELKYS_NUMBER;
}

/**
 * Envia mensagem com delay para evitar banimento
 */
async function sendWithDelay(socket, jid, content) {
  await delay(TIMEOUT_IN_MILLISECONDS_BY_EVENT);
  return await socket.sendMessage(jid, content);
}

/**
 * Menu principal da Elkys
 */
function getMainMenu() {
  return `${BOT_EMOJI} *Olá! Bem-vindo(a) à Elkys!*

Escolha uma opção digitando o número correspondente:

*1️⃣ Solicitar Orçamento*
Fale com nossa equipe para um orçamento personalizado

*2️⃣ Agendar Horário*
Agende uma reunião conosco

*3️⃣ Sonar Bot*
Acesse vagas de emprego exclusivas

━━━━━━━━━━━━━━━━━━━━━
Digite *1*, *2* ou *3* para continuar`;
}

/**
 * Submenu do Sonar Bot
 */
function getSonarMenu() {
  return `${BOT_EMOJI} *Sonar Bot - Vagas de Emprego*

Escolha como deseja receber as vagas:

*1️⃣ Acesso ao Grupo de Vagas*
Tenha acesso ao nosso grupo exclusivo com vagas diárias

*2️⃣ Vagas Personalizadas no Privado*
Receba vagas filtradas de acordo com seu perfil diretamente no seu WhatsApp

━━━━━━━━━━━━━━━━━━━━━
Digite *1* ou *2* para continuar
Digite *0* para voltar ao menu principal`;
}

/**
 * Mensagem de solicitação de orçamento enviada para a equipe
 */
function getOrcamentoNotification(userNumber) {
  return `${BOT_EMOJI} *🔔 Nova Solicitação de Orçamento!*

Um novo cliente solicitou orçamento.

📱 *Número do cliente:* ${userNumber}
📅 *Data/Hora:* ${new Date().toLocaleString("pt-BR")}

Por favor, entre em contato o mais breve possível.`;
}

/**
 * Mensagem de confirmação para o cliente após solicitar orçamento
 */
function getOrcamentoConfirmation() {
  return `${BOT_EMOJI} *✅ Solicitação Enviada!*

Sua solicitação de orçamento foi enviada com sucesso.

Nossa equipe entrará em contato em breve!

━━━━━━━━━━━━━━━━━━━━━
Digite *menu* para voltar ao menu principal`;
}

/**
 * Mensagem com link do calendário
 */
function getCalendarMessage() {
  return `${BOT_EMOJI} *📅 Agende seu Horário*

Clique no link abaixo para agendar uma reunião conosco:

🔗 ${CALENDAR_LINK}

Escolha o melhor horário disponível para você!

━━━━━━━━━━━━━━━━━━━━━
Digite *menu* para voltar ao menu principal`;
}

/**
 * Mensagem de pagamento para acesso ao grupo
 */
function getPaymentGroupMessage() {
  return `${BOT_EMOJI} *💼 Acesso ao Grupo de Vagas*

Para ter acesso ao nosso grupo exclusivo de vagas, efetue o pagamento:

💳 *Link de pagamento:*
🔗 ${PAYMENT_LINK_GROUP}

*Ou via PIX:*
📱 CNPJ: *64.095.868/0001-03*

Após a confirmação do pagamento, você receberá automaticamente o link para entrar no grupo!

━━━━━━━━━━━━━━━━━━━━━
Digite *pago* após efetuar o pagamento
Digite *0* para voltar ao menu anterior
Digite *menu* para voltar ao menu principal`;
}

/**
 * Mensagem de pagamento para vagas privadas
 */
function getPaymentPrivateMessage() {
  return `${BOT_EMOJI} *💼 Vagas Personalizadas no Privado*

Para receber vagas personalizadas diretamente no seu WhatsApp, efetue o pagamento:

💳 *Link de pagamento:*
🔗 ${PAYMENT_LINK_PRIVATE}

*Ou via PIX:*
📱 CNPJ: *64.095.868/0001-03*

Após a confirmação do pagamento, você começará a receber vagas filtradas de acordo com seu perfil!

━━━━━━━━━━━━━━━━━━━━━
Digite *pago* após efetuar o pagamento
Digite *0* para voltar ao menu anterior
Digite *menu* para voltar ao menu principal`;
}

/**
 * Mensagem após confirmação de pagamento do grupo
 */
function getGroupAccessMessage() {
  return `${BOT_EMOJI} *✅ Pagamento Confirmado!*

Obrigado pela sua assinatura!

Acesse nosso grupo exclusivo de vagas através do link abaixo:

🔗 ${JOB_GROUP_LINK}

Boas oportunidades! 🚀

━━━━━━━━━━━━━━━━━━━━━
Digite *menu* para voltar ao menu principal`;
}

/**
 * Mensagem após confirmação de pagamento das vagas privadas
 */
function getPrivateAccessMessage() {
  return `${BOT_EMOJI} *✅ Pagamento Confirmado!*

Obrigado pela sua assinatura!

A partir de agora você receberá vagas personalizadas diretamente aqui no seu WhatsApp.

Fique atento às notificações! 🚀

━━━━━━━━━━━━━━━━━━━━━
Digite *menu* para voltar ao menu principal`;
}

/**
 * Mensagem de opção inválida
 */
function getInvalidOptionMessage() {
  return `${BOT_EMOJI} *⚠️ Opção inválida!*

Por favor, digite uma das opções disponíveis.

Digite *menu* para ver o menu principal.`;
}

export async function customMiddleware({
  socket,
  webMessage,
  type,
  commonFunctions,
  action,
  data,
}) {
  // Só processa mensagens de texto
  if (type !== "message") {
    return;
  }

  const { fullMessage, remoteJid, userLid } = extractDataFromMessage(webMessage);

  // Só processa mensagens do número da Elkys (privado)
  if (!isElkysPrivateMessage(remoteJid)) {
    return;
  }

  const messageText = fullMessage?.trim().toLowerCase() || "";
  const userId = remoteJid;

  // Obtém o estado atual da conversa
  let userState = conversationStates.get(userId);

  // Se o usuário digitar "menu", volta para o menu principal
  if (messageText === "menu") {
    conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
    await sendWithDelay(socket, remoteJid, { text: getMainMenu() });
    return;
  }

  // Se não tem estado ou é primeira mensagem, mostra menu principal
  if (!userState) {
    conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
    await sendWithDelay(socket, remoteJid, { text: getMainMenu() });
    return;
  }

  // Atualiza timestamp
  userState.timestamp = Date.now();

  // Processa de acordo com o estado atual
  switch (userState.state) {
    case "menu":
      await handleMainMenu(socket, remoteJid, messageText, userId);
      break;

    case "sonar_menu":
      await handleSonarMenu(socket, remoteJid, messageText, userId);
      break;

    case "awaiting_payment_group":
      await handlePaymentGroup(socket, remoteJid, messageText, userId);
      break;

    case "awaiting_payment_private":
      await handlePaymentPrivate(socket, remoteJid, messageText, userId);
      break;

    default:
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
      await sendWithDelay(socket, remoteJid, { text: getMainMenu() });
  }
}

/**
 * Processa opções do menu principal
 */
async function handleMainMenu(socket, remoteJid, messageText, userId) {
  switch (messageText) {
    case "1":
      // Solicitar Orçamento - Notifica os números configurados
      const userNumber = remoteJid.replace("@s.whatsapp.net", "");

      // Envia notificação para todos os números configurados
      for (const number of ORCAMENTO_NUMBERS) {
        try {
          await sendWithDelay(socket, number, {
            text: getOrcamentoNotification(userNumber),
          });
        } catch (error) {
          console.error(`Erro ao enviar notificação para ${number}:`, error.message);
        }
      }

      // Confirma para o cliente
      await sendWithDelay(socket, remoteJid, { text: getOrcamentoConfirmation() });
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
      break;

    case "2":
      // Agendar Horário - Envia link do Google Calendar
      await sendWithDelay(socket, remoteJid, { text: getCalendarMessage() });
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
      break;

    case "3":
      // Sonar Bot - Mostra submenu
      conversationStates.set(userId, { state: "sonar_menu", timestamp: Date.now() });
      await sendWithDelay(socket, remoteJid, { text: getSonarMenu() });
      break;

    default:
      await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() });
  }
}

/**
 * Processa opções do submenu Sonar Bot
 */
async function handleSonarMenu(socket, remoteJid, messageText, userId) {
  switch (messageText) {
    case "0":
      // Volta ao menu principal
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
      await sendWithDelay(socket, remoteJid, { text: getMainMenu() });
      break;

    case "1":
      // Opção 1 - Link de acesso ao grupo (pagamento)
      conversationStates.set(userId, { state: "awaiting_payment_group", timestamp: Date.now() });
      await sendWithDelay(socket, remoteJid, { text: getPaymentGroupMessage() });
      break;

    case "2":
      // Opção 2 - Vagas personalizadas no privado (pagamento)
      conversationStates.set(userId, { state: "awaiting_payment_private", timestamp: Date.now() });
      await sendWithDelay(socket, remoteJid, { text: getPaymentPrivateMessage() });
      break;

    default:
      await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() });
  }
}

/**
 * Processa confirmação de pagamento para acesso ao grupo
 */
async function handlePaymentGroup(socket, remoteJid, messageText, userId) {
  switch (messageText) {
    case "0":
      // Volta ao submenu Sonar
      conversationStates.set(userId, { state: "sonar_menu", timestamp: Date.now() });
      await sendWithDelay(socket, remoteJid, { text: getSonarMenu() });
      break;

    case "pago":
      // Confirmação de pagamento - envia link do grupo
      await sendWithDelay(socket, remoteJid, { text: getGroupAccessMessage() });
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
      break;

    default:
      await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() });
  }
}

/**
 * Processa confirmação de pagamento para vagas privadas
 */
async function handlePaymentPrivate(socket, remoteJid, messageText, userId) {
  switch (messageText) {
    case "0":
      // Volta ao submenu Sonar
      conversationStates.set(userId, { state: "sonar_menu", timestamp: Date.now() });
      await sendWithDelay(socket, remoteJid, { text: getSonarMenu() });
      break;

    case "pago":
      // Confirmação de pagamento - confirma ativação
      await sendWithDelay(socket, remoteJid, { text: getPrivateAccessMessage() });
      // TODO: Aqui você pode adicionar lógica para registrar o usuário no banco de dados
      // para receber vagas personalizadas
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
      break;

    default:
      await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() });
  }
}

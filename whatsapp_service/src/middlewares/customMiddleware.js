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
  BOT_LID,
  ORCAMENTO_NUMBERS,
  PAYMENT_NOTIFICATION_NUMBERS,
  CALENDAR_LINK,
  PAYMENT_LINK_GROUP,
  PAYMENT_LINK_PRIVATE,
  JOB_GROUP_LINK,
  TIMEOUT_IN_MILLISECONDS_BY_EVENT,
  PREFIX,
} from "../config.js";
import { extractDataFromMessage } from "../utils/index.js";
import { errorLog, infoLog } from "../utils/logger.js";

// Timeout de 5 minutos em milissegundos
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

// Estado das conversas em memória
// Estrutura: { "userId": { state: "menu" | "sonar_menu" | "awaiting_budget_name" | "awaiting_budget_description" | "awaiting_payment_group" | "awaiting_payment_private", timestamp: Date, budgetData: { name: "", description: "" }, previousState: "", timeout: timerId } }
const conversationStates = new Map();
const userTimeouts = new Map();

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
 * Configura timeout para a sessão do usuário
 */
function setupSessionTimeout(socket, userId, remoteJid) {
  // Limpa timeout anterior se existir
  if (userTimeouts.has(userId)) {
    clearTimeout(userTimeouts.get(userId));
  }

  // Cria novo timeout
  const timeout = setTimeout(async () => {
    try {
      infoLog(`[SESSION TIMEOUT] Timeout de 5 minutos atingido para ${userId}`);
      
      // Envia mensagem de encerramento
      await sendWithDelay(socket, remoteJid, { 
        text: getSessionTimeoutMessage() 
      });

      // Reseta o estado para menu
      conversationStates.set(userId, { 
        state: "menu", 
        timestamp: Date.now(),
        budgetData: {},
        previousState: ""
      });

      // Remove o timeout do mapa
      userTimeouts.delete(userId);
      
    } catch (error) {
      errorLog(`[SESSION TIMEOUT] Erro ao processar timeout: ${error.message}`);
    }
  }, SESSION_TIMEOUT_MS);

  userTimeouts.set(userId, timeout);
}

/**
 * Atualiza o timestamp da sessão (reseta timeout)
 */
function updateSessionTimeout(socket, userId, remoteJid) {
  setupSessionTimeout(socket, userId, remoteJid);
}

/**
 * Verifica se a mensagem é privada (não é grupo)
 */
function isPrivateMessage(remoteJid) {
  // Grupos terminam com @g.us
  // Mensagens privadas podem terminar com @s.whatsapp.net ou @lid
  return !remoteJid?.endsWith("@g.us");
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
  return `*ELKYS*

_Software, Automação e Produtos Digitais para escalar negócios._

_👋 Como podemos te ajudar hoje?_

💼 *1* - _Orçamento: Receba uma proposta sob medida._
📅 *2* - _Reunião: Agende um horário com nosso time._
💼 *3* - _Vagas: Oportunidades e conteúdos exclusivos._
🤝 *4* - _Quer se tornar um parceiro_

──────────────────
Digite *1*, *2*, *3* ou *4*`;
}

/**
 * Submenu do Sonar Bot
 */
function getSonarMenu() {
  return `*Vagas de Emprego*

_Escolha como deseja receber as oportunidades:_

📢 *1* • Grupo de Vagas
_Acesso exclusivo a vagas diárias_

📱 *2* • Vagas Personalizadas
_Receba filtradas por seu perfil_

──────────────────
Digite *1* ou *2*
Digite *0* para voltar`;
}

/**
 * Mensagem para parceiros
 */
function getPartnerMessage() {
  return `*Programa de Parceria*

_Interessado em fazer parte do nosso time?_

Clique no link abaixo para conversar com nosso time de parcerias:

https://wa.me/553198478235

──────────────────
Digite *menu* para voltar`;
}

/**
 * Mensagem solicitando nome para orçamento
 */
function getBudgetNameMessage() {
  return `💼 *Solicitar Orçamento*

_Para continuar, qual é o seu nome?_

──────────────────
Digite seu nome
_ou digite "voltar" para retornar ao menu_`;
}

/**
 * Mensagem solicitando descrição para orçamento
 */
function getBudgetDescriptionMessage(name) {
  return `*Ótimo, ${name}!*

_Agora, fale um pouco sobre o que se trata seu projeto. Descreva brevemente o que você precisa:_

_Ex: Sistema de vendas online, App mobile, Automação de processos, etc._

──────────────────
Digite a descrição
_ou digite "voltar" para retornar ao passo anterior_`;
}

/**
 * Mensagem de confirmação de orçamento enviado
 */
function getBudgetConfirmationMessage() {
  return `✓ *Obrigado!*

Suas informações foram enviadas com sucesso.

Nossa equipe analisará seu projeto e entrará em contato em breve!

──────────────────
Digite *menu* para voltar`;
}

/**
 * Mensagem de solicitação de orçamento enviada para a equipe
 */
function getOrcamentoNotification(userNumber) {
  return `*Um novo cliente solicitou um orçamento*

_Cliente:_ ${userNumber}
_Data:_ ${new Date().toLocaleString("pt-BR")}

Entrar em contato assim que possível.`;
}

/**
 * Mensagem com detalhes completos do orçamento
 */
function getBudgetDetailsMessage(budgetData) {
  return `*Novo Orçamento Solicitado*

*Nome do Cliente:* ${budgetData.name}
*Número:* ${budgetData.clientNumber}
*Data:* ${new Date().toLocaleString("pt-BR")}

*Descrição do Projeto:*
${budgetData.description}

──────────────────
_Favor, entrar em contato com o cliente em breve._`;
}

/**
 * Mensagem de confirmação para o cliente após solicitar orçamento
 */
function getOrcamentoConfirmation() {
  return `*Solicitação Enviada*

Obrigado! Nossa equipe entrará em contato em breve.

──────────────────
Digite *menu* para voltar`;
}

/**
 * Mensagem com link do calendário
 */
function getCalendarMessage() {
  return `📅 *Agendar Reunião*

_Clique no link para escolher o melhor horário:_

${CALENDAR_LINK}

──────────────────
Digite *menu* para voltar`;
}

/**
 * Mensagem de pagamento para acesso ao grupo
 */
function getPaymentGroupMessage() {
  return `📢 *Acesso ao Grupo de Vagas*

_Efetue o pagamento para acesso exclusivo:_

*Cartão/Stripe:*
${PAYMENT_LINK_GROUP}

*PIX:*
CNPJ: 64.095.868/0001-03

_Após confirmação, você receberá o acesso._

──────────────────
Digite *pago* após pagamento
Digite *0* para voltar
Digite *menu* para menu principal`;
}

/**
 * Mensagem de pagamento para vagas privadas
 */
function getPaymentPrivateMessage() {
  return `📱 *Vagas Personalizadas*

_Receba oportunidades filtradas por seu perfil:_

*Cartão/Stripe:*
${PAYMENT_LINK_PRIVATE}

*PIX:*
CNPJ: 64.095.868/0001-03

_Após confirmação, você receberá vagas personalizadas._

──────────────────
Digite *pago* após pagamento
Digite *0* para voltar
Digite *menu* para menu principal`;
}

/**
 * Mensagem após confirmação de pagamento do grupo
 */
function getGroupAccessMessage() {
  return `✓ *Bem-vindo!*

Obrigado pela sua assinatura.

_Acesse o grupo exclusivo:_
${JOB_GROUP_LINK}

Boas oportunidades!

──────────────────
Digite *menu* para voltar`;
}

/**
 * Mensagem após confirmação de pagamento das vagas privadas
 */
function getPrivateAccessMessage() {
  return `✓ *Bem-vindo!*

Obrigado pela sua assinatura.

Você começará a receber vagas personalizadas aqui no WhatsApp.

_Fique atento às notificações._

──────────────────
Digite *menu* para voltar`;
}

/**
 * Mensagem de opção inválida
 */
function getInvalidOptionMessage() {
  return `*Opção inválida*

_Por favor, selecione uma das opções disponíveis._

*Opções válidas:* 1, 2, 3 ou 4

Digite *menu* para ver novamente as opções.`;
}

/**
 * Mensagem de timeout de sessão
 */
function getSessionTimeoutMessage() {
  return `*Sessão Encerrada*

_Devido à demora na resposta, estamos encerrando seu atendimento._

Para iniciar um novo atendimento, digite *menu*.

──────────────────
Estaremos felizes em ajudá-lo novamente!`;
}

/**
 * Notificação de pagamento - Grupo de Vagas
 */
function getPaymentNotificationGroup(clientNumber) {
  return `💰 *Notificação de Pagamento*

_Usuário pagou para o Acesso ao grupo de vagas_

*Cliente:* ${clientNumber}
*Data:* ${new Date().toLocaleString("pt-BR")}

──────────────────
_Ative o acesso no grupo!_`;
}

/**
 * Notificação de pagamento - Vagas Personalizadas
 */
function getPaymentNotificationPrivate(clientNumber) {
  return `💰 *Notificação de Pagamento*

_Usuário pagou para o Acesso vagas personalizadas_

*Cliente:* ${clientNumber}
*Data:* ${new Date().toLocaleString("pt-BR")}

──────────────────
_Configure o acesso às vagas do cliente!_`;
}

/**
 * Solicita comprovante de pagamento
 */
function getPaymentReceiptRequestMessage() {
  return `*Comprovante de Pagamento*

_Para validar sua transação, envie o comprovante de pagamento._

_Você pode enviar:_
• Screenshot do pagamento
• Comprovante da transferência PIX
• Qualquer imagem que comprove o pagamento

──────────────────
_Digite "0" para voltar_`;
}

export async function customMiddleware({
  socket,
  webMessage,
  type,
  commonFunctions,
  action,
  data,
}) {
  try {
    // Processa mensagens de texto e mídia
    if (type !== "message") {
      return;
    }

    const { fullMessage, remoteJid, userLid, prefix } = extractDataFromMessage(webMessage);

    // Ignora mensagens do próprio bot em QUALQUER contexto (privado ou grupo)
    const botLidClean = BOT_LID.replace("@lid", "").replace("@s.whatsapp.net", "");
    const userLidClean = userLid?.replace("@lid", "").replace("@s.whatsapp.net", "") || "";
    
    if (userLidClean === botLidClean || remoteJid === BOT_LID || remoteJid === BOT_LID.replace("@lid", "@s.whatsapp.net")) {
      return;
    }

    // Só processa mensagens privadas (não grupos)
    if (!isPrivateMessage(remoteJid)) {
      return;
    }

    // Log apenas para mensagens privadas e comandos
    const isCommand = prefix === PREFIX;
    if (isCommand) {
      infoLog(`[CUSTOM MIDDLEWARE] Comando recebido: ${fullMessage}`);
    }

    // Se for um comando (começa com prefixo configurado), deixa passar sem interceptar
    if (isCommand) {
      return;
    }

    infoLog(`[CUSTOM MIDDLEWARE] Mensagem privada recebida: "${fullMessage?.substring(0, 50)}${fullMessage?.length > 50 ? "..." : ""}"`);

    // Processa estados que aceitam mídia
    const userId = remoteJid;
    let userState = conversationStates.get(userId);
    const messageText = fullMessage?.trim().toLowerCase() || "";
    
    if (userState && (userState.state === "awaiting_payment_receipt_group" || userState.state === "awaiting_payment_receipt_private")) {
      // Se estiver aguardando comprovante, processa a mensagem com webMessage completo
      
      // Atualiza timeout
      updateSessionTimeout(socket, userId, remoteJid);
      userState.timestamp = Date.now();
      
      if (userState.state === "awaiting_payment_receipt_group") {
        await handlePaymentReceiptGroup(socket, remoteJid, messageText, userId, webMessage);
      } else if (userState.state === "awaiting_payment_receipt_private") {
        await handlePaymentReceiptPrivate(socket, remoteJid, messageText, userId, webMessage);
      }
      return;
    }

    // Obtém o estado atual da conversa (verificado novamente para os demais casos)
    userState = conversationStates.get(userId);

    // Se o usuário digitar "menu", volta para o menu principal
    if (messageText === "menu") {
      conversationStates.set(userId, { state: "menu", timestamp: Date.now(), budgetData: {}, previousState: "" });
      await sendWithDelay(socket, remoteJid, { text: getMainMenu() });
      updateSessionTimeout(socket, userId, remoteJid);
      return;
    }

    // Se não tem estado ou é primeira mensagem, mostra menu principal
    if (!userState) {
      conversationStates.set(userId, { state: "menu", timestamp: Date.now(), budgetData: {}, previousState: "" });
      await sendWithDelay(socket, remoteJid, { text: getMainMenu() });
      updateSessionTimeout(socket, userId, remoteJid);
      return;
    }

    // Atualiza timeout (reseta o timer)
    updateSessionTimeout(socket, userId, remoteJid);

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

      case "awaiting_budget_name":
        await handleBudgetName(socket, remoteJid, messageText, userId);
        break;

      case "awaiting_budget_description":
        await handleBudgetDescription(socket, remoteJid, messageText, userId);
        break;

      case "awaiting_payment_group":
        await handlePaymentGroup(socket, remoteJid, messageText, userId);
        break;

      case "awaiting_payment_private":
        await handlePaymentPrivate(socket, remoteJid, messageText, userId);
        break;

      case "awaiting_payment_receipt_group":
        await handlePaymentReceiptGroup(socket, remoteJid, messageText, userId, webMessage);
        break;

      case "awaiting_payment_receipt_private":
        await handlePaymentReceiptPrivate(socket, remoteJid, messageText, userId, webMessage);
        break;

      default:
        conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
        await sendWithDelay(socket, remoteJid, { text: getMainMenu() });
    }
  } catch (error) {
    errorLog(`[CUSTOM MIDDLEWARE] Erro no middleware customizado: ${error.message}`);
    errorLog(`[CUSTOM MIDDLEWARE] Stack: ${error.stack}`);
  }
}

/**
 * Processa o nome do orçamento
 */
async function handleBudgetName(socket, remoteJid, messageText, userId) {
  try {
    // Se digitar "voltar", volta para o menu principal
    if (messageText === "voltar") {
      const userState = conversationStates.get(userId);
      userState.state = "menu";
      userState.timestamp = Date.now();
      userState.budgetData = {};
      userState.previousState = "";
      conversationStates.set(userId, userState);
      
      infoLog(`[HANDLE BUDGET NAME] Usuário voltou ao menu`);
      await sendWithDelay(socket, remoteJid, { text: getMainMenu() });
      return;
    }

    if (!messageText || messageText.trim().length === 0) {
      infoLog(`[HANDLE BUDGET NAME] Nome vazio recebido`);
      await sendWithDelay(socket, remoteJid, { text: "Por favor, digite um nome válido." });
      return;
    }

    // Armazena o nome e muda para o estado de descrição
    let userState = conversationStates.get(userId);
    userState.budgetData.name = messageText.trim();
    userState.state = "awaiting_budget_description";
    userState.timestamp = Date.now();
    conversationStates.set(userId, userState);

    infoLog(`[HANDLE BUDGET NAME] Nome registrado: ${messageText}`);
    await sendWithDelay(socket, remoteJid, { text: getBudgetDescriptionMessage(messageText.trim()) });
  } catch (error) {
    errorLog(`[HANDLE BUDGET NAME] Erro: ${error.message}`);
    errorLog(`[HANDLE BUDGET NAME] Stack: ${error.stack}`);
  }
}

/**
 * Processa a descrição do orçamento
 */
async function handleBudgetDescription(socket, remoteJid, messageText, userId) {
  try {
    // Se digitar "voltar", volta para o passo anterior (nome)
    if (messageText === "voltar") {
      const userState = conversationStates.get(userId);
      userState.state = "awaiting_budget_name";
      userState.timestamp = Date.now();
      conversationStates.set(userId, userState);
      
      infoLog(`[HANDLE BUDGET DESCRIPTION] Usuário voltou ao passo anterior`);
      const name = userState.budgetData.name || "";
      if (name) {
        // Se já tinha nome, volta para a descrição
        await sendWithDelay(socket, remoteJid, { text: getBudgetDescriptionMessage(name) });
      } else {
        // Se não tinha nome, volta para pedir nome
        await sendWithDelay(socket, remoteJid, { text: getBudgetNameMessage() });
      }
      return;
    }

    if (!messageText || messageText.trim().length === 0) {
      infoLog(`[HANDLE BUDGET DESCRIPTION] Descrição vazia recebida`);
      await sendWithDelay(socket, remoteJid, { text: "Por favor, digite uma descrição válida." });
      return;
    }

    // Obtém os dados armazenados
    let userState = conversationStates.get(userId);
    userState.budgetData.description = messageText.trim();
    userState.state = "menu";
    userState.timestamp = Date.now();
    conversationStates.set(userId, userState);

    const budgetData = userState.budgetData;

    infoLog(`[HANDLE BUDGET DESCRIPTION] Orçamento completo: ${JSON.stringify(budgetData)}`);

    // Envia para todos os números configurados em ORCAMENTO_NUMBERS
    for (const targetNumber of ORCAMENTO_NUMBERS) {
      try {
        await sendWithDelay(socket, targetNumber, {
          text: getBudgetDetailsMessage(budgetData),
        });
        infoLog(`[HANDLE BUDGET DESCRIPTION] Orçamento enviado para ${targetNumber}`);
      } catch (error) {
        errorLog(`[HANDLE BUDGET DESCRIPTION] Erro ao enviar orçamento para ${targetNumber}: ${error.message}`);
      }
    }

    // Confirma para o cliente
    await sendWithDelay(socket, remoteJid, { text: getBudgetConfirmationMessage() });
  } catch (error) {
    errorLog(`[HANDLE BUDGET DESCRIPTION] Erro: ${error.message}`);
    errorLog(`[HANDLE BUDGET DESCRIPTION] Stack: ${error.stack}`);
  }
}

/**
 * Processa opções do menu principal
 */
async function handleMainMenu(socket, remoteJid, messageText, userId) {
  try {
    // Validação de entrada: apenas números de 1 a 4 são válidos
    const validOptions = ["1", "2", "3", "4"];
    
    if (!validOptions.includes(messageText)) {
      infoLog(`[HANDLE MAIN MENU] Opção inválida: "${messageText}". Enviando mensagem de erro.`);
      await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() });
      return;
    }

    switch (messageText) {
      case "1":
        // Solicitar Orçamento - Pedir nome do cliente
        conversationStates.set(userId, { 
          state: "awaiting_budget_name", 
          timestamp: Date.now(),
          budgetData: { 
            name: "", 
            description: "",
            clientNumber: remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "")
          } 
        });
        await sendWithDelay(socket, remoteJid, { text: getBudgetNameMessage() });
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

      case "4":
        // Parceiros - Redireciona para o número de parceiros
        await sendWithDelay(socket, remoteJid, { text: getPartnerMessage() });
        conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
        break;

      default:
        await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() });
    }
  } catch (error) {
    errorLog(`[HANDLE MAIN MENU] Erro: ${error.message}`);
    errorLog(`[HANDLE MAIN MENU] Stack: ${error.stack}`);
  }
}

/**
 * Processa opções do submenu Sonar Bot
 */
async function handleSonarMenu(socket, remoteJid, messageText, userId) {
  try {
    // Validação de entrada: apenas 0, 1 ou 2 são válidos
    const validOptions = ["0", "1", "2"];
    
    if (!validOptions.includes(messageText)) {
      infoLog(`[HANDLE SONAR MENU] Opção inválida: "${messageText}". Enviando mensagem de erro.`);
      await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() });
      return;
    }

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
  } catch (error) {
    errorLog(`[HANDLE SONAR MENU] Erro: ${error.message}`);
    errorLog(`[HANDLE SONAR MENU] Stack: ${error.stack}`);
  }
}

/**
 * Processa confirmação de pagamento para acesso ao grupo
 */
async function handlePaymentGroup(socket, remoteJid, messageText, userId) {
  try {
    switch (messageText) {
      case "0":
        // Volta ao submenu Sonar
        conversationStates.set(userId, { state: "sonar_menu", timestamp: Date.now() });
        await sendWithDelay(socket, remoteJid, { text: getSonarMenu() });
        break;

      case "pago":
        // Solicita comprovante de pagamento
        conversationStates.set(userId, { state: "awaiting_payment_receipt_group", timestamp: Date.now(), clientNumber: remoteJid });
        await sendWithDelay(socket, remoteJid, { text: getPaymentReceiptRequestMessage() });
        break;

      default:
        await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() });
    }
  } catch (error) {
    errorLog(`[HANDLE PAYMENT GROUP] Erro: ${error.message}`);
    errorLog(`[HANDLE PAYMENT GROUP] Stack: ${error.stack}`);
  }
}

/**
 * Processa confirmação de pagamento para vagas privadas
 */
async function handlePaymentPrivate(socket, remoteJid, messageText, userId) {
  try {
    switch (messageText) {
      case "0":
        // Volta ao submenu Sonar
        conversationStates.set(userId, { state: "sonar_menu", timestamp: Date.now() });
        await sendWithDelay(socket, remoteJid, { text: getSonarMenu() });
        break;

      case "pago":
        // Solicita comprovante de pagamento
        conversationStates.set(userId, { state: "awaiting_payment_receipt_private", timestamp: Date.now(), clientNumber: remoteJid });
        await sendWithDelay(socket, remoteJid, { text: getPaymentReceiptRequestMessage() });
        break;

      default:
        await sendWithDelay(socket, remoteJid, { text: getInvalidOptionMessage() });
    }
  } catch (error) {
    errorLog(`[HANDLE PAYMENT PRIVATE] Erro: ${error.message}`);
    errorLog(`[HANDLE PAYMENT PRIVATE] Stack: ${error.stack}`);
  }
}

/**
 * Processa comprovante de pagamento para grupo de vagas
 */
async function handlePaymentReceiptGroup(socket, remoteJid, messageText, userId, webMessage) {
  try {
    const userState = conversationStates.get(userId);
    
    // Se digitar "0", volta ao submenu de pagamento
    if (messageText === "0") {
      conversationStates.set(userId, { state: "awaiting_payment_group", timestamp: Date.now() });
      await sendWithDelay(socket, remoteJid, { text: getPaymentGroupMessage() });
      return;
    }

    // Verifica se há imagem/mídia na mensagem
    if (webMessage?.message?.imageMessage || webMessage?.message?.documentMessage) {
      const clientNumber = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "");
      
      // Envia para todos os números configurados
      for (const targetNumber of PAYMENT_NOTIFICATION_NUMBERS) {
        try {
          // Envia a imagem/comprovante
          await sendWithDelay(socket, targetNumber, {
            image: webMessage.message.imageMessage || webMessage.message.documentMessage,
            caption: `💰 *Comprovante de Pagamento - Grupo de Vagas*\n\n*Cliente:* ${clientNumber}\n*Data:* ${new Date().toLocaleString("pt-BR")}`
          });
          
          // Envia notificação de pagamento
          await sendWithDelay(socket, targetNumber, {
            text: getPaymentNotificationGroup(clientNumber)
          });
          
          infoLog(`[HANDLE PAYMENT RECEIPT GROUP] Comprovante enviado para ${targetNumber}`);
        } catch (error) {
          errorLog(`[HANDLE PAYMENT RECEIPT GROUP] Erro ao enviar para ${targetNumber}: ${error.message}`);
        }
      }

      // Envia mensagem de boas-vindas para o cliente
      await sendWithDelay(socket, remoteJid, { text: getGroupAccessMessage() });
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
    } else {
      // Se não for imagem, pede para enviar comprovante
      await sendWithDelay(socket, remoteJid, { text: getPaymentReceiptRequestMessage() });
    }
  } catch (error) {
    errorLog(`[HANDLE PAYMENT RECEIPT GROUP] Erro: ${error.message}`);
    errorLog(`[HANDLE PAYMENT RECEIPT GROUP] Stack: ${error.stack}`);
  }
}

/**
 * Processa comprovante de pagamento para vagas privadas
 */
async function handlePaymentReceiptPrivate(socket, remoteJid, messageText, userId, webMessage) {
  try {
    const userState = conversationStates.get(userId);
    
    // Se digitar "0", volta ao submenu de pagamento
    if (messageText === "0") {
      conversationStates.set(userId, { state: "awaiting_payment_private", timestamp: Date.now() });
      await sendWithDelay(socket, remoteJid, { text: getPaymentPrivateMessage() });
      return;
    }

    // Verifica se há imagem/mídia na mensagem
    if (webMessage?.message?.imageMessage || webMessage?.message?.documentMessage) {
      const clientNumber = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "");
      
      // Envia para todos os números configurados
      for (const targetNumber of PAYMENT_NOTIFICATION_NUMBERS) {
        try {
          // Envia a imagem/comprovante
          await sendWithDelay(socket, targetNumber, {
            image: webMessage.message.imageMessage || webMessage.message.documentMessage,
            caption: `💰 *Comprovante de Pagamento - Vagas Personalizadas*\n\n*Cliente:* ${clientNumber}\n*Data:* ${new Date().toLocaleString("pt-BR")}`
          });
          
          // Envia notificação de pagamento
          await sendWithDelay(socket, targetNumber, {
            text: getPaymentNotificationPrivate(clientNumber)
          });
          
          infoLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Comprovante enviado para ${targetNumber}`);
        } catch (error) {
          errorLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Erro ao enviar para ${targetNumber}: ${error.message}`);
        }
      }

      // Envia mensagem de boas-vindas para o cliente
      await sendWithDelay(socket, remoteJid, { text: getPrivateAccessMessage() });
      conversationStates.set(userId, { state: "menu", timestamp: Date.now() });
    } else {
      // Se não for imagem, pede para enviar comprovante
      await sendWithDelay(socket, remoteJid, { text: getPaymentReceiptRequestMessage() });
    }
  } catch (error) {
    errorLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Erro: ${error.message}`);
    errorLog(`[HANDLE PAYMENT RECEIPT PRIVATE] Stack: ${error.stack}`);
  }
}

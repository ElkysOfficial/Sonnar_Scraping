/**
 * incomingHandler — porta de entrada de toda mensagem recebida pelo bot.
 *
 * Decide rapidamente como tratar uma mensagem:
 *   1. Vem de admin? → tenta processar como comando (/r, /encerrar, ...)
 *   2. Conversa em mode='human'? → encaminha pros admins, bot calado
 *   3. Conversa em mode='awaiting_rating'? → processa nota 1-5
 *   4. Caso contrario → menuRouter (Elkys + Sonnar)
 *
 * Devolve { handled: true } sempre que processou a mensagem (mesmo que
 * tenha apenas encaminhado pros admins). Quando devolve { handled: false },
 * o middleware deve seguir o fluxo legado (dynamicCommand).
 */
import { HUMAN_HANDOVER_ENABLED } from "../../config.js"
import { errorLog, infoLog } from "../../utils/logger.js"
import { tryHandleAdminCommand } from "./adminCommands.js"
import { isAdminJid } from "./lookupContact.js"
import {
  getConversation,
  upsertConversation,
  recordIncomingMessage,
  recordBotReply,
} from "./conversationState.js"
import {
  forwardClientMessageToAdmins,
  processRatingResponse,
  recordDirectAdminReply,
  startHumanHandover,
} from "./humanHandover.js"
import { lookupContact } from "./lookupContact.js"
import { routeMessage, getRootMenuText } from "./menuRouter.js"
import { wasSentByBot, wrapSocketSend } from "./outboundTracker.js"

/**
 * Extrai texto util do webMessage do Baileys.
 */
export function extractMessageText(webMessage) {
  const m = webMessage?.message
  if (!m) return ""
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  ).toString()
}

/**
 * Handler principal — chamado para cada mensagem recebida.
 *
 * Critical path: NÃO pode lançar exceção que pare o middleware.
 * Tudo encapsulado em try/catch — em qualquer falha, devolve handled=false
 * pra preservar comportamento legado.
 *
 * @param {Object} opts
 * @param {Object} opts.webMessage  payload bruto Baileys
 * @param {Object} opts.socket
 * @returns {Promise<{handled: boolean}>}
 */
export async function handleIncomingMessage({ webMessage, socket }) {
  if (!HUMAN_HANDOVER_ENABLED) return { handled: false }

  try {
    const jid = webMessage?.key?.remoteJid
    if (!jid) return { handled: false }

    // Garante que socket.sendMessage esta wrappado pra distinguir
    // mensagens fromMe do bot vs admins humanos. Idempotente.
    wrapSocketSend(socket)

    // Ignora mensagens de grupo (atendimento eh so 1-1)
    if (jid.endsWith("@g.us")) return { handled: false }

    const text = extractMessageText(webMessage).trim()
    if (!text) return { handled: false }

    // ── Mensagem fromMe: ou eh o bot enviando (codigo) ou admin
    //    respondendo DIRETO pelo numero do bot (WhatsApp Web/celular)
    if (webMessage?.key?.fromMe) {
      const msgId = webMessage?.key?.id
      if (wasSentByBot(msgId)) {
        // Foi o codigo do bot que enviou — pula pra nao duplicar registro
        return { handled: true }
      }
      // Veio do WhatsApp Web/App do mesmo numero (humano respondendo direto)
      const conv = await getConversation(jid)
      if (conv?.mode === "human") {
        await recordDirectAdminReply({
          targetJid: jid,
          text,
          conversation: conv,
        })
      }
      // Em qualquer caso, mensagem fromMe nao gera resposta automatica
      return { handled: true }
    }

    // 1. Admin? tenta processar como comando
    if (isAdminJid(jid)) {
      const result = await tryHandleAdminCommand({ jid, text, socket })
      if (result.handled) return result
      // Admin mandou mensagem sem ser comando — ignora pra nao
      // disparar fluxo de cliente quando ele esta testando
      return { handled: true }
    }

    // 2. Carrega estado da conversa (cria se nao existir)
    let conv = await getConversation(jid)
    if (!conv) {
      // Primeira interacao deste cliente
      conv = await upsertConversation(jid, {
        current_menu: "root",
        mode: "bot",
      })
    }

    // Salva texto da mensagem recebida (audit + contexto)
    await recordIncomingMessage(jid, text)

    // 3. Conversa em modo humano: encaminha pros admins e RETURN
    if (conv?.mode === "human") {
      await forwardClientMessageToAdmins({
        jid,
        text,
        conversation: conv,
        socket,
      })
      return { handled: true }
    }

    // 4. Conversa aguardando rating: processa nota
    if (conv?.mode === "awaiting_rating") {
      // "pular" volta ao bot sem registrar nota
      if (text.toLowerCase().trim() === "pular") {
        await upsertConversation(jid, {
          mode: "bot",
          current_menu: "root",
          active_ticket_id: null,
        })
        await socket.sendMessage(jid, {
          text: `Sem problemas! Digite *menu* a qualquer momento.`,
        })
        return { handled: true }
      }
      await processRatingResponse({ jid, text, conversation: conv, socket })
      return { handled: true }
    }

    // 5. Modo bot: identifica contato (lazy load) + roteia menu
    const contact = await lookupContact(jid)

    // Cacheia identificação se ainda não foi setada
    if (conv.identified_as === "unknown" && contact.identifiedAs !== "unknown") {
      await upsertConversation(jid, {
        identified_as: contact.identifiedAs,
        client_id: contact.clientId,
        subscriber_id: contact.subscriberId,
        subscriber_plan: contact.subscriberPlan,
        display_name: contact.displayName,
      })
    }

    const route = routeMessage({
      text,
      currentMenu: conv.current_menu || "root",
      contact: { ...contact, ...{ subscriberPlan: contact.subscriberPlan || conv.subscriber_plan } },
    })

    // Transicao pra atendimento humano
    if (route.transition?.type === "human") {
      // Envia o "estamos preparando" antes de mudar o modo
      try {
        await socket.sendMessage(jid, { text: route.reply })
        await recordBotReply(jid)
      } catch (err) {
        errorLog(`[incomingHandler] preface reply falhou: ${err.message}`)
      }
      await startHumanHandover({
        jid,
        contact,
        transition: route.transition,
        lastMessage: text,
        socket,
      })
      return { handled: true }
    }

    // Resposta normal de menu (atualiza estado + envia)
    await upsertConversation(jid, { current_menu: route.nextMenu })
    try {
      await socket.sendMessage(jid, { text: route.reply })
      await recordBotReply(jid)
    } catch (err) {
      errorLog(`[incomingHandler] reply falhou: ${err.message}`)
    }

    return { handled: true }
  } catch (err) {
    errorLog(`[incomingHandler] ${err.message}\n${err.stack}`)
    return { handled: false }
  }
}

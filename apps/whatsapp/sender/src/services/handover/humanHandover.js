/**
 * humanHandover - orquestrador do atendimento humano.
 *
 * Responsabilidades:
 *   1. Quando cliente solicita atendimento (menu transition='human'):
 *      - Cria ticket no banco Elkys
 *      - Cria lead novo se for cliente desconhecido
 *      - Marca conversa como mode='human'
 *      - Notifica TODOS os admins
 *
 *   2. Quando admin responde via /r:
 *      - Envia mensagem pro cliente
 *      - Marca first_response_at no ticket (idempotente)
 *      - Salva em ticket_messages
 *      - Replica mensagem aos demais admins (cada um vê o que o outro mandou)
 *
 *   3. Quando cliente manda mensagem durante atendimento:
 *      - Encaminha pra TODOS os admins com formato:
 *        💬 +5511XXX - texto
 *      - NÃO responde nada pro cliente (bot calado)
 *      - Salva em ticket_messages como sender_role='client'
 *
 *   4. Quando admin encerra com /encerrar:
 *      - Envia mensagem pro cliente pedindo nota 1-5
 *      - Marca ticket como 'resolvido'
 *      - Conversa entra em mode='awaiting_rating'
 *
 *   5. Quando cliente envia rating (1-5):
 *      - Salva no ticket
 *      - Bot agradece + retorna menu
 *      - Conversa volta a mode='bot', menu='root'
 *      - Notifica admins com a nota recebida
 */
import { ADMIN_PHONES, NOTIFY_PHONES, NOTIFY_LIDS, BOT_NAME } from "../../config.js"
import { errorLog, infoLog, successLog } from "../../utils/logger.js"
import { phoneToJid, jidToPhone } from "./lookupContact.js"
import {
  getConversation,
  upsertConversation,
  setMode,
} from "./conversationState.js"
import {
  createTicket,
  createLead,
  addTicketMessage,
  markFirstResponse,
  resolveTicket,
  saveRating,
} from "./ticketManager.js"

const GOOGLE_REVIEW_URL = "https://g.page/r/CYRKlvyrnr5DEBM/review"

const RATING_PROMPT =
  `*Atendimento encerrado*\n\n` +
  `Como foi sua experiência? Responda com um número de 1 a 5:\n\n` +
  `*1.* Péssimo\n` +
  `*2.* Ruim\n` +
  `*3.* Razoável\n` +
  `*4.* Bom\n` +
  `*5.* Excelente\n\n` +
  `Sua avaliação nos ajuda muito.`

const RATING_THANK_YOU_LOW =
  `Obrigado pelo retorno.\n\n` +
  `Vamos usar esse feedback pra melhorar o atendimento. ` +
  `Se precisar de algo mais, digite *menu* a qualquer momento.`

const RATING_THANK_YOU_HIGH = (stars) =>
  `Obrigado pelo retorno! ${stars}\n\n` +
  `Como sua experiência foi muito boa, faz a gente um favor?\n` +
  `Deixa uma estrelinha pra Elkys no Google - leva 10 segundos:\n\n` +
  `${GOOGLE_REVIEW_URL}\n\n` +
  `Vai ajudar muito a aparecermos pra mais gente. 🙏`

/**
 * Inicia o modo humano para um cliente - chamado quando o menuRouter
 * retorna transition='human'.
 *
 * @param {Object} opts
 * @param {string} opts.jid           cliente
 * @param {Object} opts.contact       lookupContact result
 * @param {Object} opts.transition    objeto vindo do menuRouter
 * @param {string} opts.lastMessage   ultima mensagem que disparou
 * @param {Object} opts.socket        socket Baileys pra enviar mensagens
 * @returns {Promise<{ticketId: string|null}>}
 */
export async function startHumanHandover({ jid, contact, transition, lastMessage, socket }) {
  // Se for cliente desconhecido, cria lead primeiro
  let leadId = null
  if (contact.identifiedAs === "unknown") {
    const lead = await createLead({
      phone: contact.phone,
      name: null,
      firstMessage: lastMessage,
    })
    leadId = lead?.id || null
  }

  // Cria ticket
  const ticket = await createTicket({
    jid,
    subject: transition.subject || "Atendimento WhatsApp",
    body: lastMessage ? `Cliente disse:\n"${lastMessage}"` : "Cliente solicitou atendimento.",
    category: transition.category || "outro",
    priority: transition.priority || "media",
    clientId: contact.clientId,
    leadId,
    subscriberId: contact.subscriberId,
    subscriberPlan: contact.subscriberPlan,
    metadata: { transition_notify: transition.notify },
  })

  // Atualiza estado da conversa
  await upsertConversation(jid, {
    mode: "human",
    current_menu: "human",
    active_ticket_id: ticket?.id || null,
    identified_as: contact.identifiedAs,
    client_id: contact.clientId,
    lead_id: leadId,
    subscriber_id: contact.subscriberId,
    subscriber_plan: contact.subscriberPlan,
    display_name: contact.displayName,
  })

  // Salva primeira mensagem do cliente no historico
  if (ticket?.id && lastMessage) {
    await addTicketMessage(ticket.id, "client", lastMessage, contact.displayName)
  }

  // Notifica todos os admins
  await notifyAdminsNewTicket({
    contact,
    ticket,
    transitionLabel: transition.notify || "💬 *Novo atendimento*",
    firstMessage: lastMessage,
    socket,
  })

  return { ticketId: ticket?.id || null }
}

/**
 * Encaminha mensagem do CLIENTE em modo humano pra todos os admins.
 * Bot nao responde nada pro cliente (silencio total).
 *
 * @param {Object} opts
 * @param {string} opts.jid
 * @param {string} opts.text
 * @param {Object} opts.conversation  estado atual
 * @param {Object} opts.socket
 */
export async function forwardClientMessageToAdmins({ jid, text, conversation, socket }) {
  // Salva no historico do ticket
  if (conversation?.active_ticket_id) {
    await addTicketMessage(
      conversation.active_ticket_id,
      "client",
      text,
      conversation.display_name,
    )
  }

  const phone = jidToPhone(jid)
  const name = conversation?.display_name || `+${phone}`
  const ticketRef = conversation?.active_ticket_id
    ? `\n_Ticket: ${shortId(conversation.active_ticket_id)}_`
    : ""

  const msg =
    `💬 *${name}*\n` +
    `_+${phone}_${ticketRef}\n\n` +
    text

  await sendToAdmins(socket, msg)
}

/**
 * Admin responde o cliente via /r. Envia mensagem pelo bot,
 * espelha aos demais admins e atualiza ticket.
 *
 * @param {Object} opts
 * @param {string} opts.targetJid   cliente
 * @param {string} opts.text        resposta
 * @param {string} opts.authorPhone admin que respondeu
 * @param {Object} opts.socket
 * @returns {Promise<boolean>}
 */
export async function adminReplyToClient({ targetJid, text, authorPhone, socket }) {
  if (!socket?.sendMessage) return false

  try {
    await socket.sendMessage(targetJid, { text })
    successLog(`[handover] admin ${authorPhone} -> ${targetJid}: ${text.slice(0, 60)}`)
  } catch (err) {
    errorLog(`[handover] adminReply falhou: ${err.message}`)
    return false
  }

  // Atualiza ticket: first_response_at (1a vez) + adiciona mensagem
  const conv = await getConversation(targetJid)
  if (conv?.active_ticket_id) {
    await markFirstResponse(conv.active_ticket_id)
    await addTicketMessage(conv.active_ticket_id, "admin", text, authorPhone)
  }

  // Espelha pros OUTROS notificados (nao pro que mandou).
  // v3.10.27: usa NOTIFY (admin + notify recipients), nao so ADMIN.
  // Pessoas que SO recebem notificacao tambem veem as respostas que o
  // admin manda - util pra acompanhamento por socio/equipe.
  const otherNotify = NOTIFY_PHONES.filter((p) => p !== authorPhone)
  const phone = jidToPhone(targetJid)
  const name = conv?.display_name || `+${phone}`
  const mirror = `✅ *${authorPhone.slice(-4)} → ${name}*\n_+${phone}_\n\n${text}`
  for (const adm of otherNotify) {
    const jid = phoneToJid(adm)
    if (!jid) continue
    try {
      await socket.sendMessage(jid, { text: mirror })
    } catch (err) {
      // best-effort - nao quebra fluxo
      errorLog(`[handover] mirror falhou pra ${adm}: ${err.message}`)
    }
  }

  return true
}

/**
 * Admin respondeu DIRETO pelo numero do bot (WhatsApp Web/celular do
 * proprio numero). A mensagem ja foi para o cliente porque foi enviada
 * fora do Baileys - aqui so registramos no historico e marcamos SLA.
 *
 * Usado em complemento ao /r: a mensagem foi enviada manualmente, mas
 * a gente quer rastrear pra dashboard/metricas.
 *
 * @param {Object} opts
 * @param {string} opts.targetJid  cliente destinatario
 * @param {string} opts.text       texto enviado
 * @param {Object} opts.conversation  estado da conversa
 */
export async function recordDirectAdminReply({ targetJid, text, conversation }) {
  if (!conversation?.active_ticket_id) return false

  // Marca first_response_at se ainda nao tinha
  await markFirstResponse(conversation.active_ticket_id)

  // Salva no historico
  await addTicketMessage(
    conversation.active_ticket_id,
    "admin",
    text,
    "direct@bot", // marca que veio direto pelo numero do bot
  )

  // Atualiza last_bot_reply_at na conversa pra estatisticas
  await upsertConversation(targetJid, {
    last_bot_reply_at: new Date().toISOString(),
  })

  infoLog(`[handover] admin (direto pelo bot) -> ${targetJid}: ${text.slice(0, 60)}`)
  return true
}

/**
 * Encerra atendimento humano. Bot envia pedido de rating pro cliente
 * e marca ticket como resolvido. Conversa entra em awaiting_rating.
 */
export async function closeHumanHandover({ targetJid, closedByPhone, socket }) {
  const conv = await getConversation(targetJid)
  if (!conv) return false

  if (conv.active_ticket_id) {
    await resolveTicket(conv.active_ticket_id)
  }

  await setMode(targetJid, "awaiting_rating", { current_menu: "awaiting_rating" })

  // Cliente recebe pedido de rating
  try {
    await socket.sendMessage(targetJid, { text: RATING_PROMPT })
  } catch (err) {
    errorLog(`[handover] envio rating falhou: ${err.message}`)
  }

  // Notifica admins que o ticket foi encerrado
  const phone = jidToPhone(targetJid)
  const name = conv.display_name || `+${phone}`
  const notice =
    `✅ *Atendimento encerrado*\n` +
    `Cliente: ${name} (+${phone})\n` +
    `Encerrado por: +${closedByPhone}\n` +
    `_Aguardando avaliação 1-5 do cliente._`
  await sendToAdmins(socket, notice)

  return true
}

/**
 * Processa resposta numerica 1-5 do cliente no estado awaiting_rating.
 * Volta a conversa pro modo bot e mostra menu.
 *
 * @returns {Promise<{ saved: boolean, rating: number|null }>}
 */
export async function processRatingResponse({ jid, text, conversation, socket }) {
  const num = Number((text || "").trim().match(/[1-5]/)?.[0])
  if (!num || num < 1 || num > 5) {
    // Cliente nao mandou nota - pede de novo
    try {
      await socket.sendMessage(jid, {
        text:
          `Não entendi 😅\n\n` +
          `Responda só com um número de *1 a 5* pra avaliar o atendimento.\n` +
          `Ou digite *pular* pra encerrar sem avaliar.`,
      })
    } catch (err) {
      errorLog(`[handover] re-rating prompt falhou: ${err.message}`)
    }
    return { saved: false, rating: null }
  }

  if (conversation?.active_ticket_id) {
    await saveRating(conversation.active_ticket_id, num)
  }

  // Reset da conversa
  await upsertConversation(jid, {
    mode: "bot",
    current_menu: "root",
    active_ticket_id: null,
  })

  // v3.10.30: nota >=4 ganha CTA pro Google review
  const stars = "⭐".repeat(num)
  const thankYou = num >= 4
    ? RATING_THANK_YOU_HIGH(stars)
    : RATING_THANK_YOU_LOW

  try {
    await socket.sendMessage(jid, { text: thankYou })
  } catch (err) {
    errorLog(`[handover] thank-you falhou: ${err.message}`)
  }

  // Notifica admins com o rating
  const phone = jidToPhone(jid)
  const name = conversation?.display_name || `+${phone}`
  const adminStars = "⭐".repeat(num) + "☆".repeat(5 - num)
  const cta = num >= 4 ? " · CTA Google review enviado" : ""
  const summary =
    `📊 *Avaliação recebida*\n` +
    `Cliente: ${name} (+${phone})\n` +
    `Nota: ${num}/5  ${adminStars}${cta}`
  await sendToAdmins(socket, summary)

  return { saved: true, rating: num }
}

/**
 * Notifica todos os admins quando um ticket eh aberto.
 */
async function notifyAdminsNewTicket({ contact, ticket, transitionLabel, firstMessage, socket }) {
  const ticketRef = ticket?.id ? `\n_Ticket: ${shortId(ticket.id)}_` : ""
  const planTag = contact.subscriberPlan
    ? `\n*Plano Sonnar:* ${contact.subscriberPlan.toUpperCase()}`
    : ""
  const typeTag = identityTag(contact.identifiedAs)
  const mensagem = firstMessage
    ? `\n\n💬 _"${firstMessage.slice(0, 300)}"_`
    : ""

  const msg =
    `🔔 ${transitionLabel}${ticketRef}\n\n` +
    `*Cliente:* ${contact.displayName}\n` +
    `*Número:* +${contact.phone}\n` +
    `*Tipo:* ${typeTag}` +
    planTag +
    mensagem +
    `\n\n_Pra responder:_\n` +
    `\`/r ${contact.phone} <sua mensagem>\`\n\n` +
    `_Pra encerrar:_\n` +
    `\`/encerrar ${contact.phone}\``

  await sendToAdmins(socket, msg)
}

/**
 * Envia uma mensagem pra todos os destinatarios de notificacao em
 * paralelo (best-effort).
 *
 * v3.10.27: dispara para NOTIFY_PHONES (numeros @s.whatsapp.net) E
 * NOTIFY_LIDS (LIDs @lid). Garante alcance mesmo apos a migracao de
 * WhatsApp pra LID, e suporta separacao admin vs notify recipient.
 */
async function sendToAdmins(socket, text) {
  if (!socket?.sendMessage) return
  const targets = new Set()
  for (const phone of NOTIFY_PHONES) {
    const jid = phoneToJid(phone)
    if (jid) targets.add(jid)
  }
  for (const lid of NOTIFY_LIDS) {
    if (lid) targets.add(lid)
  }
  await Promise.all(
    Array.from(targets).map(async (target) => {
      try {
        await socket.sendMessage(target, { text })
      } catch (err) {
        errorLog(`[handover] notify ${target} falhou: ${err.message}`)
      }
    }),
  )
}

function shortId(uuid) {
  return uuid ? `#${uuid.slice(0, 8)}` : "#"
}

function identityTag(id) {
  switch (id) {
    case "elkys_client":
      return "🏢 Cliente Elkys"
    case "sonnar_subscriber":
      return "🚀 Assinante Sonnar"
    case "lead":
      return "🆕 Lead"
    case "admin":
      return "👤 Admin"
    default:
      return "❓ Lead novo (não identificado)"
  }
}

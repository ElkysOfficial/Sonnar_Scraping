/**
 * ticketManager — cria/atualiza tickets de atendimento no banco Elkys.
 *
 * Sempre que um cliente entra em modo humano, criamos um support_ticket
 * com source='whatsapp'. As mensagens trocadas (cliente <-> admins) ficam
 * em ticket_messages — historico completo.
 *
 * Quando o admin encerra com /encerrar, ticket vai pra 'resolvido' e a
 * conversa entra em mode='awaiting_rating' (bot pede nota 1-5).
 */
import { getElkysClient } from "./elkysClient.js"
import { errorLog, infoLog } from "../../utils/logger.js"

/**
 * @typedef {Object} CreateTicketOpts
 * @property {string} jid
 * @property {string} subject
 * @property {string} body
 * @property {string} category    -- valor do enum support_ticket_category
 * @property {string} priority    -- 'baixa' | 'media' | 'alta'
 * @property {string|null} clientId
 * @property {string|null} leadId
 * @property {string|null} subscriberId  -- sonnar (cross-DB)
 * @property {string|null} subscriberPlan
 * @property {Object} metadata
 */

/**
 * Cria um ticket novo (status='aberto').
 *
 * @param {CreateTicketOpts} opts
 * @returns {Promise<{ id: string } | null>}
 */
export async function createTicket(opts) {
  const supa = getElkysClient()
  if (!supa) return null

  const payload = {
    client_id: opts.clientId || null,
    subject: opts.subject || "Atendimento WhatsApp",
    body: opts.body || "Cliente solicitou atendimento via WhatsApp",
    status: "aberto",
    priority: opts.priority || "media",
    category: opts.category || "outro",
    source: "whatsapp",
    whatsapp_jid: opts.jid,
    source_metadata: {
      lead_id: opts.leadId,
      subscriber_id: opts.subscriberId,
      subscriber_plan: opts.subscriberPlan,
      ...(opts.metadata || {}),
    },
  }

  try {
    const { data, error } = await supa
      .from("support_tickets")
      .insert(payload)
      .select("id")
      .single()
    if (error) {
      errorLog(`[ticketManager.create] ${error.message}`)
      return null
    }
    infoLog(`[ticketManager] ticket criado #${data.id} pra ${opts.jid}`)
    return { id: data.id }
  } catch (err) {
    errorLog(`[ticketManager.create] ${err.message}`)
    return null
  }
}

/**
 * Adiciona mensagem ao historico do ticket. Cliente ou admin.
 *
 * @param {string} ticketId
 * @param {'client'|'admin'} senderRole
 * @param {string} body
 * @param {string} [authorName]
 */
export async function addTicketMessage(ticketId, senderRole, body, authorName = null) {
  const supa = getElkysClient()
  if (!supa) return false
  if (!ticketId) return false

  try {
    const { error } = await supa.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_role: senderRole, // 'admin' | 'client' (enum existente)
      author_name: authorName,
      body: (body || "").slice(0, 5000),
    })
    if (error) {
      errorLog(`[ticketManager.addMessage] ${error.message}`)
      return false
    }
    return true
  } catch (err) {
    errorLog(`[ticketManager.addMessage] ${err.message}`)
    return false
  }
}

/**
 * Marca first_response_at no ticket — usado pra calcular SLA.
 * Idempotente: so atualiza se for null.
 *
 * Tambem move status 'aberto' -> 'em_andamento' pra satisfazer a check
 * constraint `tickets_first_response_check`:
 *   (first_response_at IS NULL) OR (status <> 'aberto')
 *
 * Se o ticket ja estava em outro status (em_andamento/resolvido/fechado),
 * apenas grava o first_response_at sem mexer no status.
 */
export async function markFirstResponse(ticketId) {
  const supa = getElkysClient()
  if (!supa || !ticketId) return false
  try {
    // Le status atual pra decidir se precisa promover pra em_andamento
    const { data: current, error: readErr } = await supa
      .from("support_tickets")
      .select("status, first_response_at")
      .eq("id", ticketId)
      .maybeSingle()
    if (readErr) {
      errorLog(`[ticketManager.firstResponse] read: ${readErr.message}`)
      return false
    }
    if (!current || current.first_response_at) return false // ja respondeu

    const patch = { first_response_at: new Date().toISOString() }
    if (current.status === "aberto") patch.status = "em_andamento"

    const { error } = await supa
      .from("support_tickets")
      .update(patch)
      .eq("id", ticketId)
      .is("first_response_at", null)
    if (error) {
      errorLog(`[ticketManager.firstResponse] ${error.message}`)
      return false
    }
    return true
  } catch (err) {
    errorLog(`[ticketManager.firstResponse] ${err.message}`)
    return false
  }
}

/**
 * Marca ticket como resolvido (status='resolvido', resolved_at=now).
 */
export async function resolveTicket(ticketId) {
  const supa = getElkysClient()
  if (!supa || !ticketId) return false
  try {
    const { error } = await supa
      .from("support_tickets")
      .update({ status: "resolvido", resolved_at: new Date().toISOString() })
      .eq("id", ticketId)
    if (error) {
      errorLog(`[ticketManager.resolve] ${error.message}`)
      return false
    }
    return true
  } catch (err) {
    errorLog(`[ticketManager.resolve] ${err.message}`)
    return false
  }
}

/**
 * Salva o rating 1-5 + feedback opcional. Marca rated_at.
 */
export async function saveRating(ticketId, rating, feedback = null) {
  const supa = getElkysClient()
  if (!supa || !ticketId) return false
  const safeRating = Math.max(1, Math.min(5, Number(rating) || 0))
  if (safeRating === 0) return false
  try {
    const { error } = await supa
      .from("support_tickets")
      .update({
        rating: safeRating,
        rating_feedback: feedback ? feedback.slice(0, 1000) : null,
        rated_at: new Date().toISOString(),
      })
      .eq("id", ticketId)
    if (error) {
      errorLog(`[ticketManager.rating] ${error.message}`)
      return false
    }
    return true
  } catch (err) {
    errorLog(`[ticketManager.rating] ${err.message}`)
    return false
  }
}

/**
 * Adiciona uma nota interna no ticket (so admins veem).
 * Atalho do comando admin /notas.
 *
 * NOTA: internal_notes eh um campo text simples (sem historico).
 * Appendeamos com prefixo de timestamp.
 */
export async function appendInternalNote(ticketId, note, authorPhone) {
  const supa = getElkysClient()
  if (!supa || !ticketId) return false
  try {
    const { data: cur } = await supa
      .from("support_tickets")
      .select("internal_notes")
      .eq("id", ticketId)
      .maybeSingle()

    const ts = new Date().toISOString().slice(0, 19).replace("T", " ")
    const newLine = `[${ts}] (${authorPhone}) ${note}`
    const merged = cur?.internal_notes
      ? `${cur.internal_notes}\n${newLine}`
      : newLine

    const { error } = await supa
      .from("support_tickets")
      .update({ internal_notes: merged })
      .eq("id", ticketId)
    if (error) {
      errorLog(`[ticketManager.note] ${error.message}`)
      return false
    }
    return true
  } catch (err) {
    errorLog(`[ticketManager.note] ${err.message}`)
    return false
  }
}

/**
 * Cria lead novo na tabela leads (Elkys) quando o numero nao existe
 * em clients. Eh chamado pelo humanHandover quando o cliente solicita
 * atendimento e identified_as=='unknown'.
 *
 * @param {Object} opts
 * @param {string} opts.phone
 * @param {string} [opts.name]    nome se conseguimos detectar
 * @param {string} [opts.firstMessage]  primeira mensagem do cliente
 * @returns {Promise<{ id: string } | null>}
 */
export async function createLead({ phone, name, firstMessage }) {
  const supa = getElkysClient()
  if (!supa) return null
  try {
    const payload = {
      name: name || `Lead WhatsApp ${phone.slice(-4)}`,
      email: null,
      phone,
      source: "whatsapp",   // enum lead_source ja inclui 'whatsapp'
      status: "prospeccao",  // enum lead_status
      notes: firstMessage ? `Primeira mensagem:\n${firstMessage.slice(0, 1000)}` : null,
    }
    const { data, error } = await supa
      .from("leads")
      .insert(payload)
      .select("id")
      .single()
    if (error) {
      errorLog(`[ticketManager.createLead] ${error.message}`)
      return null
    }
    infoLog(`[ticketManager] lead criado #${data.id} pra +${phone}`)
    return { id: data.id }
  } catch (err) {
    errorLog(`[ticketManager.createLead] ${err.message}`)
    return null
  }
}

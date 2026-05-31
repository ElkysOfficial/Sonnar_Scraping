/**
 * conversationState — CRUD da tabela whatsapp_conversations.
 *
 * Persiste estado da conversa por JID. Sobrevive a restart do sender —
 * cliente nao precisa reiniciar o menu do zero quando o bot reinicia.
 */
import { getElkysClient } from "./elkysClient.js"
import { errorLog } from "../../utils/logger.js"

/**
 * @typedef {Object} ConversationState
 * @property {string} jid
 * @property {string} current_menu
 * @property {'bot'|'human'|'awaiting_rating'} mode
 * @property {string|null} active_ticket_id
 * @property {string} identified_as
 * @property {string|null} client_id
 * @property {string|null} lead_id
 * @property {string|null} subscriber_id
 * @property {string|null} subscriber_plan
 * @property {string|null} display_name
 * @property {string|null} last_message_at
 * @property {string|null} last_message_text
 * @property {Object} context
 */

/**
 * Busca o estado atual da conversa. Devolve null se nao existir.
 *
 * @param {string} jid
 * @returns {Promise<ConversationState|null>}
 */
export async function getConversation(jid) {
  const supa = getElkysClient()
  if (!supa) return null
  try {
    const { data, error } = await supa
      .from("whatsapp_conversations")
      .select("*")
      .eq("jid", jid)
      .maybeSingle()
    if (error) {
      errorLog(`[conversationState.get] ${error.message}`)
      return null
    }
    return data || null
  } catch (err) {
    errorLog(`[conversationState.get] ${err.message}`)
    return null
  }
}

/**
 * Cria ou atualiza a conversa. Upsert via PK (jid).
 *
 * @param {string} jid
 * @param {Partial<ConversationState>} patch  campos a atualizar
 * @returns {Promise<ConversationState|null>}
 */
export async function upsertConversation(jid, patch = {}) {
  const supa = getElkysClient()
  if (!supa) return null
  try {
    const payload = {
      jid,
      ...patch,
      last_message_at: patch.last_message_at || new Date().toISOString(),
    }
    const { data, error } = await supa
      .from("whatsapp_conversations")
      .upsert(payload, { onConflict: "jid" })
      .select()
      .maybeSingle()
    if (error) {
      errorLog(`[conversationState.upsert] ${error.message}`)
      return null
    }
    return data
  } catch (err) {
    errorLog(`[conversationState.upsert] ${err.message}`)
    return null
  }
}

/**
 * Atualiza apenas o estado de modo (transicoes entre 'bot', 'human',
 * 'awaiting_rating'). Atalho usado pelo humanHandover.
 */
export async function setMode(jid, mode, extra = {}) {
  return upsertConversation(jid, { mode, ...extra })
}

/**
 * Salva texto da ultima mensagem do cliente — usado pra contexto nas
 * notificacoes admin ("Cliente disse: [...]").
 */
export async function recordIncomingMessage(jid, text) {
  return upsertConversation(jid, {
    last_message_text: (text || "").slice(0, 500),
    last_message_at: new Date().toISOString(),
  })
}

/**
 * Marca o timestamp da ultima resposta do bot (proteciao contra
 * spam de loops de mensagens — se duas chegarem em <2s, ignora 2a).
 */
export async function recordBotReply(jid) {
  return upsertConversation(jid, {
    last_bot_reply_at: new Date().toISOString(),
  })
}

/**
 * Salva pedaco do contexto (ex.: { sonnar_assinar: 'grupo' }).
 * Merge com o contexto existente.
 */
export async function mergeContext(jid, patch) {
  const cur = await getConversation(jid)
  const newContext = { ...(cur?.context || {}), ...patch }
  return upsertConversation(jid, { context: newContext })
}

/**
 * Lista todas as conversas em modo 'human' (atendimentos abertos).
 * Usado pelo comando admin /abertos.
 */
export async function listOpenConversations() {
  const supa = getElkysClient()
  if (!supa) return []
  try {
    const { data, error } = await supa
      .from("whatsapp_conversations")
      .select("jid, display_name, identified_as, mode, active_ticket_id, last_message_at, last_message_text")
      .eq("mode", "human")
      .order("last_message_at", { ascending: false })
      .limit(50)
    if (error) {
      errorLog(`[conversationState.listOpen] ${error.message}`)
      return []
    }
    return data || []
  } catch (err) {
    errorLog(`[conversationState.listOpen] ${err.message}`)
    return []
  }
}

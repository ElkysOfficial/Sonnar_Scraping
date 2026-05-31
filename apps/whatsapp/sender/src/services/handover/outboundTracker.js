/**
 * outboundTracker — distingue mensagens enviadas PELO BOT (via socket.sendMessage)
 * de mensagens enviadas DO MESMO NUMERO mas por humano (WhatsApp Web/App).
 *
 * Problema: o Baileys emite messages.upsert com fromMe=true em AMBOS os casos.
 * Sem este rastreador, nao teriamos como saber se a msg fromMe foi um envio
 * programatico (vagas VIP, respostas /r, etc) ou uma resposta humana digitada
 * no celular/web do numero do bot.
 *
 * Estrategia: o wrapper de socket.sendMessage salva os IDs gerados por cada
 * envio do bot. Quando uma msg fromMe chega no upsert, verificamos se o ID
 * esta no nosso set:
 *   - SIM -> foi enviada pelo bot (codigo)         -> ignora no middleware
 *   - NAO -> foi enviada por humano via WW/celular -> processa como adminReply
 *
 * IDs ficam no set por 5 min (suficiente pro Baileys terminar de despachar
 * e emitir o upsert correspondente). GC barato (Map.size periodico).
 */

const TTL_MS = 5 * 60 * 1000 // 5 minutos
const _sent = new Map() // id -> timestamp

let _gcInterval = null

function ensureGc() {
  if (_gcInterval) return
  _gcInterval = setInterval(() => {
    const now = Date.now()
    for (const [id, ts] of _sent) {
      if (now - ts > TTL_MS) _sent.delete(id)
    }
  }, 60 * 1000)
  // unref pra nao prender o processo no shutdown
  if (typeof _gcInterval.unref === "function") _gcInterval.unref()
}

/**
 * Marca um id como enviado pelo bot (codigo Sonnar/Elkys).
 */
export function markSent(id) {
  if (!id) return
  ensureGc()
  _sent.set(id, Date.now())
}

/**
 * Devolve true se o id foi marcado por markSent dentro do TTL.
 */
export function wasSentByBot(id) {
  if (!id) return false
  return _sent.has(id)
}

/**
 * Wrapper idempotente em torno de socket.sendMessage. Toda chamada
 * passa a registrar automaticamente o id retornado no tracker.
 *
 * Idempotencia eh garantida por uma flag no proprio socket — se o
 * wrapper ja foi aplicado nessa instancia, retorna sem fazer nada.
 *
 * @param {Object} socket  socket Baileys
 */
export function wrapSocketSend(socket) {
  if (!socket || typeof socket.sendMessage !== "function") return
  if (socket.__handover_wrapped) return
  const original = socket.sendMessage.bind(socket)
  socket.sendMessage = async (jid, content, options) => {
    const result = await original(jid, content, options)
    try {
      const id = result?.key?.id || result?.messageID || result?.messageId
      if (id) markSent(id)
    } catch {
      // silencioso — nao podemos quebrar o envio
    }
    return result
  }
  socket.__handover_wrapped = true
}

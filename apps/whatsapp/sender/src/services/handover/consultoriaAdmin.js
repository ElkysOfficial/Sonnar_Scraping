/**
 * consultoriaAdmin (v3.10.32) - handlers dos comandos /consultoria.
 *
 * Comandos:
 *   /consultoria abertos                       Lista pedidos pending/scheduled
 *   /consultoria <id8> agendar DD/MM HH:MM     Marca status=scheduled
 *   /consultoria <id8> concluir                Marca status=done
 *   /consultoria <id8> cancelar                Marca status=cancelled
 *   /consultoria <id8> ver                     Mostra detalhes do pedido
 *
 * `id8` = primeiros 8 chars do UUID. Resolvemos via prefix-match em runtime.
 */
import { getSonnarClient } from "./sonnarClient.js"
import { errorLog } from "../../utils/logger.js"

const STATUS_LABEL = {
  pending: "🟡 Pendente",
  scheduled: "🟢 Agendada",
  done: "✅ Concluida",
  cancelled: "⚫ Cancelada",
}

/**
 * Parseia "DD/MM HH:MM" -> Date (ano corrente; se data ja passou, ano+1).
 */
function parseScheduledAt(input) {
  const m = String(input || "").trim().match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const [, dd, mm, hh, min] = m
  const now = new Date()
  let year = now.getFullYear()
  const candidate = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10), parseInt(hh, 10), parseInt(min, 10))
  if (isNaN(candidate.getTime())) return null
  if (candidate < now) candidate.setFullYear(year + 1)
  return candidate
}

function formatScheduledAt(iso) {
  if (!iso) return "(sem data)"
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
}

/**
 * Resolve id8 (prefixo) -> uuid completo. Devolve null se nao acha ou ambiguo.
 */
async function resolveRequestId(prefix) {
  const supa = getSonnarClient()
  if (!supa) return null
  const cleaned = String(prefix || "").trim().toLowerCase().slice(0, 8)
  if (cleaned.length < 6) return null

  try {
    const { data, error } = await supa
      .from("consultoria_requests")
      .select("id")
      .like("id", `${cleaned}%`)
      .limit(2)
    if (error || !data || data.length === 0) return null
    if (data.length > 1) return "AMBIGUOUS"
    return data[0].id
  } catch (err) {
    errorLog(`[consultoriaAdmin] resolveRequestId: ${err.message}`)
    return null
  }
}

/**
 * Lista pedidos abertos (pending + scheduled).
 */
export async function listOpenConsultorias() {
  const supa = getSonnarClient()
  if (!supa) return "❌ Banco Sonnar nao configurado."

  const { data, error } = await supa
    .from("consultoria_requests")
    .select("id, status, scheduled_at, linkedin_url, objetivo, created_at, subscriber:subscribers(name, email)")
    .in("status", ["pending", "scheduled"])
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) return `❌ Erro: ${error.message}`
  if (!data || data.length === 0) return "📋 Nenhum pedido de consultoria em aberto."

  const lines = [`📋 *Pedidos de consultoria* (${data.length})`, ""]
  for (const r of data) {
    const name = r.subscriber?.name || r.subscriber?.email || "Cliente"
    const id8 = r.id.slice(0, 8)
    lines.push(`*${id8}* - ${STATUS_LABEL[r.status] || r.status}`)
    lines.push(`👤 ${name}`)
    if (r.status === "scheduled" && r.scheduled_at) {
      lines.push(`📅 ${formatScheduledAt(r.scheduled_at)}`)
    }
    const objShort = r.objetivo.length > 80 ? r.objetivo.slice(0, 80) + "…" : r.objetivo
    lines.push(`🎯 ${objShort}`)
    lines.push("")
  }
  return lines.join("\n")
}

/**
 * Mostra detalhes completos de um pedido.
 */
export async function viewConsultoria(idPrefix) {
  const id = await resolveRequestId(idPrefix)
  if (!id) return `❌ Pedido *${idPrefix}* nao encontrado.`
  if (id === "AMBIGUOUS") return `❌ Prefixo *${idPrefix}* ambiguo - use mais caracteres.`

  const supa = getSonnarClient()
  const { data, error } = await supa
    .from("consultoria_requests")
    .select("*, subscriber:subscribers(name, email, phone, plan)")
    .eq("id", id)
    .single()

  if (error || !data) return `❌ Erro ao buscar: ${error?.message || "not_found"}`

  const sub = data.subscriber || {}
  const lines = [
    `*🎯 Consultoria ${data.id.slice(0, 8)}*`,
    "",
    `*Status:* ${STATUS_LABEL[data.status] || data.status}`,
  ]
  if (data.scheduled_at) lines.push(`*Agendada:* ${formatScheduledAt(data.scheduled_at)}`)
  lines.push("")
  if (sub.name) lines.push(`*Cliente:* ${sub.name}`)
  if (sub.email) lines.push(`*Email:* ${sub.email}`)
  if (sub.phone) lines.push(`*Tel:* ${sub.phone}`)
  if (sub.plan) lines.push(`*Plano:* ${sub.plan}`)
  lines.push("")
  lines.push(`*LinkedIn:* ${data.linkedin_url}`)
  if (data.vaga_alvo_url) lines.push(`*Vaga-alvo:* ${data.vaga_alvo_url}`)
  if (data.cv_file_path) lines.push(`*CV:* arquivo anexado (${data.cv_file_name || "-"})`)
  lines.push("")
  lines.push(`*Objetivo:*`)
  lines.push(data.objetivo)
  if (data.admin_notes) {
    lines.push("")
    lines.push(`*Notas internas:*`)
    lines.push(data.admin_notes)
  }
  return lines.join("\n")
}

/**
 * Atualiza status do pedido. Faz transicoes validas.
 */
async function updateRequest(id, patch) {
  const supa = getSonnarClient()
  const { error } = await supa
    .from("consultoria_requests")
    .update(patch)
    .eq("id", id)
  return error
}

/**
 * agenda(id, "DD/MM HH:MM") -> scheduled. Tambem dispara mensagem pro
 * cliente notificando o horario combinado.
 */
export async function scheduleConsultoria(idPrefix, dateInput, socket) {
  const id = await resolveRequestId(idPrefix)
  if (!id) return `❌ Pedido *${idPrefix}* nao encontrado.`
  if (id === "AMBIGUOUS") return `❌ Prefixo *${idPrefix}* ambiguo.`

  const when = parseScheduledAt(dateInput)
  if (!when) return `⚠️ Formato invalido. Use \`DD/MM HH:MM\` (ex: 05/06 14:30).`

  const supa = getSonnarClient()
  const { data: req, error: getErr } = await supa
    .from("consultoria_requests")
    .select("id, subscriber:subscribers(name, wa_lid)")
    .eq("id", id)
    .single()
  if (getErr || !req) return `❌ Erro: ${getErr?.message || "not_found"}`

  const err = await updateRequest(id, {
    status: "scheduled",
    scheduled_at: when.toISOString(),
  })
  if (err) return `❌ Erro ao agendar: ${err.message}`

  // Notifica cliente se temos WA LID
  const clientLid = req.subscriber?.wa_lid
  if (clientLid && socket) {
    try {
      await socket.sendMessage(clientLid, {
        text:
          `*🎯 Consultoria agendada*\n\n` +
          `Sua consultoria foi marcada para *${formatScheduledAt(when.toISOString())}*.\n\n` +
          `Vou te chamar por aqui no horario. Qualquer mudanca, e so responder.`,
      })
    } catch (notifyErr) {
      errorLog(`[consultoriaAdmin] notify client falhou: ${notifyErr.message}`)
    }
  }

  return `✅ Pedido *${id.slice(0, 8)}* agendado para *${formatScheduledAt(when.toISOString())}*.`
}

/**
 * Marca como concluido.
 */
export async function completeConsultoria(idPrefix) {
  const id = await resolveRequestId(idPrefix)
  if (!id) return `❌ Pedido *${idPrefix}* nao encontrado.`
  if (id === "AMBIGUOUS") return `❌ Prefixo *${idPrefix}* ambiguo.`

  const err = await updateRequest(id, { status: "done" })
  if (err) return `❌ Erro: ${err.message}`
  return `✅ Pedido *${id.slice(0, 8)}* marcado como concluido.`
}

/**
 * Cancela um pedido.
 */
export async function cancelConsultoria(idPrefix) {
  const id = await resolveRequestId(idPrefix)
  if (!id) return `❌ Pedido *${idPrefix}* nao encontrado.`
  if (id === "AMBIGUOUS") return `❌ Prefixo *${idPrefix}* ambiguo.`

  const err = await updateRequest(id, { status: "cancelled" })
  if (err) return `❌ Erro: ${err.message}`
  return `⚫ Pedido *${id.slice(0, 8)}* cancelado.`
}

/**
 * Dispatcher chamado por adminCommands.
 *
 * Sub-formas suportadas:
 *   /consultoria abertos
 *   /consultoria <id8> ver
 *   /consultoria <id8> agendar DD/MM HH:MM
 *   /consultoria <id8> concluir
 *   /consultoria <id8> cancelar
 */
export async function handleConsultoriaCommand({ args, socket, jid }) {
  if (args.length === 0) {
    return socket.sendMessage(jid, {
      text:
        `⚠️ Uso:\n` +
        `\`/consultoria abertos\`\n` +
        `\`/consultoria <id> ver\`\n` +
        `\`/consultoria <id> agendar DD/MM HH:MM\`\n` +
        `\`/consultoria <id> concluir\`\n` +
        `\`/consultoria <id> cancelar\``,
    })
  }

  const first = args[0].toLowerCase()
  if (first === "abertos" || first === "list") {
    const text = await listOpenConsultorias()
    return socket.sendMessage(jid, { text })
  }

  // Forma /consultoria <id> <acao> [...args]
  const [idPrefix, action, ...rest] = args
  if (!action) {
    return socket.sendMessage(jid, {
      text: `⚠️ Especifique a acao: ver, agendar, concluir, cancelar.`,
    })
  }

  let result
  switch (action.toLowerCase()) {
    case "ver":
    case "show":
      result = await viewConsultoria(idPrefix)
      break
    case "agendar":
    case "schedule":
      result = await scheduleConsultoria(idPrefix, rest.join(" "), socket)
      break
    case "concluir":
    case "done":
      result = await completeConsultoria(idPrefix)
      break
    case "cancelar":
    case "cancel":
      result = await cancelConsultoria(idPrefix)
      break
    default:
      result = `❓ Acao *${action}* desconhecida. Use ver | agendar | concluir | cancelar.`
  }

  return socket.sendMessage(jid, { text: result })
}

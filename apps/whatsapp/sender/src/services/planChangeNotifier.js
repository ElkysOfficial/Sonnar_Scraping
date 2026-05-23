/**
 * Plan Change Notifier
 *
 * Consome a fila wa_plan_notifications (alimentada pelo stripe-webhook) e
 * envia DM privada para o assinante explicando a mudança de plano efetivada.
 *
 * Eventos:
 *  - plan_upgraded_to_plus    : Pro -> Plus (imediato). Sai do grupo, entra
 *                               no privado com IA.
 *  - plan_downgraded_to_pro   : Plus -> Pro (fim do periodo). Sai do
 *                               privado, link pro grupo Pro.
 *  - plan_canceled_to_free    : Pro/Plus -> Free (cancelamento). Sai do
 *                               canal pago, volta pra Comunidade publica.
 *
 * Idempotencia: a tabela tem UNIQUE (stripe_event_id, event_type) e marca
 * status='sent' apos envio. Reenvios sao ignorados.
 *
 * @author Sonar Bot
 */
import { supabase } from "./database.js"
import { getCurrentSocket, isCurrentSocketReady } from "../utils/socketManager.js"
import { JOB_GROUP_LINK } from "../config.js"
import { infoLog, infoLogAlways, successLog, warningLog, errorLog } from "../utils/logger.js"

// Intervalo entre tentativas de drenagem. Curto o suficiente pra que a
// notificacao chegue logo apos o webhook gravar, longo o suficiente pra
// nao spammar quando a fila estiver vazia (raro).
const POLL_INTERVAL_MS = 20_000

// Maximo de tentativas antes de marcar 'failed' definitivo.
const MAX_ATTEMPTS = 5

const PORTAL_URL = "https://sonnarjobs.com.br"
const COMMUNITY_LINK = `${PORTAL_URL}/#comunidade`

/**
 * Converte LID (123@lid) em JID enviavel (123@s.whatsapp.net).
 * Mantem JID ja normalizado intacto.
 */
function lidToJid(lid) {
  if (!lid) return null
  if (lid.includes("@s.whatsapp.net")) return lid
  const number = lid.replace("@lid", "").replace(/[^\d]/g, "")
  if (!number) return null
  return `${number}@s.whatsapp.net`
}

/**
 * Monta o texto da DM conforme o event_type. Cada mensagem termina com
 * link pro portal pro caso do cliente querer revisar a assinatura.
 */
function buildMessage(eventType) {
  switch (eventType) {
    case "plan_upgraded_to_plus":
      return [
        "🚀 *Upgrade concluído!*",
        "",
        "Você agora está no plano *Plus*. A partir de agora as vagas chegam *aqui no seu privado*, filtradas pela IA com base no seu perfil — com *match score 0–100* em cada uma.",
        "",
        "Você sai do grupo Pro (lá vão todas as vagas, sem filtro). Aqui, só o que combina com você.",
        "",
        `Detalhes da assinatura: ${PORTAL_URL}/dashboard/assinatura`
      ].join("\n")

    case "plan_downgraded_to_pro":
      return [
        "📢 *Mudança de plano efetivada*",
        "",
        "A partir de hoje sua assinatura virou *Pro*. Você *não recebe mais vagas no privado* — agora elas chegam no *grupo exclusivo Pro* do WhatsApp, com todas as vagas de TI (sem filtro pelo seu perfil).",
        "",
        `👥 Entre no grupo: ${JOB_GROUP_LINK}`,
        "",
        `Detalhes da assinatura: ${PORTAL_URL}/dashboard/assinatura`
      ].join("\n")

    case "plan_canceled_to_free":
      return [
        "👋 *Sua assinatura foi encerrada*",
        "",
        "O período pago acabou e sua conta voltou pro plano *Comunidade* (gratuito). Você *não recebe mais vagas* no privado nem no grupo Pro.",
        "",
        "Quando quiser voltar, é só reativar sua assinatura no portal.",
        "",
        `🌐 Comunidade: ${COMMUNITY_LINK}`,
        `🔄 Reativar: ${PORTAL_URL}/dashboard/assinatura`
      ].join("\n")

    default:
      return null
  }
}

/**
 * Drena ate N notificacoes pendentes da fila. Roda em loop pelo
 * startPlanChangeNotifier.
 */
async function drainPending(socket) {
  if (!isCurrentSocketReady()) return

  const { data: pending, error } = await supabase
    .from("wa_plan_notifications")
    .select("id, lid, event_type, attempts")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(10)

  if (error) {
    errorLog(`[PLAN-NOTIFY] erro ao buscar pendentes: ${error.message}`)
    return
  }
  if (!pending || pending.length === 0) return

  for (const row of pending) {
    const text = buildMessage(row.event_type)
    if (!text) {
      await supabase
        .from("wa_plan_notifications")
        .update({ status: "skipped", error: `unknown event_type: ${row.event_type}` })
        .eq("id", row.id)
      warningLog(`[PLAN-NOTIFY] event_type desconhecido (${row.event_type}); marcado skipped`)
      continue
    }

    const jid = lidToJid(row.lid)
    if (!jid) {
      await supabase
        .from("wa_plan_notifications")
        .update({ status: "skipped", error: "invalid lid" })
        .eq("id", row.id)
      warningLog(`[PLAN-NOTIFY] lid invalido (${row.lid}); marcado skipped`)
      continue
    }

    try {
      await socket.sendMessage(jid, { text })
      await supabase
        .from("wa_plan_notifications")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq("id", row.id)
      successLog(`[PLAN-NOTIFY] ${row.event_type} -> ${jid} ok`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const nextAttempts = row.attempts + 1
      const finalStatus = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending"
      await supabase
        .from("wa_plan_notifications")
        .update({
          status: finalStatus,
          attempts: nextAttempts,
          error: message
        })
        .eq("id", row.id)
      errorLog(
        `[PLAN-NOTIFY] falha ao enviar ${row.event_type} (attempt ${nextAttempts}/${MAX_ATTEMPTS}): ${message}`
      )
    }

    // Pequeno respiro entre envios pra nao bater rate-limit do Baileys.
    await new Promise((r) => setTimeout(r, 800))
  }
}

/**
 * Inicia o worker. Chamado pelo loader.
 */
export function startPlanChangeNotifier(socket) {
  // infoLogAlways - precisa aparecer no boot em prod (LOG_LEVEL=success
  // suprime infoLog regular).
  infoLogAlways("[PLAN-NOTIFY] worker iniciado (polling " + (POLL_INTERVAL_MS / 1000) + "s)")

  // Drena imediatamente caso ja haja itens pendentes na inicializacao.
  drainPending(socket).catch((e) =>
    errorLog(`[PLAN-NOTIFY] erro no drain inicial: ${e?.message ?? e}`)
  )

  setInterval(() => {
    drainPending(socket).catch((e) =>
      errorLog(`[PLAN-NOTIFY] erro no drain: ${e?.message ?? e}`)
    )
  }, POLL_INTERVAL_MS)
}

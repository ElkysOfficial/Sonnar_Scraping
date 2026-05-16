/**
 * WhatsApp Linker Service — pareamento do Fluxo A (assinante do portal).
 *
 * Quando um assinante envia "parear <token>" ao bot, este servico chama a
 * edge function link-whatsapp do portal, que valida o token e grava o wa_lid
 * em subscriber_profiles. A partir dai o bot identifica o assinante lendo
 * subscribers/subscriber_profiles direto (ver utils/database.js) — NAO ha
 * mais copia local em vip_subscribers para o Fluxo A.
 *
 * @author Sonar Bot
 */
import axios from "axios"
import { WEB_FUNCTIONS_URL, WHATSAPP_LINK_SECRET } from "../config.js"
import { buildVipFiltersFromPortal } from "../utils/portalProfile.js"
import { infoLog, errorLog } from "../utils/logger.js"

/**
 * Valida o token de pareamento contra o portal.
 *
 * @param {{ token: string, lid: string }} params
 * @returns {Promise<
 *   { ok: true, name: string, plan: string, filters: Object } |
 *   { ok: false, reason: string }
 * >}
 */
export async function pairSubscriberByToken({ token, lid }) {
  if (!WEB_FUNCTIONS_URL || !WHATSAPP_LINK_SECRET) {
    errorLog("[PAREAMENTO] WEB_FUNCTIONS_URL ou WHATSAPP_LINK_SECRET nao configurados")
    return { ok: false, reason: "not_configured" }
  }

  let resp
  try {
    resp = await axios.post(
      `${WEB_FUNCTIONS_URL.replace(/\/$/, "")}/link-whatsapp`,
      { token, lid },
      {
        headers: {
          "x-link-secret": WHATSAPP_LINK_SECRET,
          "Content-Type": "application/json"
        },
        timeout: 15000,
        validateStatus: () => true
      }
    )
  } catch (err) {
    errorLog(`[PAREAMENTO] Falha de rede ao chamar link-whatsapp: ${err.message}`)
    return { ok: false, reason: "network_error" }
  }

  if (resp.status !== 200 || !resp.data?.ok) {
    const reason = resp.data?.error || `http_${resp.status}`
    infoLog(`[PAREAMENTO] Token ${token} recusado: ${reason}`)
    return { ok: false, reason }
  }

  const sub = resp.data.subscriber || {}
  const filters = buildVipFiltersFromPortal(sub)
  const name = sub.name || "Assinante Sonnar"
  const plan = sub.plan || "free"

  infoLog(`[PAREAMENTO] ${name} (plano ${plan}) vinculado ao LID ${lid}`)
  return { ok: true, name, plan, filters }
}

export default { pairSubscriberByToken }

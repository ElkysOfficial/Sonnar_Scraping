/**
 * Criação de conta no portal para assinantes do Fluxo B (WhatsApp).
 *
 * Ao aprovar um VIP captado pelo WhatsApp, o bot chama a edge function
 * invite-whatsapp-subscriber do portal. Ela cria a conta (auth.users +
 * subscribers + subscriber_profiles), com senha temporária, e envia o
 * e-mail de convite com login + senha. No primeiro acesso o portal força
 * a troca da senha.
 */
import axios from "axios"
import { WEB_FUNCTIONS_URL, WHATSAPP_LINK_SECRET } from "../config.js"
import { infoLog, errorLog } from "../utils/logger.js"

// workMode do bot -> work_models do portal
const WORK_MODE_TO_PORTAL = { remoto: "remote", hibrido: "hybrid", presencial: "onsite" }
const VALID_SENIORITY = ["junior", "pleno", "senior", "staff_lead"]

/**
 * Converte os filtros VIP do bot no perfil de busca do portal
 * (shape de subscriber_profiles).
 */
function filtersToPortalProfile(filters, phone) {
  const f = filters || {}

  const workModels = [
    ...new Set((f.workMode || []).map((w) => WORK_MODE_TO_PORTAL[w]).filter(Boolean))
  ]
  // Remoto eh sempre incluido (subscriber_profiles exige >= 1 work_model).
  if (!workModels.includes("remote")) workModels.unshift("remote")

  // O portal aceita uma unica senioridade; o bot coleta varias.
  const firstSeniority = (f.seniority || [])[0]
  const seniority = VALID_SENIORITY.includes(firstSeniority) ? firstSeniority : "pleno"

  return {
    whatsapp: (phone || "").toString().trim() || "nao informado",
    areas: Array.isArray(f.areas) ? f.areas : [],
    stack: Array.isArray(f.stacks) && f.stacks.length ? f.stacks : ["geral"],
    seniority,
    work_models: workModels,
    min_salary: null,
    location: (Array.isArray(f.locations) && f.locations[0]) || null
  }
}

/**
 * Cria a conta do portal para um assinante do Fluxo B (via edge function
 * invite-whatsapp-subscriber) e dispara o convite por e-mail.
 *
 * @param {{ email: string, name: string, lid: string, phone: string, filters: Object }} params
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function createPortalAccountForVip({ email, name, lid, phone, filters }) {
  const cleanEmail = (email || "").toString().trim().toLowerCase()
  if (!cleanEmail) return { ok: false, reason: "no_email" }

  if (!WEB_FUNCTIONS_URL || !WHATSAPP_LINK_SECRET) {
    errorLog("[PORTAL] WEB_FUNCTIONS_URL ou WHATSAPP_LINK_SECRET nao configurados")
    return { ok: false, reason: "not_configured" }
  }

  let resp
  try {
    resp = await axios.post(
      `${WEB_FUNCTIONS_URL.replace(/\/$/, "")}/invite-whatsapp-subscriber`,
      {
        email: cleanEmail,
        name: (name || "").toString().trim(),
        lid,
        profile: filtersToPortalProfile(filters, phone)
      },
      {
        headers: {
          "x-link-secret": WHATSAPP_LINK_SECRET,
          "Content-Type": "application/json"
        },
        timeout: 20000,
        validateStatus: () => true
      }
    )
  } catch (err) {
    errorLog(`[PORTAL] Falha de rede ao criar conta: ${err.message}`)
    return { ok: false, reason: "network_error" }
  }

  if (resp.status === 200 && resp.data?.ok) {
    infoLog(`[PORTAL] Conta criada e convite enviado para ${cleanEmail} (lid ${lid})`)
    return { ok: true }
  }

  const reason = resp.data?.error || `http_${resp.status}`
  if (reason !== "email_exists") {
    errorLog(`[PORTAL] invite-whatsapp-subscriber recusou: ${reason}`)
  }
  return { ok: false, reason }
}

export default { createPortalAccountForVip }

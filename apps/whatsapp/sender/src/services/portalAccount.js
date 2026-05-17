/**
 * Criação de conta no portal para assinantes do Fluxo B (WhatsApp).
 *
 * Quem assina pelo WhatsApp também ganha acesso ao portal: ao aprovar o VIP,
 * criamos um auth.users via convite por e-mail. O trigger handle_new_user
 * gera subscribers + subscriber_profiles a partir do metadata. Depois
 * marcamos a assinatura como ativa e vinculamos o wa_lid para o bot
 * reconhecer o assinante também pelo Fluxo A.
 */
import { supabase } from "./database.js"
import { PORTAL_URL } from "../config.js"
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
 * Cria a conta do portal para um assinante do Fluxo B e dispara o convite
 * de definicao de senha por e-mail.
 *
 * @param {{ email: string, name: string, lid: string, phone: string, filters: Object }} params
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function createPortalAccountForVip({ email, name, lid, phone, filters }) {
  const cleanEmail = (email || "").toString().trim().toLowerCase()
  if (!cleanEmail) return { ok: false, reason: "no_email" }

  const metadata = {
    name: (name || "").toString().trim() || "Assinante Sonnar",
    plan: "plus",
    profile: filtersToPortalProfile(filters, phone)
  }

  let invite
  try {
    invite = await supabase.auth.admin.inviteUserByEmail(cleanEmail, {
      data: metadata,
      redirectTo: PORTAL_URL
    })
  } catch (err) {
    errorLog(`[PORTAL] Falha ao convidar ${cleanEmail}: ${err.message}`)
    return { ok: false, reason: "invite_failed" }
  }

  if (invite.error) {
    const msg = invite.error.message || ""
    if (/already|registered|exist/i.test(msg)) {
      return { ok: false, reason: "email_exists" }
    }
    errorLog(`[PORTAL] inviteUserByEmail erro: ${msg}`)
    return { ok: false, reason: "invite_failed" }
  }

  const userId = invite.data?.user?.id

  // O trigger handle_new_user ja criou subscribers + subscriber_profiles.
  // Marca a assinatura como ativa e vincula o wa_lid (nao-fatal se falhar).
  try {
    if (userId) {
      await supabase.from("subscribers").update({ status: "active" }).eq("user_id", userId)
      const { data: sub } = await supabase
        .from("subscribers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle()
      if (sub?.id) {
        await supabase
          .from("subscriber_profiles")
          .update({ wa_lid: lid, wa_linked_at: new Date().toISOString() })
          .eq("subscriber_id", sub.id)
      }
    }
    await supabase
      .from("vip_subscribers")
      .update({ portal_linked_at: new Date().toISOString() })
      .eq("lid", lid)
  } catch (err) {
    errorLog(`[PORTAL] Conta criada mas pos-ajuste falhou: ${err.message}`)
  }

  infoLog(`[PORTAL] Conta criada e convite enviado para ${cleanEmail} (lid ${lid})`)
  return { ok: true }
}

export default { createPortalAccountForVip }

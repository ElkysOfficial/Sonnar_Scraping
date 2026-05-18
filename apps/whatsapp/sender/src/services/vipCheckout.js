/**
 * Geração do Checkout recorrente (cartão) para o VIP do WhatsApp (Fluxo B).
 *
 * Chama a edge function create-vip-checkout, que cria a sessão de Checkout
 * do Stripe (assinatura) amarrada ao LID do lead. A partir daí o pagamento
 * e a ativação do VIP são automáticos — o stripe-webhook ativa o assinante
 * sem comprovante nem aprovação manual.
 */
import axios from "axios"
import { WEB_FUNCTIONS_URL, WHATSAPP_LINK_SECRET } from "../config.js"
import { errorLog, infoLog } from "../utils/logger.js"

/**
 * Cria o Checkout recorrente de cartão para um lead VIP.
 *
 * @param {{ lid: string, name: string, email: string, phone?: string, filters?: Object }} params
 * @returns {Promise<{ ok: true, checkoutUrl: string } | { ok: false, reason: string }>}
 */
export async function createVipCheckout({ lid, name, email, phone, filters }) {
  const cleanEmail = (email || "").toString().trim().toLowerCase()
  const cleanName = (name || "").toString().trim()
  if (!lid || !cleanEmail || !cleanName) {
    return { ok: false, reason: "missing_fields" }
  }

  if (!WEB_FUNCTIONS_URL || !WHATSAPP_LINK_SECRET) {
    errorLog("[VIP CHECKOUT] WEB_FUNCTIONS_URL ou WHATSAPP_LINK_SECRET nao configurados")
    return { ok: false, reason: "not_configured" }
  }

  let resp
  try {
    resp = await axios.post(
      `${WEB_FUNCTIONS_URL.replace(/\/$/, "")}/create-vip-checkout`,
      {
        lid,
        name: cleanName,
        email: cleanEmail,
        phone: phone || null,
        filters: filters || {}
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
    errorLog(`[VIP CHECKOUT] Falha de rede: ${err.message}`)
    return { ok: false, reason: "network_error" }
  }

  if (resp.status === 200 && resp.data?.checkoutUrl) {
    infoLog(`[VIP CHECKOUT] Checkout gerado para lid ${lid}`)
    return { ok: true, checkoutUrl: resp.data.checkoutUrl }
  }

  const reason = resp.data?.error || `http_${resp.status}`
  errorLog(`[VIP CHECKOUT] create-vip-checkout recusou: ${reason}`)
  return { ok: false, reason }
}

export default { createVipCheckout }

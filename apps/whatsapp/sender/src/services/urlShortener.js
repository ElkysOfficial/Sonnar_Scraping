/**
 * Encurtador de URL do Sonnar para o bot do WhatsApp.
 *
 * Chama a edge function shorten-url, que gera (ou reaproveita) um link
 * curto sonnarjobs.com.br/v/<code>. Usado para encurtar URLs longas
 * antes de enviar ao usuario (ex.: o link de Checkout do Stripe).
 *
 * Degradacao graciosa: se o servico falhar, nao estiver configurado ou
 * demorar demais, devolve a URL original — nunca bloqueia o envio.
 */
import { WEB_FUNCTIONS_URL, WHATSAPP_LINK_SECRET } from "../config.js"
import { errorLog } from "../utils/logger.js"

const TIMEOUT_MS = 8000

/**
 * Encurta uma URL. Retorna a URL curta ou, em qualquer falha, a original.
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function shortenUrl(url) {
  const original = (url || "").toString().trim()
  if (!/^https?:\/\//i.test(original)) return original
  if (!WEB_FUNCTIONS_URL || !WHATSAPP_LINK_SECRET) {
    errorLog("[SHORTENER] WEB_FUNCTIONS_URL ou WHATSAPP_LINK_SECRET ausentes — URL nao encurtada")
    return original
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${WEB_FUNCTIONS_URL.replace(/\/$/, "")}/shorten-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-link-secret": WHATSAPP_LINK_SECRET
      },
      body: JSON.stringify({ url: original }),
      signal: controller.signal
    })
    if (!res.ok) {
      errorLog(`[SHORTENER] shorten-url respondeu ${res.status}`)
      return original
    }
    const data = await res.json()
    return data?.shortUrl || original
  } catch (err) {
    errorLog(`[SHORTENER] Falha ao encurtar URL: ${err.message}`)
    return original
  } finally {
    clearTimeout(timer)
  }
}

export default { shortenUrl }

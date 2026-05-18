/**
 * Encurtador de URL próprio do Sonnar.
 *
 * Chama a edge function shorten-url, que gera (ou reaproveita) um link
 * curto sonnarjobs.com.br/v/<code>. Diferente dos encurtadores gratuitos
 * removidos em fce25a0, este é interno e no domínio do projeto.
 *
 * Degradação graciosa: se o serviço falhar, não estiver configurado ou
 * demorar demais, devolve a URL original — nunca bloqueia o envio da vaga.
 */
import { errorLog } from "../utils/logger.js"

const WEB_FUNCTIONS_URL = process.env.WEB_FUNCTIONS_URL || ""
const LINK_SECRET = process.env.WHATSAPP_LINK_SECRET || ""
const TIMEOUT_MS = 8000

/**
 * Encurta uma URL. Retorna a URL curta ou, em qualquer falha, a original.
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function shortenUrl(url) {
  const original = (url || "").toString().trim()
  if (!/^https?:\/\//i.test(original)) return original
  if (!WEB_FUNCTIONS_URL || !LINK_SECRET) return original

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${WEB_FUNCTIONS_URL.replace(/\/$/, "")}/shorten-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-link-secret": LINK_SECRET
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

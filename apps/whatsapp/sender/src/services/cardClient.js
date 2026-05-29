/**
 * Cliente do card-renderer (Vercel Edge Function). Substituiu o `fetchJobCard`
 * que apontava pro `localhost:3001` (formatter na VPS) quando a geracao de
 * imagem foi movida pra fora da VPS.
 *
 * Fluxo:
 *   1. Recebe a vaga (objeto job).
 *   2. Normaliza pra `JobCardData` (mesmo shape que o Edge espera).
 *   3. Serializa em base64url e assina com HMAC-SHA256 + secret compartilhado.
 *   4. Faz GET na URL — `Cache-Control: immutable` na Edge garante que a partir
 *      da 2a chamada com mesma URL a CDN devolve direto, funcao nem executa.
 *   5. Devolve o buffer PNG pronto pro Baileys.
 *
 * Falha silenciosa: se a Edge der erro, devolve null e o caller cai no fluxo
 * de "card_generation_failed" (mesma semantica que o formatter antigo).
 */

import "dotenv/config"
import axios from "axios"
import crypto from "node:crypto"
import { CARD_RENDERER_URL, CARD_RENDERER_SECRET } from "../config.js"
import { extractJobDataFromEmbed, resolveEmbedPayload } from "./captionBuilder.js"
import { errorLog, warningLog } from "../utils/logger.js"

const HTTP_TIMEOUT = 30_000

function toBase64Url(s) {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function sign(payload) {
  return crypto.createHmac("sha256", CARD_RENDERER_SECRET).update(payload).digest("hex")
}

/**
 * Reduz o jobData ao subset que o card renderiza. Mantemos o payload minimo
 * pra (a) caber em querystring sem estourar limites de URL (~8KB efetivos em
 * proxies) e (b) garantir cache HIT mesmo se a vaga vier com campos opcionais
 * inconsistentes entre origens.
 */
function pickCardPayload(jobData) {
  return {
    title: jobData.title || "",
    company: jobData.company || "",
    location: jobData.location || "",
    mode: jobData.mode || "PRESENCIAL",
    uf: jobData.uf || "",
    salary: jobData.salary || "",
    salaryNote: jobData.salaryNote || "",
    tags: Array.isArray(jobData.tags) ? jobData.tags.slice(0, 5) : [],
    source: jobData.source || "via Sonar",
    date: jobData.date || "",
    time: jobData.time || ""
  }
}

/**
 * Monta a URL assinada do card-renderer.
 * URL e deterministica por payload — mesmo job = mesma URL = HIT CDN.
 */
export function buildCardUrl(jobData) {
  if (!CARD_RENDERER_URL) {
    throw new Error("CARD_RENDERER_URL nao configurada")
  }
  if (!CARD_RENDERER_SECRET) {
    throw new Error("CARD_RENDERER_SECRET nao configurada")
  }
  const payload = pickCardPayload(jobData)
  const data = toBase64Url(JSON.stringify(payload))
  const token = sign(data)
  return `${CARD_RENDERER_URL.replace(/\/+$/, "")}/api/card?data=${data}&token=${token}`
}

/**
 * Busca a imagem PNG renderizada pela Edge Function.
 * @param {Object} job - vaga (qualquer shape aceito por resolveEmbedPayload)
 * @returns {Promise<{ imageBuffer: Buffer, jobData: Object } | null>}
 */
export async function fetchJobCardImage(job) {
  const embed = resolveEmbedPayload(job)
  if (!embed) {
    warningLog("[CARD] Payload da vaga invalido — nao foi possivel montar embed")
    return null
  }

  const jobData = extractJobDataFromEmbed(embed)
  if (!jobData) {
    warningLog("[CARD] Nao foi possivel extrair dados da vaga")
    return null
  }

  let url
  try {
    url = buildCardUrl(jobData)
  } catch (err) {
    errorLog(`[CARD] Falha ao montar URL: ${err.message}`)
    return null
  }

  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: HTTP_TIMEOUT,
      validateStatus: (s) => s === 200
    })
    return { imageBuffer: Buffer.from(res.data), jobData }
  } catch (err) {
    errorLog(`[CARD] Render falhou (${err.response?.status || "ERR"}): ${err.message}`)
    return null
  }
}

export default { buildCardUrl, fetchJobCardImage }

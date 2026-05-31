/**
 * imageCardSender.js — v3.10.21
 *
 * Envia vaga como IMAGEM (PNG 1080x1080 gerada via Supabase Edge Function
 * `render-job-card` usando Satori + resvg-wasm). ZERO carga na VPS:
 *
 *   wa-sender (VPS)        Supabase Edge (cloud)         Supabase Storage
 *   ───────────────        ─────────────────────         ────────────────
 *   POST /functions/v1/render-job-card { jobId }
 *                       →
 *                          Satori (JSX → SVG)
 *                          resvg-wasm (SVG → PNG)
 *                          Upload pro Storage
 *                       ←
 *                          { url: "https://.../job-cards/<id>.png" }
 *
 *   fetch URL → buffer
 *   socket.sendMessage(jid, { image: buffer, caption })
 *
 * Cache: a Edge Function checa se ja existe no Storage antes de renderizar.
 * Vagas ja enviadas para um cliente vao reutilizar a mesma imagem instantaneo.
 *
 * Flag de ativacao: env VIP_SEND_AS_IMAGE=true. Default false (preserva o
 * fluxo de texto puro v3.9.0).
 */
import axios from "axios"
import { errorLog, infoLog, successLog } from "../utils/logger.js"

const SUPABASE_URL = process.env.SUPABASE_URL || ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const VIP_SEND_AS_IMAGE = String(process.env.VIP_SEND_AS_IMAGE || "false").toLowerCase() === "true"

const RENDER_ENDPOINT = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/render-job-card`
  : ""

const httpClient = axios.create({ timeout: 30000 })

/**
 * Verdadeiro quando a feature esta habilitada e configurada.
 * Sem service-role key ou sem SUPABASE_URL, o helper desliga sozinho.
 */
export function isImageSendingEnabled() {
  return VIP_SEND_AS_IMAGE && Boolean(RENDER_ENDPOINT) && Boolean(SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * Pede pra Edge Function gerar (ou recuperar do cache) a imagem da vaga.
 *
 * @param {string} jobId
 * @param {object} [jobData] payload opcional pra evitar lookup no DB
 *   (a Edge Function busca em `public.jobs` quando ausente)
 * @returns {Promise<{url: string, cached: boolean} | null>}
 */
export async function renderJobCard(jobId, jobData = null) {
  if (!RENDER_ENDPOINT || !SUPABASE_SERVICE_ROLE_KEY) {
    errorLog("[imageCardSender] SUPABASE_URL ou SERVICE_ROLE_KEY ausente — render desabilitado")
    return null
  }
  try {
    const body = jobData ? { jobId, jobData } : { jobId }
    const { data } = await httpClient.post(RENDER_ENDPOINT, body, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    })
    if (!data?.url) {
      errorLog(`[imageCardSender] resposta sem url: ${JSON.stringify(data).slice(0, 200)}`)
      return null
    }
    return { url: data.url, cached: Boolean(data.cached) }
  } catch (err) {
    errorLog(`[imageCardSender] render falhou para ${jobId}: ${err.message}`)
    return null
  }
}

/**
 * Baixa o PNG da URL pública do Storage. Retorna o Buffer pronto pra
 * `socket.sendMessage(jid, { image: buffer })`.
 */
export async function downloadCard(url) {
  try {
    const { data } = await httpClient.get(url, { responseType: "arraybuffer" })
    return Buffer.from(data)
  } catch (err) {
    errorLog(`[imageCardSender] download falhou: ${err.message}`)
    return null
  }
}

/**
 * Envia uma vaga como imagem para o jid, com caption textual.
 *
 * Caption inclui titulo + empresa + link curto (passado em options.shortUrl).
 * Em caso de qualquer falha (render, download, sendMessage), retorna false
 * e o caller deve fazer fallback para texto puro.
 *
 * @param {string} jid
 * @param {object} job  formato em-banco (id, job_title, company, ...)
 * @param {object} options
 * @param {string} options.caption  texto curto que vai abaixo da imagem
 * @param {object} options.socket   socket Baileys
 * @param {function} [options.delay] injecao p/ testes
 * @returns {Promise<boolean>}
 */
export async function sendJobAsImage(jid, job, options) {
  const { caption, socket, delay } = options
  if (!socket?.sendMessage) return false
  if (!job?.id) return false

  const rendered = await renderJobCard(job.id, jobToCardData(job))
  if (!rendered) return false

  const png = await downloadCard(rendered.url)
  if (!png) return false

  try {
    if (typeof delay === "function") {
      await delay()
    }
    await socket.sendMessage(jid, {
      image: png,
      caption: caption || "",
    })
    if (!rendered.cached) {
      infoLog(`[imageCardSender] card gerado: ${rendered.url}`)
    }
    successLog(`[imageCardSender] vaga ${job.id} enviada como imagem para ${jid}`)
    return true
  } catch (err) {
    errorLog(`[imageCardSender] sendMessage falhou: ${err.message}`)
    return false
  }
}

/**
 * Converte um job no shape do DB (snake_case) para o payload aceito pela
 * Edge Function — economiza um lookup quando o caller ja tem a vaga em mao.
 */
function jobToCardData(job) {
  return {
    job_title: job.job_title || job.title || "",
    company: job.company || "",
    location_raw: job.location_raw || job.location || "",
    state_code: job.state_code || "",
    country_code: job.country_code || "",
    work_type: job.work_type || "",
    hiring_regime: job.hiring_regime || "",
    salary_raw: job.salary_raw || job.salary || "",
    skills: Array.isArray(job.skills) ? job.skills : [],
    source: job.source || "",
  }
}

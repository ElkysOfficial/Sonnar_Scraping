/**
 * Loop de envio de uma vaga por intervalo pro grupo geral (JOB_GROUP_ID).
 * Independente do loop VIP (vipJobSender.js).
 *
 * v3.6.0: deixou de chamar o formatter (`localhost:3001/cards/next`) — agora
 * busca a vaga direto no core (`message-formatting-core`), monta a mensagem
 * em texto puro localmente (textBuilder + shortener) e envia. Geracao de
 * imagem foi removida do produto.
 *
 * Nome do arquivo mantido (`cardJobSender.js`) pra nao quebrar import em
 * `loader.js`.
 */

import "dotenv/config"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { JOB_GROUP_ID, JOB_SEND_INTERVAL, GROUP_SEND_AS_IMAGE } from "../config.js"
import { getCurrentSocket, isCurrentSocketReady } from "../utils/socketManager.js"
import { getSenderState, updateSenderState } from "./database.js"
import { fetchPendingJobs, markJobStatus } from "./coreClient.js"
import { extractJobDataFromEmbed, resolveEmbedPayload, formatJobMessage } from "./textBuilder.js"
import { shortenUrl } from "./urlShortener.js"
import { isImageSendingEnabled, sendJobAsImage } from "./imageCardSender.js"

const FIXED_INTERVAL = JOB_SEND_INTERVAL || 5 * 60 * 1000

let cardSenderTimeoutId = null
let cardSenderToken = 0

async function readCardSenderState() {
  try {
    const state = await getSenderState("card")
    return {
      lastSentAt: state?.last_sent_at ? new Date(state.last_sent_at).getTime() : 0
    }
  } catch (err) {
    errorLog(`Error reading card sender state: ${err.message}`)
    return { lastSentAt: 0 }
  }
}

async function writeCardSenderState(lastSentAt) {
  try {
    await updateSenderState("card", new Date(lastSentAt))
  } catch (err) {
    errorLog(`Error saving card sender state: ${err.message}`)
  }
}

async function getTimeUntilNextSend() {
  const state = await readCardSenderState()
  const now = Date.now()
  const elapsed = now - state.lastSentAt
  if (elapsed >= FIXED_INTERVAL) return 5000
  return Math.max(5000, FIXED_INTERVAL - elapsed)
}

/**
 * Defaults das dependencias externas. Em producao usa os imports do modulo;
 * em testes (`src/test/cardJobSender.test.js`) sao sobrescritos.
 */
const defaultDeps = Object.freeze({
  fetchPendingJobs,
  markJobStatus,
  shortenUrl,
  getCurrentSocket,
  isCurrentSocketReady,
  writeCardSenderState,
  jobGroupId: JOB_GROUP_ID,
})

/**
 * Busca a proxima vaga pendente direto do core e monta a mensagem em texto.
 *
 * @param {object} [deps] - injecao opcional pra testes
 */
async function buildNextJobMessage(deps = defaultDeps) {
  const pending = await deps.fetchPendingJobs(1)
  const job = pending[0]
  if (!job) return null

  const embed = resolveEmbedPayload(job)
  if (!embed) {
    warningLog(`[CARD] Payload invalido para job ${job.id || job.url}`)
    return null
  }

  const jobData = extractJobDataFromEmbed(embed)
  if (!jobData) {
    warningLog(`[CARD] Nao foi possivel extrair dados de ${job.id || job.url}`)
    return null
  }

  try {
    const shortUrl = await deps.shortenUrl(jobData.url)
    // v3.10.36: grupo Pro usa formato LITE - simples e direto.
    //   text = fallback de texto puro (sem imagem)
    //   textCompact = caption quando vai com imagem
    // Ambos usam o modo lite (sem salario, sem match, sem responsabilidades,
    // sem rodape de data). Audiencia do grupo eh heterogenea.
    const text = formatJobMessage(jobData, shortUrl, { lite: true })
    const textCompact = formatJobMessage(jobData, shortUrl, { lite: true })
    return { jobId: jobData.id || job.id || null, text, textCompact, jobData }
  } catch (err) {
    errorLog(`[CARD] Erro ao montar mensagem: ${err.message}`)
    return null
  }
}

async function sendJobMessage(message, deps = defaultDeps) {
  try {
    const socket = deps.getCurrentSocket()
    if (!deps.isCurrentSocketReady()) {
      warningLog("[CARD] Connection closed. Waiting for reconnection.")
      return false
    }

    // v3.10.31: tenta imagem + caption enxuto. Em falha cai pro texto puro.
    if (GROUP_SEND_AS_IMAGE && isImageSendingEnabled() && message.jobData) {
      try {
        const ok = await sendJobAsImage(deps.jobGroupId, message.jobData, {
          caption: message.textCompact || message.text,
          socket,
        })
        if (ok) return true
      } catch (err) {
        warningLog(`[CARD] Falha no envio como imagem, caindo pra texto: ${err.message}`)
      }
    }

    await socket.sendMessage(deps.jobGroupId, { text: message.text })
    return true
  } catch (error) {
    errorLog(`Error sending card message: ${error.message}`)
    return false
  }
}

async function processNextCard(deps = defaultDeps) {
  infoLog("[CARD] Starting card processing...")
  if (!deps.isCurrentSocketReady()) {
    warningLog("[CARD] Connection closed. Waiting for reconnection.")
    return
  }

  const message = await buildNextJobMessage(deps)
  if (!message) {
    infoLog("[CARD] No pending cards available")
    return
  }

  infoLog(`[CARD] Sending card for job: ${message.jobId}`)
  const success = await sendJobMessage(message, deps)

  if (success) {
    if (message.jobId) {
      await deps.markJobStatus(message.jobId, "whatsapp", true)
    }
    await deps.writeCardSenderState(Date.now())
    const timestamp = new Date().toISOString()
    successLog(`[CARD] Card sent successfully for job: ${message.jobId} at ${timestamp}`)
  }
}

function scheduleNextCard() {
  const token = cardSenderToken
  const interval = FIXED_INTERVAL
  const minutes = Math.floor(interval / 60000)
  const seconds = Math.floor((interval % 60000) / 1000)

  infoLog(`[CARD] Next card in ${minutes}m ${seconds}s`)

  cardSenderTimeoutId = setTimeout(async () => {
    if (token !== cardSenderToken) return
    await processNextCard()
    scheduleNextCard()
  }, interval)
}

export async function startCardSender() {
  if (cardSenderTimeoutId) {
    clearTimeout(cardSenderTimeoutId)
    cardSenderTimeoutId = null
  }
  cardSenderToken += 1
  const token = cardSenderToken

  if (!JOB_GROUP_ID) {
    warningLog("[CARD] JOB_GROUP_ID not configured. Card sender disabled.")
    return
  }

  const timeUntilNext = await getTimeUntilNextSend()
  const state = await readCardSenderState()
  const lastSentAgo = state.lastSentAt > 0 ? Math.floor((Date.now() - state.lastSentAt) / 1000) : 0

  infoLog("════════════════════════════════════════════════════")
  infoLog("       🎴 CARD JOB SENDER STARTED")
  infoLog("════════════════════════════════════════════════════")
  infoLog(`⏱️  Interval: ${FIXED_INTERVAL / 60000} minutes`)
  infoLog(`📍 Group: ${JOB_GROUP_ID}`)
  infoLog(`💾 Storage: Supabase (database)`)
  if (state.lastSentAt > 0) {
    infoLog(`📅 Last sent: ${lastSentAgo} seconds ago`)
  } else {
    infoLog(`📅 Last sent: never (first cycle)`)
  }
  infoLog("════════════════════════════════════════════════════")

  const minutes = Math.floor(timeUntilNext / 60000)
  const seconds = Math.floor((timeUntilNext % 60000) / 1000)
  infoLog(`[CARD] First card will be sent in ${minutes}m ${seconds}s`)

  cardSenderTimeoutId = setTimeout(async () => {
    if (token !== cardSenderToken) return
    await processNextCard()
    scheduleNextCard()
  }, timeUntilNext)
}

export function stopCardSender() {
  if (cardSenderTimeoutId) {
    clearTimeout(cardSenderTimeoutId)
    cardSenderTimeoutId = null
  }
  cardSenderToken += 1
  infoLog("[CARD] Card sender stopped")
}

// Exposto apenas para testes (`src/test/cardJobSender.test.js`). Nao usar em
// codigo de producao — a interface estavel e `startCardSender` / `stopCardSender`.
export const _internals = {
  buildNextJobMessage,
  sendJobMessage,
  processNextCard,
}

export default { startCardSender, stopCardSender }

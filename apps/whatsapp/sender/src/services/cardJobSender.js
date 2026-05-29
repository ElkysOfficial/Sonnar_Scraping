/**
 * Loop de envio de uma vaga por intervalo pro grupo geral (JOB_GROUP_ID).
 * Independente do loop VIP (vipJobSender.js).
 *
 * Antes: chamava o formatter local (localhost:3001/cards/next) que internamente
 * lia o core, renderizava no @napi-rs/canvas e devolvia tudo. Agora o sender
 * faz cada etapa: busca a vaga no core, pede o PNG ao card-renderer (Vercel),
 * monta a legenda local e envia.
 */

import "dotenv/config"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { JOB_GROUP_ID, JOB_SEND_INTERVAL } from "../config.js"
import { getCurrentSocket, isCurrentSocketReady } from "../utils/socketManager.js"
import { getSenderState, updateSenderState } from "./database.js"
import { fetchPendingJobs, markJobStatus } from "./coreClient.js"
import { fetchJobCardImage } from "./cardClient.js"
import { formatCaption } from "./captionBuilder.js"
import { shortenUrl } from "./urlShortener.js"

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

  if (elapsed >= FIXED_INTERVAL) {
    return 5000
  }

  const remaining = FIXED_INTERVAL - elapsed
  return Math.max(5000, remaining)
}

/**
 * Busca a proxima vaga pendente direto do core e monta o card completo
 * (imagem PNG via card-renderer + caption + shortUrl).
 */
async function buildNextCard() {
  const pending = await fetchPendingJobs(1)
  const job = pending[0]
  if (!job) return null

  const cardImage = await fetchJobCardImage(job)
  if (!cardImage) {
    warningLog(`[CARD] Render falhou para a vaga ${job.id || job.url}`)
    return null
  }

  const { imageBuffer, jobData } = cardImage
  const shortUrl = await shortenUrl(jobData.url)
  const caption = formatCaption(jobData, shortUrl)

  return {
    jobId: jobData.id || job.id || null,
    imageBuffer,
    caption
  }
}

async function sendCardMessage(card) {
  try {
    const socket = getCurrentSocket()

    if (!isCurrentSocketReady()) {
      warningLog("[CARD] Connection closed. Waiting for reconnection.")
      return false
    }

    await socket.sendMessage(JOB_GROUP_ID, {
      image: card.imageBuffer,
      caption: card.caption,
      mimetype: "image/png"
    })

    return true
  } catch (error) {
    errorLog(`Error sending card message: ${error.message}`)
    return false
  }
}

async function processNextCard() {
  infoLog("[CARD] Starting card processing...")

  if (!isCurrentSocketReady()) {
    warningLog("[CARD] Connection closed. Waiting for reconnection.")
    return
  }

  const card = await buildNextCard()
  if (!card) {
    infoLog("[CARD] No pending cards available")
    return
  }

  infoLog(`[CARD] Sending card for job: ${card.jobId}`)
  const success = await sendCardMessage(card)

  if (success) {
    if (card.jobId) {
      await markJobStatus(card.jobId, "whatsapp", true)
    }
    await writeCardSenderState(Date.now())
    const timestamp = new Date().toISOString()
    successLog(`[CARD] Card sent successfully for job: ${card.jobId} at ${timestamp}`)
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

export default { startCardSender, stopCardSender }

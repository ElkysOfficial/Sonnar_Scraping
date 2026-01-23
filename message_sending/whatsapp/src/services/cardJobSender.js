/**
 * Card Job Sender Service
 * Fetches job cards from the card generator API and sends them to WhatsApp
 * with image + caption format
 *
 * @author Sonar Bot
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import axios from "axios"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { JOB_GROUP_ID, JOB_SEND_INTERVAL, CARD_API_URL } from "../config.js"
import { getCurrentSocket, isCurrentSocketReady } from "../utils/socketManager.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// State file for persistence
const CARD_SENDER_STATE_PATH = path.resolve(__dirname, "..", "..", "database", "card-sender-state.json")

// Intervals
const FIXED_INTERVAL = JOB_SEND_INTERVAL || 5 * 60 * 1000

let cardSenderTimeoutId = null
let cardSenderToken = 0

/**
 * Read sender state from file
 */
function readCardSenderState() {
  try {
    if (!fs.existsSync(CARD_SENDER_STATE_PATH)) {
      return { lastSentAt: 0 }
    }
    const raw = fs.readFileSync(CARD_SENDER_STATE_PATH, "utf8")
    if (!raw.trim()) {
      return { lastSentAt: 0 }
    }
    return JSON.parse(raw)
  } catch (err) {
    errorLog(`Error reading card sender state: ${err.message}`)
    return { lastSentAt: 0 }
  }
}

/**
 * Write sender state to file
 */
function writeCardSenderState(state) {
  try {
    const dir = path.dirname(CARD_SENDER_STATE_PATH)
    const base = path.basename(CARD_SENDER_STATE_PATH)
    const tempPath = path.join(dir, `.tmp-${base}-${process.pid}-${Date.now()}`)
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8")
    if (fs.existsSync(CARD_SENDER_STATE_PATH)) {
      fs.rmSync(CARD_SENDER_STATE_PATH, { force: true })
    }
    fs.renameSync(tempPath, CARD_SENDER_STATE_PATH)
  } catch (err) {
    errorLog(`Error saving card sender state: ${err.message}`)
  }
}

/**
 * Calculate time until next send
 */
function getTimeUntilNextSend() {
  const state = readCardSenderState()
  const now = Date.now()
  const elapsed = now - state.lastSentAt

  if (elapsed >= FIXED_INTERVAL) {
    return 5000
  }

  const remaining = FIXED_INTERVAL - elapsed
  return Math.max(5000, remaining)
}

/**
 * Fetch next card from API
 * @returns {Promise<Object|null>} WhatsAppOutbound object or null
 */
async function fetchNextCard() {
  try {
    const response = await axios.get(`${CARD_API_URL}/cards/next`, {
      params: { to: JOB_GROUP_ID },
      timeout: 30000
    })

    if (response.data && response.data.card) {
      return response.data.card
    }

    return null
  } catch (error) {
    errorLog(`Error fetching card from API: ${error.message}`)
    return null
  }
}

/**
 * Mark job as sent in the API
 * @param {string} jobId - Job ID to mark
 */
async function markJobAsSent(jobId) {
  try {
    await axios.post(`${CARD_API_URL}/cards/mark-sent`, { jobId }, { timeout: 5000 })
  } catch (error) {
    errorLog(`Error marking job as sent: ${error.message}`)
  }
}

/**
 * Send WhatsApp message with image and caption
 * @param {Object} cardData - WhatsAppOutbound object
 * @returns {Promise<boolean>} Success status
 */
async function sendCardMessage(cardData) {
  try {
    const socket = getCurrentSocket()

    if (!isCurrentSocketReady()) {
      warningLog("[CARD] Connection closed. Waiting for reconnection.")
      return false
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(cardData.image.base64, "base64")

    // Send image with caption
    await socket.sendMessage(cardData.to, {
      image: imageBuffer,
      caption: cardData.text,
      mimetype: cardData.image.mimeType
    })

    return true
  } catch (error) {
    errorLog(`Error sending card message: ${error.message}`)
    return false
  }
}

/**
 * Process and send next job card
 */
async function processNextCard() {
  infoLog("[CARD] Starting card processing...")

  if (!isCurrentSocketReady()) {
    warningLog("[CARD] Connection closed. Waiting for reconnection.")
    return
  }

  // Fetch next card from API
  const card = await fetchNextCard()

  if (!card) {
    infoLog("[CARD] No pending cards available")
    return
  }

  const jobId = card.metadata?.jobId
  infoLog(`[CARD] Sending card for job: ${jobId}`)

  const success = await sendCardMessage(card)

  if (success) {
    // Mark as sent
    if (jobId) {
      await markJobAsSent(jobId)
    }

    // Update state
    writeCardSenderState({ lastSentAt: Date.now() })

    const timestamp = new Date().toISOString()
    successLog(`[CARD] Card sent successfully for job: ${jobId} at ${timestamp}`)
  }
}

/**
 * Schedule next card send
 */
function scheduleNextCard() {
  const token = cardSenderToken
  const interval = FIXED_INTERVAL
  const minutes = Math.floor(interval / 60000)
  const seconds = Math.floor((interval % 60000) / 1000)

  infoLog(`[CARD] Next card in ${minutes}m ${seconds}s`)

  cardSenderTimeoutId = setTimeout(async () => {
    if (token !== cardSenderToken) {
      return
    }
    await processNextCard()
    scheduleNextCard()
  }, interval)
}

/**
 * Start card sender service
 */
export function startCardSender() {
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

  const timeUntilNext = getTimeUntilNextSend()
  const state = readCardSenderState()
  const lastSentAgo = state.lastSentAt > 0 ? Math.floor((Date.now() - state.lastSentAt) / 1000) : 0

  infoLog("════════════════════════════════════════════════════")
  infoLog("       🎴 CARD JOB SENDER STARTED")
  infoLog("════════════════════════════════════════════════════")
  infoLog(`⏱️  Interval: ${FIXED_INTERVAL / 60000} minutes`)
  infoLog(`📍 Group: ${JOB_GROUP_ID}`)
  infoLog(`🌐 API: ${CARD_API_URL}`)
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
    if (token !== cardSenderToken) {
      return
    }
    await processNextCard()
    scheduleNextCard()
  }, timeUntilNext)
}

/**
 * Stop card sender service
 */
export function stopCardSender() {
  if (cardSenderTimeoutId) {
    clearTimeout(cardSenderTimeoutId)
    cardSenderTimeoutId = null
  }
  cardSenderToken += 1
  infoLog("[CARD] Card sender stopped")
}

export default { startCardSender, stopCardSender }

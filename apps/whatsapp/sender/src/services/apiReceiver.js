/**
 * API Receiver Service
 * Receives WhatsAppOutbound messages from external services and sends them
 *
 * @author Sonar Bot
 */

import express from "express"
import { infoLog, successLog, warningLog, errorLog } from "../utils/logger.js"
import { getCurrentSocket, isCurrentSocketReady } from "../utils/socketManager.js"
import { WHATSAPP_API_PORT } from "../config.js"

const app = express()
app.use(express.json({ limit: "50mb" }))

const API_PORT = WHATSAPP_API_PORT

/**
 * @typedef {Object} WhatsAppOutbound
 * @property {string} to - Recipient JID
 * @property {Object} image - Image data
 * @property {string} image.mimeType - MIME type (image/jpeg)
 * @property {string} image.filename - Filename
 * @property {string} image.base64 - Base64 encoded image
 * @property {string} text - Caption text
 * @property {Object} metadata - Additional metadata
 */

/**
 * Send WhatsApp message with image and caption
 * @param {WhatsAppOutbound} data - Message data
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendWhatsAppMessage(data) {
  try {
    const socket = getCurrentSocket()

    if (!isCurrentSocketReady()) {
      return { success: false, error: "WhatsApp not connected" }
    }

    if (data.image && data.image.base64) {
      // Send image with caption
      const imageBuffer = Buffer.from(data.image.base64, "base64")

      await socket.sendMessage(data.to, {
        image: imageBuffer,
        caption: data.text || "",
        mimetype: data.image.mimeType || "image/jpeg"
      })
    } else if (data.text) {
      // Send text only
      await socket.sendMessage(data.to, {
        text: data.text
      })
    } else {
      return { success: false, error: "No content to send" }
    }

    return { success: true }
  } catch (error) {
    errorLog(`Error sending message: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * POST /send
 * Send a single WhatsApp message
 *
 * Body: WhatsAppOutbound
 */
app.post("/send", async (req, res) => {
  try {
    const data = req.body

    if (!data.to) {
      return res.status(400).json({ success: false, error: "Missing 'to' recipient" })
    }

    if (!data.text && !data.image) {
      return res.status(400).json({ success: false, error: "Missing content (text or image)" })
    }

    infoLog(`[API] Received send request to: ${data.to}`)

    const result = await sendWhatsAppMessage(data)

    if (result.success) {
      successLog(`[API] Message sent successfully to: ${data.to}`)
      res.json({ success: true, metadata: data.metadata })
    } else {
      warningLog(`[API] Failed to send message: ${result.error}`)
      res.status(500).json({ success: false, error: result.error })
    }
  } catch (error) {
    errorLog(`[API] Error processing request: ${error.message}`)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /send-batch
 * Send multiple WhatsApp messages
 *
 * Body: { messages: WhatsAppOutbound[], delay?: number }
 */
app.post("/send-batch", async (req, res) => {
  try {
    const { messages, delay = 2000 } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: "Missing or invalid messages array" })
    }

    infoLog(`[API] Received batch request with ${messages.length} messages`)

    const results = []

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]

      if (!msg.to) {
        results.push({ success: false, error: "Missing 'to' recipient", index: i })
        continue
      }

      const result = await sendWhatsAppMessage(msg)
      results.push({ ...result, index: i, jobId: msg.metadata?.jobId })

      // Delay between messages to avoid rate limiting
      if (i < messages.length - 1 && delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    const successCount = results.filter((r) => r.success).length
    successLog(`[API] Batch complete: ${successCount}/${messages.length} sent`)

    res.json({
      success: true,
      total: messages.length,
      sent: successCount,
      failed: messages.length - successCount,
      results
    })
  } catch (error) {
    errorLog(`[API] Error processing batch: ${error.message}`)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /status
 * Check connection status
 */
app.get("/status", (req, res) => {
  const connected = isCurrentSocketReady()
  res.json({
    status: connected ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  })
})

/**
 * Health check
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "whatsapp-api-receiver" })
})

/**
 * Start API receiver server
 */
export function startApiReceiver() {
  app.listen(API_PORT, () => {
    infoLog("════════════════════════════════════════════════════")
    infoLog("       📡 WHATSAPP API RECEIVER STARTED")
    infoLog("════════════════════════════════════════════════════")
    infoLog(`📍 Port: ${API_PORT}`)
    infoLog(`Endpoints:`)
    infoLog(`  POST /send - Send single message`)
    infoLog(`  POST /send-batch - Send multiple messages`)
    infoLog(`  GET  /status - Check connection status`)
    infoLog("════════════════════════════════════════════════════")
  })
}

export default { startApiReceiver, sendWhatsAppMessage }

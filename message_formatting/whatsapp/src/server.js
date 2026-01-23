/**
 * WhatsApp Card Generator API Server
 * Generates job card images and formats them for WhatsApp distribution
 */

import express from "express"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createJobCard, extractJobDataFromEmbed } from "./services/cardGenerator.js"
import { shortenUrl } from "./services/urlShortener.js"
import { v4 as uuidv4 } from "uuid"
import { infoLog, successLog, warningLog, errorLog, requestLog, banner, divider, cardLog, statsLog } from "./utils/logger.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json({ limit: "10mb" }))

const PORT = process.env.WHATSAPP_CARD_PORT || 3001

// Path to embeds.json (shared with Discord service)
const EMBEDS_FILE_PATH = path.resolve(__dirname, "..", "..", "discord", "src", "data", "embeds.json")

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  res.on("finish", () => {
    const duration = Date.now() - start
    requestLog(req.method, req.path, res.statusCode, duration)
  })
  next()
})

/**
 * Load embeds from file
 */
function loadEmbeds() {
  try {
    if (!fs.existsSync(EMBEDS_FILE_PATH)) {
      warningLog(`Embeds file not found: ${EMBEDS_FILE_PATH}`)
      return []
    }
    const data = fs.readFileSync(EMBEDS_FILE_PATH, "utf8")
    if (!data.trim()) {
      return []
    }
    return JSON.parse(data)
  } catch (error) {
    errorLog(`Error loading embeds: ${error.message}`)
    return []
  }
}

/**
 * Format WhatsApp caption text
 */
function formatCaption(jobData, shortUrl) {
  let caption = `*${jobData.title}*\n`
  caption += `${jobData.company}\n\n`
  caption += `${jobData.location}${jobData.uf ? ` - ${jobData.uf}` : ""}\n`
  caption += `${jobData.mode}\n`

  if (jobData.salaryNote) {
    caption += `${jobData.salaryNote}\n`
  }

  if (jobData.salary && jobData.salary !== "Nao informado") {
    caption += `${jobData.salary}\n`
  }

  caption += `\nVer mais sobre a vaga:${shortUrl}`

  return caption
}

/**
 * POST /cards/generate
 * Generate a single card from embed data
 */
app.post("/cards/generate", async (req, res) => {
  try {
    const { embed, to } = req.body

    if (!embed) {
      warningLog("Request missing embed data")
      return res.status(400).json({ error: "Missing embed data" })
    }

    if (!to) {
      warningLog("Request missing 'to' recipient")
      return res.status(400).json({ error: "Missing 'to' recipient" })
    }

    const jobData = extractJobDataFromEmbed(embed)
    cardLog(jobData.title, jobData.source, "Generating...")

    const imageBuffer = await createJobCard(jobData)
    const base64Image = imageBuffer.toString("base64")
    const shortUrl = await shortenUrl(jobData.url)
    const caption = formatCaption(jobData, shortUrl)

    const response = {
      to,
      image: {
        mimeType: "image/jpeg",
        filename: `job-card-${embed.id || uuidv4()}.jpg`,
        base64: base64Image
      },
      text: caption,
      metadata: {
        jobId: embed.id || null,
        source: jobData.source,
        createdAtISO: new Date().toISOString()
      }
    }

    successLog(`Card generated: ${jobData.title}`)
    res.json(response)
  } catch (error) {
    errorLog(`Error generating card: ${error.message}`)
    res.status(500).json({ error: "Failed to generate card", details: error.message })
  }
})

/**
 * POST /cards/generate-batch
 * Generate multiple cards from embed array
 */
app.post("/cards/generate-batch", async (req, res) => {
  try {
    const { embeds, to, limit = 10 } = req.body

    if (!embeds || !Array.isArray(embeds)) {
      warningLog("Request missing or invalid embeds array")
      return res.status(400).json({ error: "Missing or invalid embeds array" })
    }

    if (!to) {
      warningLog("Request missing 'to' recipient")
      return res.status(400).json({ error: "Missing 'to' recipient" })
    }

    infoLog(`Batch request: ${embeds.length} embeds (limit: ${limit})`)

    const results = []
    const jobsToProcess = embeds.slice(0, limit)

    for (const embed of jobsToProcess) {
      try {
        const jobData = extractJobDataFromEmbed(embed)
        cardLog(jobData.title, jobData.source, "Processing...")

        const imageBuffer = await createJobCard(jobData)
        const base64Image = imageBuffer.toString("base64")
        const shortUrl = await shortenUrl(jobData.url)
        const caption = formatCaption(jobData, shortUrl)

        results.push({
          to,
          image: {
            mimeType: "image/jpeg",
            filename: `job-card-${embed.id || uuidv4()}.jpg`,
            base64: base64Image
          },
          text: caption,
          metadata: {
            jobId: embed.id || null,
            source: jobData.source,
            createdAtISO: new Date().toISOString()
          }
        })
      } catch (error) {
        errorLog(`Error generating card for embed ${embed.id}: ${error.message}`)
      }
    }

    successLog(`Batch complete: ${results.length}/${jobsToProcess.length} cards generated`)
    res.json({ cards: results, total: results.length })
  } catch (error) {
    errorLog(`Error generating batch: ${error.message}`)
    res.status(500).json({ error: "Failed to generate batch", details: error.message })
  }
})

/**
 * GET /cards/next
 * Get next pending job card for WhatsApp
 */
app.get("/cards/next", async (req, res) => {
  try {
    const { to } = req.query

    if (!to) {
      warningLog("Request missing 'to' recipient in query")
      return res.status(400).json({ error: "Missing 'to' recipient in query" })
    }

    const embeds = loadEmbeds()
    const pendingEmbed = embeds.find(e => e.whatsappSent !== true)

    if (!pendingEmbed) {
      infoLog("No pending jobs available")
      return res.json({ card: null, message: "No pending jobs" })
    }

    const jobData = extractJobDataFromEmbed(pendingEmbed)
    cardLog(jobData.title, jobData.source, "Fetching next...")

    const imageBuffer = await createJobCard(jobData)
    const base64Image = imageBuffer.toString("base64")
    const shortUrl = await shortenUrl(jobData.url)
    const caption = formatCaption(jobData, shortUrl)

    const response = {
      card: {
        to,
        image: {
          mimeType: "image/jpeg",
          filename: `job-card-${pendingEmbed.id || uuidv4()}.jpg`,
          base64: base64Image
        },
        text: caption,
        metadata: {
          jobId: pendingEmbed.id || null,
          source: jobData.source,
          createdAtISO: new Date().toISOString()
        }
      }
    }

    successLog(`Next card ready: ${jobData.title}`)
    res.json(response)
  } catch (error) {
    errorLog(`Error getting next card: ${error.message}`)
    res.status(500).json({ error: "Failed to get next card", details: error.message })
  }
})

/**
 * GET /cards/pending
 * Get count of pending jobs
 */
app.get("/cards/pending", (req, res) => {
  try {
    const embeds = loadEmbeds()
    const pending = embeds.filter(e => e.whatsappSent !== true)

    statsLog(embeds.length, pending.length, embeds.length - pending.length)

    res.json({
      total: embeds.length,
      pending: pending.length,
      sent: embeds.length - pending.length
    })
  } catch (error) {
    errorLog(`Failed to get pending count: ${error.message}`)
    res.status(500).json({ error: "Failed to get pending count" })
  }
})

/**
 * POST /cards/mark-sent
 * Mark a job as sent to WhatsApp
 */
app.post("/cards/mark-sent", (req, res) => {
  try {
    const { jobId } = req.body

    if (!jobId) {
      warningLog("Request missing jobId")
      return res.status(400).json({ error: "Missing jobId" })
    }

    const embeds = loadEmbeds()
    const index = embeds.findIndex(e => e.id === jobId)

    if (index === -1) {
      warningLog(`Job not found: ${jobId}`)
      return res.status(404).json({ error: "Job not found" })
    }

    embeds[index].whatsappSent = true

    // Atomic write
    const tempPath = EMBEDS_FILE_PATH + ".tmp"
    fs.writeFileSync(tempPath, JSON.stringify(embeds, null, 2), "utf8")
    fs.renameSync(tempPath, EMBEDS_FILE_PATH)

    successLog(`Job marked as sent: ${jobId}`)
    res.json({ success: true, jobId })
  } catch (error) {
    errorLog(`Error marking job as sent: ${error.message}`)
    res.status(500).json({ error: "Failed to mark as sent" })
  }
})

/**
 * Health check
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "whatsapp-card-generator" })
})

// Start server
app.listen(PORT, () => {
  banner("WHATSAPP CARD GENERATOR")

  infoLog(`Server running on port ${PORT}`)
  infoLog(`Embeds file: ${EMBEDS_FILE_PATH}`)
  divider()

  console.log("")
  infoLog("Available endpoints:")
  console.log("  POST /cards/generate       - Generate single card")
  console.log("  POST /cards/generate-batch - Generate multiple cards")
  console.log("  GET  /cards/next           - Get next pending card")
  console.log("  GET  /cards/pending        - Get pending count")
  console.log("  POST /cards/mark-sent      - Mark job as sent")
  console.log("  GET  /health               - Health check")
  divider()

  // Show initial stats
  const embeds = loadEmbeds()
  const pending = embeds.filter(e => e.whatsappSent !== true)
  statsLog(embeds.length, pending.length, embeds.length - pending.length)

  console.log("")
  successLog("Server ready and waiting for requests...")
  console.log("")
})

export default app

/**
 * WhatsApp Card Generator API Server
 * Generates job card images and formats them for WhatsApp distribution
 */

import express from "express"
import { createJobCard, extractJobDataFromEmbed } from "./services/cardGenerator.js"
import { shortenUrl } from "./services/urlShortener.js"
import { v4 as uuidv4 } from "uuid"
import {
  infoLog,
  successLog,
  warningLog,
  errorLog,
  requestLog,
  banner,
  divider,
  cardLog,
  statsLog
} from "./utils/logger.js"
import { fetchJobData, fetchPendingJobs, markJobStatus, getJobStats } from "./utils/jobDataClient.js"

const app = express()
app.use(express.json({ limit: "10mb" }))

const PORT = process.env.WHATSAPP_CARD_PORT || 3001

function parseDate(dateStr) {
  if (!dateStr) return null
  if (dateStr.includes("/")) {
    const [day, month, year] = dateStr.split("/")
    const parsed = new Date(`${year}-${month}-${day}`)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(dateStr)
  return isNaN(parsed.getTime()) ? null : parsed
}

app.use((req, res, next) => {
  const start = Date.now()
  res.on("finish", () => {
    const duration = Date.now() - start
    requestLog(req.method, req.path, res.statusCode, duration)
  })
  next()
})

function jobDataToEmbed(job) {
  const fields = []
  if (job.company) fields.push({ name: "Empresa", value: job.company, inline: true })
  if (job.location) fields.push({ name: "Localidade", value: job.location, inline: true })
  if (job.hiring_regime) fields.push({ name: "Regime", value: job.hiring_regime, inline: true })
  if (job.work_type) fields.push({ name: "Modalidade de Trabalho", value: job.work_type, inline: true })
  if (job.salary) fields.push({ name: "Salário", value: job.salary, inline: true })
  if (job.publication_date) fields.push({ name: "Data de Publicação", value: job.publication_date, inline: true })

  const timestamp = parseDate(job.publication_date) || new Date()

  return {
    title: job.job_title || job.title || "",
    url: job.job_url || job.url || "",
    fields,
    timestamp: timestamp.toISOString(),
    id: job.id || job.job_url || "",
    // Campos extras propagados do payload original — usados pelo cardGenerator
    // quando vierem da API. O Discord embed real ignora propriedades desconhecidas.
    skills: Array.isArray(job.skills) ? job.skills : [],
    description: job.description || ""
  }
}

function resolveEmbedPayload(payload) {
  const candidate = payload?.embed || payload?.job || payload
  if (!candidate) return null
  if (candidate.fields) {
    return candidate
  }
  return jobDataToEmbed(candidate)
}

// Limite defensivo para a descricao na legenda (evita estourar o caption).
const CAPTION_DESCRIPTION_MAX = 600

function truncateDescription(text) {
  const clean = (text || "").toString().replace(/\n{3,}/g, "\n\n").trim()
  if (clean.length <= CAPTION_DESCRIPTION_MAX) return clean
  return `${clean.slice(0, CAPTION_DESCRIPTION_MAX).trimEnd()}…`
}

function formatCaption(jobData, shortUrl) {
  // Legenda enviada junto da imagem: titulo, empresa, descricao (se houver),
  // modalidade (se houver) e link. Local/salario/regime ficam so no card.
  let caption = `*${jobData.title}*\n`
  caption += `${jobData.company}\n`

  const description = truncateDescription(jobData.description)
  if (description) {
    caption += `\n${description}\n`
  }

  if (jobData.workType && jobData.workType !== "Nao informado") {
    caption += `\n${jobData.workType}\n`
  }

  caption += `\nVer mais sobre a vaga: ${shortUrl}`

  return caption
}

async function buildCardPayload(payload, to) {
  if (!to) {
    throw new Error("Parâmetro 'to' obrigatório")
  }
  const embed = resolveEmbedPayload(payload)
  if (!embed) {
    throw new Error("Dados da vaga inválidos")
  }
  const jobData = extractJobDataFromEmbed(embed)
  if (!jobData) {
    throw new Error("Não foi possível extrair os dados da vaga")
  }

  const [imageBuffer, shortUrl] = await Promise.all([
    createJobCard(jobData),
    shortenUrl(jobData.url)
  ])
  const caption = formatCaption(jobData, shortUrl)

  return {
    to,
    image: {
      mimeType: "image/jpeg",
      filename: `job-card-${jobData.id || uuidv4()}.jpg`,
      base64: imageBuffer.toString("base64")
    },
    text: caption,
    metadata: {
      jobId: jobData.id || null,
      source: jobData.source,
      createdAtISO: new Date().toISOString()
    }
  }
}

app.post("/cards/generate", async (req, res) => {
  try {
    const { embed, job, to } = req.body
    if (!to) {
      warningLog("Request missing 'to' recipient")
      return res.status(400).json({ error: "Missing 'to' recipient" })
    }

    const card = await buildCardPayload(job || embed || req.body, to)
    successLog(`Card generated: ${card.metadata.jobId || "unknown"}`)
    res.json(card)
  } catch (error) {
    errorLog(`Error generating card: ${error.message}`)
    res.status(500).json({ error: "Failed to generate card", details: error.message })
  }
})

app.post("/cards/generate-batch", async (req, res) => {
  try {
    const { embeds, jobs, to, limit = 10 } = req.body
    if (!to) {
      warningLog("Request missing 'to' recipient")
      return res.status(400).json({ error: "Missing 'to' recipient" })
    }

    const sources = embeds || jobs || []
    if (!Array.isArray(sources)) {
      warningLog("Request missing or invalid embeds array")
      return res.status(400).json({ error: "Missing or invalid embeds array" })
    }

    infoLog(`Batch request: ${sources.length} embeds (limit: ${limit})`)

    const jobsToProcess = sources.slice(0, limit)
    const results = []

    for (const entry of jobsToProcess) {
      try {
        const card = await buildCardPayload(entry, to)
        results.push({
          to,
          image: card.image,
          text: card.text,
          metadata: card.metadata
        })
      } catch (err) {
        errorLog(`Error generating batch card: ${err.message}`)
      }
    }

    successLog(`Batch complete: ${results.length}/${jobsToProcess.length} cards generated`)
    res.json({ cards: results, total: results.length })
  } catch (error) {
    errorLog(`Error generating batch: ${error.message}`)
    res.status(500).json({ error: "Failed to generate batch", details: error.message })
  }
})

app.get("/cards/next", async (req, res) => {
  try {
    const { to } = req.query
    if (!to) {
      warningLog("Request missing 'to' recipient in query")
      return res.status(400).json({ error: "Missing 'to' recipient in query" })
    }

    // Busca diretamente do Supabase apenas vagas pendentes (mais eficiente)
    const pendingJobs = await fetchPendingJobs(1)
    const pendingJob = pendingJobs[0]

    if (!pendingJob) {
      infoLog("No pending jobs available")
      return res.json({ card: null, message: "No pending jobs" })
    }

    const cardPayload = await buildCardPayload(pendingJob, to)
    successLog(`Next card ready: ${cardPayload.metadata.jobId}`)
    res.json({ card: cardPayload })
  } catch (error) {
    errorLog(`Error getting next card: ${error.message}`)
    res.status(500).json({ error: "Failed to get next card", details: error.message })
  }
})

app.get("/cards/pending", async (req, res) => {
  try {
    // Busca estatísticas diretamente do Supabase (mais eficiente)
    const stats = await getJobStats()

    statsLog(stats.total, stats.pending, stats.sent)

    res.json(stats)
  } catch (error) {
    errorLog(`Failed to get pending count: ${error.message}`)
    res.status(500).json({ error: "Failed to get pending count", details: error.message })
  }
})

app.post("/cards/mark-sent", async (req, res) => {
  try {
    const { jobId } = req.body
    if (!jobId) {
      warningLog("Request missing jobId")
      return res.status(400).json({ error: "Missing jobId" })
    }

    await markJobStatus(jobId, "whatsapp", true)

    successLog(`Job marked as sent: ${jobId}`)
    res.json({ success: true, jobId })
  } catch (error) {
    errorLog(`Error marking job as sent: ${error.message}`)
    res.status(500).json({ error: "Failed to mark as sent", details: error.message })
  }
})

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "whatsapp-card-generator" })
})

async function logInitialStats() {
  try {
    const stats = await getJobStats()
    statsLog(stats.total, stats.pending, stats.sent)
  } catch (error) {
    warningLog("Não foi possível carregar o status inicial das vagas.")
  }
}

app.listen(PORT, async () => {
  banner("WHATSAPP CARD GENERATOR")

  infoLog(`Server running on port ${PORT}`)
  infoLog(`Data source: Supabase (${process.env.SUPABASE_URL || "not configured"})`)
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

  await logInitialStats()

  console.log("")
  successLog("Server ready and waiting for requests...")
  console.log("")
})

/**
 * WhatsApp Card Generator API Server
 * Generates job card images and formats them for WhatsApp distribution
 */

import "dotenv/config"
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

// =====================================================
// Extracao das RESPONSABILIDADES da descricao da vaga.
//
// A descricao crua (jobs.json) costuma ser longa e bagunçada. Para a legenda
// queremos so a secao de responsabilidades/atribuicoes, em bullets.
// Estrategia (auditada sobre todo o jobs.json):
//   1. Acha um cabecalho de responsabilidades e corta ate o proximo cabecalho.
//   2. Sem cabecalho: usa o maior bloco de linhas terminadas em ";".
//   3. Sem nada: cai num resumo curto das primeiras frases.
// =====================================================

const RESP_START = [
  "responsabilidades e atribuicoes", "responsabilidades e requisitos",
  "principais responsabilidades", "principais atividades", "suas atividades",
  "suas responsabilidades", "o que voce vai fazer", "o que voce ira fazer",
  "o seu papel no time", "seu papel", "responsabilidades", "atribuicoes",
  "atividades", "o que voce fara", "principais entregas", "principais desafios",
  "o desafio"
]
const RESP_END = [
  "requisitos", "pre-requisitos", "pre requisitos", "diferenciais", "desejavel",
  "desejaveis", "o que esperamos", "o que buscamos", "o que voce precisa",
  "o que oferecemos", "oferecemos", "beneficios", "hard skills", "soft skills",
  "qualificacoes", "salario", "remuneracao", "regime", "contratacao",
  "sobre a empresa", "sobre nos", "quem somos", "o que procuramos", "formacao"
]
const MAX_BULLETS = 10
const MAX_BULLET_LEN = 220
const MAX_SUMMARY_LEN = 320

function normHeader(line) {
  return (line || "")
    .toString()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/^[^a-z0-9]+/, "")  // remove emoji/simbolo no inicio
    .replace(/:+\s*$/, "").trim()
}

function isRespHeader(line, headers) {
  const n = normHeader(line)
  if (!n || n.length > 70) return false
  return headers.some((h) => n === h || n.startsWith(`${h} `) || n.startsWith(`${h}:`))
}

function splitRespItems(chunkLines) {
  let items = []
  const semicolons = (chunkLines[0]?.match(/;/g) || []).length
  // Caso BNE: tudo numa linha so, itens separados por virgula.
  if (chunkLines.length === 1 && chunkLines[0].includes(",") && semicolons <= 1) {
    items = chunkLines[0].split(/[;,]/)
  } else {
    for (const c of chunkLines) {
      items.push(...(c.includes(";") ? c.split(";") : [c]))
    }
  }
  return items
    .map((x) => x.replace(/^[\-•*\s]+/, "").replace(/[\s;.]+$/, "").trim())
    .filter((x) => x.length >= 4 && x.length <= MAX_BULLET_LEN)
}

// Cabecalhos de REQUISITOS / qualificacoes — usados quando a vaga nao tem
// uma secao de responsabilidades ("o que a pessoa precisa saber").
const REQ_START = [
  "requisitos e qualificacoes", "requisitos obrigatorios", "requisitos tecnicos",
  "requisitos", "pre-requisitos", "pre requisitos", "qualificacoes",
  "o que buscamos", "o que esperamos", "o que esperamos de voce",
  "o que voce precisa", "o que procuramos", "hard skills", "perfil desejado",
  "o que e necessario", "o que precisamos"
]
const REQ_END = [
  "diferenciais", "desejavel", "desejaveis", "beneficios", "o que oferecemos",
  "oferecemos", "soft skills", "salario", "remuneracao", "regime",
  "contratacao", "sobre a empresa", "sobre nos"
]

// Corta a secao entre o primeiro cabecalho de `startHeaders` e o proximo
// cabecalho de `endHeaders` (ou outro `startHeaders`). Retorna as linhas ou null.
function sliceSection(lines, startHeaders, endHeaders) {
  const startIdx = lines.findIndex((l) => isRespHeader(l, startHeaders))
  if (startIdx === -1) return null
  const chunk = []
  for (const l of lines.slice(startIdx + 1)) {
    if (isRespHeader(l, endHeaders) || isRespHeader(l, startHeaders)) break
    chunk.push(l)
  }
  return chunk.length ? chunk : null
}

/**
 * Extrai a secao-chave da descricao para a legenda.
 * Prioridade: responsabilidades/atribuicoes -> requisitos -> bloco ";" -> resumo.
 * @returns {{ kind: "resp"|"req", bullets: string[] } | { kind: "text", text: string } | null}
 */
function extractResponsibilities(raw) {
  const lines = (raw || "")
    .toString().replace(/\r/g, "").split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  if (!lines.length) return null

  // 1) Responsabilidades / atribuicoes / "o que voce vai fazer".
  let chunk = sliceSection(lines, RESP_START, RESP_END)
  if (chunk) {
    const items = splitRespItems(chunk)
    if (items.length) return { kind: "resp", bullets: items.slice(0, MAX_BULLETS) }
  }

  // 2) Sem responsabilidades: requisitos / "o que a pessoa precisa saber".
  chunk = sliceSection(lines, REQ_START, REQ_END)
  if (chunk) {
    const items = splitRespItems(chunk)
    if (items.length) return { kind: "req", bullets: items.slice(0, MAX_BULLETS) }
  }

  // 3) Heuristica: maior bloco de linhas terminadas em ";".
  let best = []
  let cur = []
  for (const l of lines) {
    if (l.endsWith(";")) {
      cur.push(l)
    } else {
      if (cur.length > best.length) best = cur
      cur = []
    }
  }
  if (cur.length > best.length) best = cur
  if (best.length >= 3) {
    const items = splitRespItems(best)
    if (items.length) return { kind: "resp", bullets: items.slice(0, MAX_BULLETS) }
  }

  // 4) Fallback: resumo curto das primeiras frases.
  const intro = lines.join(" ")
  if (!intro) return null
  if (intro.length <= MAX_SUMMARY_LEN) return { kind: "text", text: intro }
  return { kind: "text", text: `${intro.slice(0, MAX_SUMMARY_LEN).replace(/\s+\S*$/, "")}…` }
}

/**
 * Monta a legenda enviada junto da imagem.
 * Ordem: titulo, empresa, localizacao, modalidade, skills e responsabilidades.
 * Salario e regime ficam apenas no card (imagem).
 */
function formatCaption(jobData, shortUrl) {
  const out = []

  out.push(`*${jobData.title}*`)
  if (jobData.company) out.push(`🏢 _${jobData.company}_`)
  if (jobData.location && jobData.location !== "Nao informado") {
    out.push(`📍 ${jobData.location}`)
  }
  if (jobData.workType && jobData.workType !== "Nao informado") {
    out.push(`💼 ${jobData.workType}`)
  }

  const skills = Array.isArray(jobData.skills) ? jobData.skills : []
  if (skills.length) {
    out.push("")
    out.push("*🧩 Tecnologias*")
    out.push(skills.join("  •  "))
  }

  const resp = extractResponsibilities(jobData.description)
  if (resp?.bullets?.length) {
    out.push("")
    out.push(resp.kind === "req" ? "*📋 Requisitos*" : "*📋 Responsabilidades*")
    for (const item of resp.bullets) out.push(`• ${item}`)
  } else if (resp?.text) {
    out.push("")
    out.push("*📋 Sobre a vaga*")
    out.push(resp.text)
  }

  out.push("")
  out.push(`🔗 *Ver a vaga:* ${shortUrl}`)

  return out.join("\n")
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

  // Encurta a URL pelo encurtador proprio (sonnarjobs.com.br/v/<code>).
  // Se o servico falhar, shortenUrl devolve a URL original.
  const imageBuffer = await createJobCard(jobData)
  const shortUrl = await shortenUrl(jobData.url)
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
  infoLog(`Data source: message-formatting-core (${process.env.MESSAGE_FORMATTING_CORE_URL || "http://localhost:3100"})`)
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

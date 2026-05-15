import "dotenv/config"
import express from "express"
import cors from "cors"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.MESSAGE_FORMATTING_CORE_PORT || 3100

// Source-of-truth: jobs.json mantido pelo scraper Python.
// Estrutura: { [job_url]: { job_title, job_url, company, ..., sent_to: ["discord", ...] } }
const DEFAULT_JOBS_PATH = path.resolve(__dirname, "..", "..", "..", "apps", "scraper", "src", "data", "jobs.json")
const JOBS_JSON_PATH = process.env.JOBS_JSON_PATH || DEFAULT_JOBS_PATH

const SUPPORTED_CHANNELS = ["discord", "whatsapp", "telegram"]
const CHANNEL_ALIASES = {
  discord: "discord",
  whatsapp: "whatsapp",
  telegram: "telegram",
  badge: "discord"
}

function normalizeChannel(channel) {
  if (!channel) return "discord"
  const key = channel.toString().toLowerCase()
  return CHANNEL_ALIASES[key] || key
}

// ID determinístico (md5 da URL). Permite que requisições do bot referenciem
// uma vaga sem precisar persistir um UUID em jobs.json.
function deriveId(jobUrl) {
  return crypto.createHash("md5").update(jobUrl).digest("hex")
}

// ---------------- storage ----------------

// Write coordination: lock simples para evitar duas escritas concorrentes.
let writeQueue = Promise.resolve()

function readJobsFile() {
  try {
    if (!fs.existsSync(JOBS_JSON_PATH)) return {}
    const raw = fs.readFileSync(JOBS_JSON_PATH, "utf8").trim()
    if (!raw) return {}
    return JSON.parse(raw)
  } catch (err) {
    console.error("[core] falha ao ler jobs.json:", err.message)
    return {}
  }
}

function writeJobsFile(data) {
  writeQueue = writeQueue.then(() => {
    return new Promise((resolve) => {
      try {
        fs.mkdirSync(path.dirname(JOBS_JSON_PATH), { recursive: true })
        const tmp = `${JOBS_JSON_PATH}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8")
        fs.renameSync(tmp, JOBS_JSON_PATH)
      } catch (err) {
        console.error("[core] falha ao escrever jobs.json:", err.message)
      }
      resolve()
    })
  })
  return writeQueue
}

// ---------------- shape translation ----------------

function sentToToStatuses(sentTo) {
  const set = new Set(Array.isArray(sentTo) ? sentTo : [])
  return {
    discord: set.has("discord"),
    whatsapp: set.has("whatsapp"),
    telegram: set.has("telegram")
  }
}

// Converte uma entrada do dict jobs.json em job no formato esperado pelos bots.
function entryToApiJob(entry) {
  const url = entry.job_url || ""
  return {
    id: entry.id || (url ? deriveId(url) : ""),
    job_title: entry.job_title || "",
    job_url: url,
    company: entry.company || "",
    location: entry.location || "",
    work_type: entry.work_type || "",
    hiring_regime: entry.hiring_regime || "",
    salary: entry.salary || "",
    publication_date: entry.publication_date || "",
    source: entry.source || "",
    created_at: entry.created_at || entry.first_seen_at || "",
    updated_at: entry.updated_at || entry.last_seen_at || "",
    statuses: sentToToStatuses(entry.sent_to)
  }
}

function findEntryById(data, id) {
  for (const url of Object.keys(data)) {
    const entry = data[url]
    const entryId = entry.id || deriveId(url)
    if (entryId === id) return { url, entry }
  }
  return null
}

function buildIncoming(payload) {
  const title = (payload.job_title || payload.title || payload.jobTitle || "").toString().trim()
  const url = (payload.job_url || payload.url || payload.jobUrl || "").toString().trim()
  if (!title || !url) {
    throw new Error("Os campos 'job_title' e 'job_url' são obrigatórios.")
  }

  const now = new Date().toISOString()
  const sentTo = []
  for (const ch of SUPPORTED_CHANNELS) {
    const fromStatuses = payload.statuses?.[ch]
    const fromFlat = payload[`status_${ch}`]
    if (fromStatuses || fromFlat) sentTo.push(ch)
  }

  return {
    url,
    entry: {
      job_title: title,
      job_url: url,
      company: (payload.company || "").toString().trim(),
      location: (payload.location || "").toString().trim(),
      work_type: (payload.work_type || payload.workType || "").toString().trim(),
      hiring_regime: (payload.hiring_regime || payload.regime || "").toString().trim(),
      salary: (payload.salary || "").toString().trim(),
      publication_date: (payload.publication_date || payload.publicationDate || "").toString().trim(),
      source: (payload.source || "").toString().trim(),
      created_at: payload.created_at || now,
      updated_at: now,
      sent_to: sentTo
    }
  }
}

// ---------------- routes ----------------

const app = express()
app.use(cors())
app.use(express.json({ limit: "2mb" }))

// POST /jobs - upsert por job_url
app.post("/jobs", async (req, res) => {
  try {
    const { url, entry } = buildIncoming(req.body || {})
    const data = readJobsFile()
    const existing = data[url] || {}
    const mergedSent = Array.from(new Set([...(existing.sent_to || []), ...entry.sent_to]))
    const merged = {
      ...existing,
      ...entry,
      sent_to: mergedSent,
      created_at: existing.created_at || entry.created_at
    }
    data[url] = merged
    await writeJobsFile(data)
    res.status(201).json({ success: true, job: entryToApiJob(merged) })
  } catch (err) {
    res.status(400).json({ success: false, message: err.message })
  }
})

// GET /jobs - todas as vagas (mais novas primeiro)
app.get("/jobs", (req, res) => {
  const data = readJobsFile()
  const jobs = Object.values(data)
    .map(entryToApiJob)
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
  res.json(jobs)
})

// GET /jobs/pending?channel=X - vagas ainda não enviadas no canal
app.get("/jobs/pending", (req, res) => {
  const channel = normalizeChannel(req.query.channel)
  const data = readJobsFile()
  const jobs = Object.values(data)
    .filter((entry) => !(entry.sent_to || []).includes(channel))
    .map(entryToApiJob)
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
  res.json(jobs)
})

// GET /jobs/check-url - existe vaga com essa URL?
app.get("/jobs/check-url", (req, res) => {
  const url = req.query.url
  if (!url) return res.status(400).json({ success: false, message: "URL é obrigatória" })
  const data = readJobsFile()
  const entry = data[url]
  if (!entry) return res.json({ exists: false, id: null })
  res.json({ exists: true, id: entry.id || deriveId(url) })
})

// GET /stats - contagens por canal e por source
app.get("/stats", (req, res) => {
  const data = readJobsFile()
  const jobs = Object.values(data)
  const sent = { discord: 0, whatsapp: 0, telegram: 0 }
  const bySource = {}

  for (const entry of jobs) {
    const sentSet = new Set(entry.sent_to || [])
    for (const ch of SUPPORTED_CHANNELS) {
      if (sentSet.has(ch)) sent[ch]++
    }
    const source = entry.source || "unknown"
    bySource[source] = (bySource[source] || 0) + 1
  }

  res.json({
    total: jobs.length,
    pending: {
      discord: jobs.length - sent.discord,
      whatsapp: jobs.length - sent.whatsapp,
      telegram: jobs.length - sent.telegram
    },
    sent,
    bySource
  })
})

// GET /jobs/:id - busca por id derivado
app.get("/jobs/:id", (req, res) => {
  const data = readJobsFile()
  const hit = findEntryById(data, req.params.id)
  if (!hit) return res.status(404).json({ success: false, message: "Vaga não encontrada" })
  res.json(entryToApiJob(hit.entry))
})

// PUT /jobs/status - marca status de envio para um canal
app.put("/jobs/status", async (req, res) => {
  try {
    const { id, channel, status } = req.body || {}
    if (!id) return res.status(400).json({ success: false, message: "ID é obrigatório" })

    const targetChannel = normalizeChannel(channel)
    const data = readJobsFile()
    const hit = findEntryById(data, id)
    if (!hit) return res.status(404).json({ success: false, message: "Vaga não encontrada" })

    const sentSet = new Set(hit.entry.sent_to || [])
    if (status) sentSet.add(targetChannel)
    else sentSet.delete(targetChannel)

    hit.entry.sent_to = Array.from(sentSet).sort()
    hit.entry.updated_at = new Date().toISOString()
    data[hit.url] = hit.entry
    await writeJobsFile(data)

    res.json({ success: true, job: entryToApiJob(hit.entry) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// DELETE /jobs/:id - remove vaga
app.delete("/jobs/:id", async (req, res) => {
  const data = readJobsFile()
  const hit = findEntryById(data, req.params.id)
  if (!hit) return res.status(404).json({ success: false, message: "Vaga não encontrada" })
  delete data[hit.url]
  await writeJobsFile(data)
  res.json({ success: true })
})

// Health
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    jobsPath: JOBS_JSON_PATH,
    jobsExists: fs.existsSync(JOBS_JSON_PATH)
  })
})

app.listen(PORT, () => {
  console.log(`[core] message-formatting-core ouvindo em http://localhost:${PORT}`)
  console.log(`[core] fonte de dados: ${JOBS_JSON_PATH}`)
  if (!fs.existsSync(JOBS_JSON_PATH)) {
    console.warn("[core] AVISO: jobs.json ainda não existe — rode o scraper ou crie manualmente.")
  }
})

export default app

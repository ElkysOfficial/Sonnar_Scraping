import express from "express"
import cors from "cors"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { v4 as uuidv4 } from "uuid"

const PORT = process.env.MESSAGE_FORMATTING_CORE_PORT || 3100
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, "data")
const JOB_DATA_PATH = path.join(DATA_DIR, "job_data.json")

const app = express()
app.use(cors())
app.use(express.json({ limit: "2mb" }))

function ensureDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  if (!fs.existsSync(JOB_DATA_PATH)) {
    fs.writeFileSync(JOB_DATA_PATH, "[]", "utf8")
  }
}

function loadJobs() {
  ensureDirectory()
  try {
    let raw = fs.readFileSync(JOB_DATA_PATH, "utf8")
    if (!raw.trim()) {
      return []
    }
    raw = raw.replace(/^\uFEFF/, "")
    return JSON.parse(raw)
  } catch (error) {
    console.error("[core] failed to read job data:", error)
    return []
  }
}

function saveJobs(jobs) {
  ensureDirectory()
  fs.writeFileSync(JOB_DATA_PATH, JSON.stringify(jobs, null, 2), "utf8")
}

const CHANNEL_ALIASES = {
  discord: "discord",
  whatsapp: "whatsapp",
  telegram: "telegram",
  badge: "discord"
}

function normalizeChannel(channel) {
  if (!channel) {
    return "discord"
  }
  const key = channel.toString().toLowerCase()
  return CHANNEL_ALIASES[key] || key
}

function buildJob(payload) {
  const title = (payload.job_title || payload.title || payload.jobTitle || "").toString().trim()
  const url = (payload.job_url || payload.url || payload.jobUrl || "").toString().trim()
  if (!title || !url) {
    throw new Error("Os campos 'job_title' e 'job_url' são obrigatórios.")
  }

  const now = new Date().toISOString()
  return {
    id: payload.id ? payload.id.toString() : uuidv4(),
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
    statuses: {
      discord: false,
      whatsapp: false,
      telegram: false,
      ...(payload.statuses || {})
    }
  }
}

function mergeJobs(existing, incoming) {
  const merged = { ...existing }
  merged.job_title = incoming.job_title || merged.job_title
  merged.job_url = incoming.job_url || merged.job_url
  merged.company = incoming.company || merged.company
  merged.location = incoming.location || merged.location
  merged.work_type = incoming.work_type || merged.work_type
  merged.hiring_regime = incoming.hiring_regime || merged.hiring_regime
  merged.salary = incoming.salary || merged.salary
  merged.publication_date = incoming.publication_date || merged.publication_date
  merged.source = incoming.source || merged.source
  merged.updated_at = incoming.updated_at || incoming.created_at || new Date().toISOString()
  merged.statuses = { ...merged.statuses, ...incoming.statuses }
  return merged
}

app.post("/jobs", (req, res) => {
  try {
    const payload = req.body || {}
    const jobs = loadJobs()
    const incoming = buildJob(payload)
    const existingIndex = jobs.findIndex((job) => job.job_url === incoming.job_url)
    if (existingIndex >= 0) {
      jobs[existingIndex] = mergeJobs(jobs[existingIndex], incoming)
    } else {
      jobs.push(incoming)
    }
    saveJobs(jobs)
    return res.status(201).json({ success: true, job: incoming })
  } catch (error) {
    console.error("[core] falha ao salvar job", error)
    return res.status(400).json({ success: false, message: error.message })
  }
})

app.get("/jobs", (req, res) => {
  const jobs = loadJobs()
  res.json(jobs)
})

app.get("/jobs/pending", (req, res) => {
  const channel = normalizeChannel(req.query.channel)
  const jobs = loadJobs()
  const filtered = jobs.filter((job) => !(job.statuses?.[channel]))
  res.json(filtered)
})

app.put("/jobs/status", (req, res) => {
  const { id, channel, status } = req.body || {}
  if (!id) {
    return res.status(400).json({ success: false, message: "ID é obrigatório" })
  }
  const targetChannel = normalizeChannel(channel)
  const jobs = loadJobs()
  const index = jobs.findIndex((job) => job.id === id)
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Vaga não encontrada" })
  }
  jobs[index].statuses = { ...(jobs[index].statuses || {}), [targetChannel]: Boolean(status) }
  jobs[index].updated_at = new Date().toISOString()
  saveJobs(jobs)
  res.json({ success: true, job: jobs[index] })
})

app.get("/jobs/:id", (req, res) => {
  const jobs = loadJobs()
  const job = jobs.find((item) => item.id === req.params.id)
  if (!job) {
    return res.status(404).json({ success: false, message: "Vaga não encontrada" })
  }
  res.json(job)
})

app.listen(PORT, () => {
  ensureDirectory()
  console.log("message_formatting/core is running on http://localhost:" + PORT)
})

export default app

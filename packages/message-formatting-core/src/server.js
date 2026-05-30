import "dotenv/config"
import express from "express"
import compression from "compression"
import cors from "cors"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { openDb, JobsRepository } from "./db/jobsRepo.js"
import { migrateJsonToSqlite } from "./db/migrate.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.MESSAGE_FORMATTING_CORE_PORT || 3100

// Source-of-truth: SQLite (apps/scraper/src/data/jobs.db). Substituiu o
// jobs.json legado em v3.1.0 - cada POST /jobs/batch agora vira INSERT/UPDATE
// pontuais, sem re-serializar o arquivo inteiro a cada escrita.
//
// O jobs.json antigo, se existir, e importado automaticamente no boot pela
// migrate.js e renomeado para .bak-<timestamp> (preservado em disco).
const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "apps", "scraper", "src", "data")
const DEFAULT_DB_PATH = path.join(DATA_DIR, "jobs.db")
const DEFAULT_JOBS_PATH = path.join(DATA_DIR, "jobs.json")
const JOBS_DB_PATH = process.env.JOBS_DB_PATH || DEFAULT_DB_PATH
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

// ID deterministico (md5 da URL).
function deriveId(jobUrl) {
  return crypto.createHash("md5").update(jobUrl).digest("hex")
}

// ---------------- storage ----------------

const db = openDb(JOBS_DB_PATH)
const repo = new JobsRepository(db)

// Migracao automatica no boot. Idempotente: se o banco ja tem vagas ou
// nao existe jobs.json, nao faz nada.
try {
  migrateJsonToSqlite({ jobsJsonPath: JOBS_JSON_PATH, repo })
} catch (err) {
  console.error("[core] migrate: falhou criticamente, abortando boot:", err.message)
  process.exit(1)
}

// Janela de retencao: vagas com publication_date mais antigo que isto sao
// removidas no purge periodico. Default 90 dias. Com SQLite o purge e um
// DELETE indexado - quase instantaneo mesmo com 100k+ vagas.
const JOBS_MAX_AGE_DAYS = (() => {
  const n = Number(process.env.JOBS_MAX_AGE_DAYS)
  return Number.isFinite(n) && n >= 1 ? n : 90
})()
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000

function cutoffDate(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function purgeStaleJobs() {
  try {
    const removed = repo.purgeOlderThan(cutoffDate(JOBS_MAX_AGE_DAYS))
    if (removed > 0) {
      console.log(`[core] purge: ${removed} vaga(s) antiga(s) removida(s)`)
    }
  } catch (err) {
    console.error("[core] falha no purge de vagas antigas:", err.message)
  }
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

// Normaliza skills para sempre array de strings (aceita string CSV legada).
function normalizeSkills(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .map((s) => (s == null ? "" : s.toString().trim()))
      .filter((s) => s.length > 0)
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }
  return []
}

// Converte um entry persistido em job no formato esperado pelos bots.
function entryToApiJob(entry) {
  const url = entry.job_url || ""
  return {
    id: entry.id || (url ? deriveId(url) : ""),
    job_title: entry.job_title || "",
    job_url: url,
    company: entry.company || "",
    location: entry.location || entry.location_raw || "",
    work_type: entry.work_type || "",
    hiring_regime: entry.hiring_regime || "",
    salary: entry.salary || entry.salary_raw || "",
    publication_date: entry.publication_date || "",
    source: entry.source || "",
    skills: normalizeSkills(entry.skills),
    description: entry.description || "",
    created_at: entry.created_at || entry.first_seen_at || entry.scraped_at || "",
    updated_at: entry.updated_at || entry.last_seen_at || entry.scraped_at || "",
    statuses: sentToToStatuses(entry.sent_to)
  }
}

function buildIncoming(payload) {
  const title = (payload.job_title || payload.title || payload.jobTitle || "").toString().trim()
  const url = (payload.job_url || payload.url || payload.jobUrl || "").toString().trim()
  if (!title || !url) {
    throw new Error("Os campos 'job_title' e 'job_url' sao obrigatorios.")
  }

  const now = new Date().toISOString()
  const sentTo = []
  for (const ch of SUPPORTED_CHANNELS) {
    const fromStatuses = payload.statuses?.[ch]
    const fromFlat = payload[`status_${ch}`]
    if (fromStatuses || fromFlat) sentTo.push(ch)
  }

  return {
    job_title: title,
    job_url: url,
    company: (payload.company || "").toString().trim(),
    location: (payload.location || "").toString().trim(),
    work_type: (payload.work_type || payload.workType || "").toString().trim(),
    hiring_regime: (payload.hiring_regime || payload.regime || "").toString().trim(),
    salary: (payload.salary || "").toString().trim(),
    publication_date: (payload.publication_date || payload.publicationDate || "").toString().trim(),
    source: (payload.source || "").toString().trim(),
    skills: normalizeSkills(payload.skills),
    description: (payload.description || "").toString().trim(),
    created_at: payload.created_at || now,
    updated_at: now,
    sent_to: sentTo
  }
}

// ---------------- routes ----------------

const app = express()
app.use(cors())
// v3.6.0: gzip nas respostas. /jobs/pending pode retornar payload grande
// (~500KB-2MB). Compressao reduz ~70% bandwidth + RAM transit do socket.
// Threshold=1024 evita overhead em respostas pequenas (/health, etc).
app.use(compression({ threshold: 1024 }))

// Limites de corpo por rota: POST /jobs/batch recebe lotes grandes do scraper;
// os demais lidam com uma vaga so.
const jsonSmall = express.json({ limit: "1mb" })
const jsonBatch = express.json({ limit: "25mb" })

// POST /jobs - upsert por job_url. sent_to vem do proprio payload (este
// endpoint e usado quando o cliente quer explicitamente registrar envio).
app.post("/jobs", jsonSmall, (req, res) => {
  let incoming
  try {
    incoming = buildIncoming(req.body || {})
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message })
  }
  try {
    const merged = repo.upsertOne(incoming, { preserveSentTo: false })
    if (!merged) {
      return res.status(400).json({ success: false, message: "Vaga invalida." })
    }
    res.status(201).json({ success: true, job: entryToApiJob(merged) })
  } catch (err) {
    console.error("[core] POST /jobs falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /jobs/batch - upsert em lote, usado pelo scraper.
//
// sent_to NUNCA e sobrescrito pelo que o scraper manda: e autoridade do core
// (sao os bots que marcam envio). O repo.upsertBatch ja preserva.
//
// v3.6.0: guard de qualidade. Toda vaga deve ter passado pelo pipeline
// `enrich_canonical` (apps/scraper/src/utils/job_enrichment.py) antes de
// chegar aqui. Isso traduz a description pra PT (quando origem != pt) e
// extrai responsibilities. O sinal de que o enrichment rodou e o campo
// `description_lang` estar preenchido (idioma de origem detectado).
//
// Politica de produto: o banco NUNCA pode ter vaga com description em
// outro idioma que nao PT. Se uma engine esquecer de chamar enrich, o
// payload e rejeitado aqui — falha fica visivel no log do scraper em
// vez de poluir o banco silenciosamente.
function validateEnrichedJobs(jobs) {
  const missing = []
  for (const job of jobs) {
    const id = job?.id || job?.job_url || job?.url || "<sem-id>"
    if (!job?.description_lang) {
      missing.push(id)
    }
  }
  return missing
}

app.post("/jobs/batch", jsonBatch, (req, res) => {
  const incoming = Array.isArray(req.body?.jobs) ? req.body.jobs : null
  if (!incoming) {
    return res.status(400).json({ success: false, message: "Campo 'jobs' (array) e obrigatorio." })
  }
  const missingLang = validateEnrichedJobs(incoming)
  if (missingLang.length > 0) {
    const preview = missingLang.slice(0, 5).join(", ")
    const more = missingLang.length > 5 ? ` (+${missingLang.length - 5} mais)` : ""
    console.warn(
      `[core] POST /jobs/batch rejeitado: ${missingLang.length} vaga(s) sem description_lang. ` +
      `IDs: ${preview}${more}`
    )
    return res.status(422).json({
      success: false,
      message:
        "Vagas sem description_lang nao sao aceitas. Toda engine deve chamar " +
        "enrich_canonical antes do upload (politica de produto: banco so contem " +
        "descricoes em PT).",
      missingLang,
    })
  }
  try {
    const { upserted, skipped } = repo.upsertBatch(incoming)
    res.json({ success: true, upserted, skipped })
  } catch (err) {
    console.error("[core] POST /jobs/batch falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /jobs - vagas mais recentes (paginado por padrao).
//
// v3.10.18: antes devolvia TODAS as vagas (~68k -> 30MB JSON), causando
// OOM no wa-sender ao parsear. Agora paginado:
//   ?limit=N    maximo de vagas (default 5000, cap 50000)
//   ?since=ISO  apenas vagas com created_at >= since
//
// Cliente que precisa de tudo pode passar limit=50000 explicitamente
// (e nesse caso quem chama eh responsavel por nao estourar memoria).
app.get("/jobs", (req, res) => {
  try {
    const jobs = repo.listPaged({
      limit: req.query.limit,
      since: req.query.since || null,
    }).map(entryToApiJob)
    res.json(jobs)
  } catch (err) {
    console.error("[core] GET /jobs falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /jobs/pending?channel=X - vagas ainda nao enviadas no canal.
//
// ORDEM (v3.1.0): mais antigas primeiro (ORDER BY publication_date ASC).
// Decisao de produto: bot envia primeiro a vaga mais proxima de expirar.
app.get("/jobs/pending", (req, res) => {
  const channel = normalizeChannel(req.query.channel)
  try {
    const jobs = repo.listPending(channel).map(entryToApiJob)
    res.json(jobs)
  } catch (err) {
    console.error("[core] GET /jobs/pending falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /jobs/check-url - existe vaga com essa URL?
app.get("/jobs/check-url", (req, res) => {
  const url = req.query.url
  if (!url) return res.status(400).json({ success: false, message: "URL e obrigatoria" })
  try {
    res.json(repo.checkUrl(url))
  } catch (err) {
    console.error("[core] GET /jobs/check-url falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /stats - contagens por canal e por source.
app.get("/stats", (_req, res) => {
  try {
    res.json(repo.stats())
  } catch (err) {
    console.error("[core] GET /stats falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /jobs/:id - busca por id derivado.
app.get("/jobs/:id", (req, res) => {
  try {
    const entry = repo.getById(req.params.id)
    if (!entry) return res.status(404).json({ success: false, message: "Vaga nao encontrada" })
    res.json(entryToApiJob(entry))
  } catch (err) {
    console.error("[core] GET /jobs/:id falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUT /jobs/status - marca status de envio para um canal.
app.put("/jobs/status", jsonSmall, (req, res) => {
  const { id, channel, status } = req.body || {}
  if (!id) return res.status(400).json({ success: false, message: "ID e obrigatorio" })

  const targetChannel = normalizeChannel(channel)
  try {
    const entry = repo.setChannelStatus(id, targetChannel, !!status)
    if (!entry) return res.status(404).json({ success: false, message: "Vaga nao encontrada" })
    res.json({ success: true, job: entryToApiJob(entry) })
  } catch (err) {
    console.error("[core] PUT /jobs/status falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// DELETE /jobs/:id - remove vaga.
app.delete("/jobs/:id", (req, res) => {
  try {
    const ok = repo.deleteById(req.params.id)
    if (!ok) return res.status(404).json({ success: false, message: "Vaga nao encontrada" })
    res.json({ success: true })
  } catch (err) {
    console.error("[core] DELETE /jobs falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// Health - inclui contagem do banco (util pra monitoramento).
app.get("/health", (_req, res) => {
  try {
    const total = repo.count()
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      backend: "sqlite",
      dbPath: JOBS_DB_PATH,
      jobs: total
    })
  } catch (err) {
    res.status(500).json({ status: "degraded", message: err.message })
  }
})

// Normaliza erros nao capturados.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ success: false, message: "Corpo JSON invalido." })
  }
  console.error("[core] erro nao tratado:", err?.message || err)
  res.status(500).json({ success: false, message: "Erro interno." })
})

// Shutdown limpo: fecha o handle do SQLite pra garantir flush do WAL.
function shutdown(signal) {
  console.log(`[core] recebido ${signal}, fechando banco...`)
  try { db.close() } catch { /* ja fechado */ }
  process.exit(0)
}
process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

app.listen(PORT, () => {
  console.log(`[core] message-formatting-core ouvindo em http://localhost:${PORT}`)
  console.log(`[core] fonte de dados: ${JOBS_DB_PATH} (${repo.count()} vagas)`)
  // Purge no boot + a cada 6h. Com SQLite o purge e instantaneo.
  purgeStaleJobs()
  setInterval(purgeStaleJobs, PURGE_INTERVAL_MS)
})

// Para nao causar quebra silenciosa nos testes/dev que importam o app.
fs.mkdirSync(path.dirname(JOBS_DB_PATH), { recursive: true })

export default app

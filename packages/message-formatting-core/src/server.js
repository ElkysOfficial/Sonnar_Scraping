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

// Source-of-truth: jobs.json. O core é o ÚNICO processo que grava este
// arquivo (single-writer); o scraper envia as vagas via POST /jobs/batch.
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

// Fila de escrita: TODA mutação do jobs.json (ler → modificar → gravar) roda
// serializada aqui dentro. Serializar só a gravação não bastava — dois
// handlers podiam ler a mesma versão, modificar e gravar, e o último
// sobrescrevia o outro (lost update). Agora o ciclo inteiro é transacional.
let writeQueue = Promise.resolve()

// Sentinela: um mutator pode devolvê-la para indicar "nada mudou, não grave".
const SKIP_WRITE = Symbol("skip-write")

// Leitura tolerante: usada pelos endpoints GET. Em erro devolve {} (degrada
// para "vazio" em vez de derrubar a request).
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

// Leitura estrita: usada DENTRO de uma transação de escrita. Se o arquivo
// existe mas não pode ser lido/parseado, LANÇA — abortar é mais seguro do que
// gravar {} por cima e apagar todas as vagas. Arquivo ausente => {} (1ª escrita).
function readJobsFileStrict() {
  if (!fs.existsSync(JOBS_JSON_PATH)) return {}
  const raw = fs.readFileSync(JOBS_JSON_PATH, "utf8").trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

// Renomeia tmp -> destino com retentativas. No Windows o rename pode falhar
// (EBUSY/EPERM/EACCES) se outro processo tiver o arquivo aberto naquele
// instante — tentar de novo algumas vezes resolve.
const RENAME_ATTEMPTS = 12
const RENAME_DELAY_MS = 200

async function renameWithRetry(tmp, dest) {
  for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt++) {
    try {
      fs.renameSync(tmp, dest)
      return
    } catch (err) {
      const transient = ["EBUSY", "EPERM", "EACCES"].includes(err.code)
      if (!transient || attempt === RENAME_ATTEMPTS - 1) throw err
      await new Promise((r) => setTimeout(r, RENAME_DELAY_MS))
    }
  }
}

// Aplica uma mutação ao jobs.json de forma TRANSACIONAL: o ciclo ler →
// mutator(data) → gravar inteiro roda dentro da fila, serializado. Assim dois
// handlers concorrentes nunca leem a mesma versão e sobrescrevem um ao outro.
//
// `mutator(data)` recebe o dict atual, modifica-o in-place e pode devolver um
// valor (repassado ao chamador) ou `SKIP_WRITE` para pular a gravação. Se a
// leitura/escrita falhar, a promise é rejeitada — o endpoint deve responder
// erro para o cliente poder reenviar (nada de sucesso silencioso).
//
// O PID no nome do tmp é defesa extra: duas instâncias do core no mesmo
// diretório nunca colidem no arquivo temporário.
function updateJobsFile(mutator) {
  const run = writeQueue.then(async () => {
    const data = readJobsFileStrict()
    const result = await mutator(data)
    if (result === SKIP_WRITE) return undefined

    const tmp = `${JOBS_JSON_PATH}.${process.pid}.tmp`
    try {
      fs.mkdirSync(path.dirname(JOBS_JSON_PATH), { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8")
      await renameWithRetry(tmp, JOBS_JSON_PATH)
    } catch (err) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
      } catch {
        /* tmp já removido ou inacessível — ignora */
      }
      throw err
    }
    return result
  })
  // A fila não pode travar se uma transação falhar: o próximo updateJobsFile
  // encadeia na versão "engolida". O chamador recebe o erro real via `run`.
  writeQueue = run.then(
    () => {},
    () => {}
  )
  return run
}

// Janela de retenção: vagas com publication_date mais antigo que isto são
// removidas do jobs.json (não devem ser enviadas pelos bots). Com o
// single-writer, o purge é responsabilidade do core (único escritor).
// Valor inválido (não-finito ou < 1) cai no default de 90 dias.
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

async function purgeStaleJobs() {
  try {
    const removed = await updateJobsFile((data) => {
      const cutoff = cutoffDate(JOBS_MAX_AGE_DAYS)
      let n = 0
      for (const url of Object.keys(data)) {
        const pub = data[url].publication_date
        if (pub && pub < cutoff) {
          delete data[url]
          n++
        }
      }
      return n > 0 ? n : SKIP_WRITE
    })
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

// Converte uma entrada do dict jobs.json em job no formato esperado pelos bots.
function entryToApiJob(entry) {
  const url = entry.job_url || ""
  return {
    id: entry.id || (url ? deriveId(url) : ""),
    job_title: entry.job_title || "",
    job_url: url,
    company: entry.company || "",
    // jobs.json (scraper) usa sufixo *_raw; fallback p/ formatos legados.
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
      skills: normalizeSkills(payload.skills),
      description: (payload.description || "").toString().trim(),
      created_at: payload.created_at || now,
      updated_at: now,
      sent_to: sentTo
    }
  }
}

// ---------------- routes ----------------

const app = express()
app.use(cors())

// Limites de corpo por rota: o POST /jobs/batch recebe lotes grandes do
// scraper; os demais endpoints de escrita lidam com uma vaga só. Aplicar o
// limite grande apenas onde é preciso reduz a superfície de memória/DoS do
// parser JSON (o body inteiro é materializado em memória).
const jsonSmall = express.json({ limit: "1mb" })
const jsonBatch = express.json({ limit: "25mb" })

// POST /jobs - upsert por job_url
app.post("/jobs", jsonSmall, async (req, res) => {
  let incoming
  try {
    incoming = buildIncoming(req.body || {})
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message })
  }
  try {
    const merged = await updateJobsFile((data) => {
      const existing = data[incoming.url] || {}
      const mergedSent = Array.from(
        new Set([...(existing.sent_to || []), ...incoming.entry.sent_to])
      )
      const m = {
        ...existing,
        ...incoming.entry,
        sent_to: mergedSent,
        created_at: existing.created_at || incoming.entry.created_at
      }
      data[incoming.url] = m
      return m
    })
    res.status(201).json({ success: true, job: entryToApiJob(merged) })
  } catch (err) {
    console.error("[core] POST /jobs falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /jobs/batch - upsert em lote, usado pelo scraper.
//
// SINGLE-WRITER: o core é o ÚNICO processo que grava o jobs.json. O scraper
// não escreve mais o arquivo — coleta as vagas e envia para cá. Isso elimina
// a corrida de dois escritores sobre o mesmo arquivo (que causava ENOENT no
// rename). A leitura+merge+gravação roda dentro de updateJobsFile (fila), então
// um PUT /jobs/status concorrente nunca é sobrescrito por este batch.
//
// sent_to NUNCA é sobrescrito pelo que o scraper manda: ele é autoridade do
// core (são os bots que marcam envio). Sempre preservamos o sent_to em disco.
app.post("/jobs/batch", jsonBatch, async (req, res) => {
  const incoming = Array.isArray(req.body?.jobs) ? req.body.jobs : null
  if (!incoming) {
    return res.status(400).json({ success: false, message: "Campo 'jobs' (array) é obrigatório." })
  }
  try {
    const counts = await updateJobsFile((data) => {
      const now = new Date().toISOString()
      let upserted = 0
      let skipped = 0
      for (const job of incoming) {
        const url = (job?.job_url || "").toString().trim()
        if (!url || !job.job_title) {
          skipped++
          continue
        }
        const existing = data[url] || {}
        data[url] = {
          ...existing,
          ...job,
          // sent_to é autoridade do core — ignora o que o scraper enviou.
          sent_to: existing.sent_to || [],
          created_at: existing.created_at || job.created_at || job.scraped_at || now,
          updated_at: now
        }
        upserted++
      }
      return upserted > 0 ? { upserted, skipped } : SKIP_WRITE
    })
    if (counts === undefined) {
      // Nenhuma vaga válida no lote — nada gravado.
      return res.json({ success: true, upserted: 0, skipped: incoming.length })
    }
    res.json({ success: true, ...counts })
  } catch (err) {
    console.error("[core] POST /jobs/batch falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
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
app.put("/jobs/status", jsonSmall, async (req, res) => {
  const { id, channel, status } = req.body || {}
  if (!id) return res.status(400).json({ success: false, message: "ID é obrigatório" })

  const targetChannel = normalizeChannel(channel)
  try {
    const entry = await updateJobsFile((data) => {
      const hit = findEntryById(data, id)
      if (!hit) return SKIP_WRITE

      const sentSet = new Set(hit.entry.sent_to || [])
      if (status) sentSet.add(targetChannel)
      else sentSet.delete(targetChannel)

      hit.entry.sent_to = Array.from(sentSet).sort()
      hit.entry.updated_at = new Date().toISOString()
      data[hit.url] = hit.entry
      return hit.entry
    })
    if (entry === undefined) {
      return res.status(404).json({ success: false, message: "Vaga não encontrada" })
    }
    res.json({ success: true, job: entryToApiJob(entry) })
  } catch (err) {
    console.error("[core] PUT /jobs/status falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// DELETE /jobs/:id - remove vaga
app.delete("/jobs/:id", async (req, res) => {
  try {
    const removed = await updateJobsFile((data) => {
      const hit = findEntryById(data, req.params.id)
      if (!hit) return SKIP_WRITE
      delete data[hit.url]
      return true
    })
    if (removed === undefined) {
      return res.status(404).json({ success: false, message: "Vaga não encontrada" })
    }
    res.json({ success: true })
  } catch (err) {
    console.error("[core] DELETE /jobs falhou:", err.message)
    res.status(500).json({ success: false, message: err.message })
  }
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
    console.warn("[core] AVISO: jobs.json ainda não existe — será criado quando o scraper enviar o 1º lote.")
  }
  // Purge de vagas antigas: no boot e a cada 6h (o core é o único escritor).
  purgeStaleJobs()
  setInterval(purgeStaleJobs, PURGE_INTERVAL_MS)
})

export default app

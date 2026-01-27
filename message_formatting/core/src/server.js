import "dotenv/config"
import express from "express"
import cors from "cors"
import { v4 as uuidv4 } from "uuid"
import { createClient } from "@supabase/supabase-js"

const PORT = process.env.MESSAGE_FORMATTING_CORE_PORT || 3100

// Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[core] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const app = express()
app.use(cors())
app.use(express.json({ limit: "2mb" }))

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
    status_discord: payload.statuses?.discord ?? payload.status_discord ?? false,
    status_whatsapp: payload.statuses?.whatsapp ?? payload.status_whatsapp ?? false,
    status_telegram: payload.statuses?.telegram ?? payload.status_telegram ?? false
  }
}

// Transform DB row to API format (for backwards compatibility)
function transformJobForApi(job) {
  return {
    id: job.id,
    job_title: job.job_title,
    job_url: job.job_url,
    company: job.company,
    location: job.location,
    work_type: job.work_type,
    hiring_regime: job.hiring_regime,
    salary: job.salary,
    publication_date: job.publication_date,
    source: job.source,
    created_at: job.created_at,
    updated_at: job.updated_at,
    statuses: {
      discord: job.status_discord,
      whatsapp: job.status_whatsapp,
      telegram: job.status_telegram
    }
  }
}

// POST /jobs - Add or update a job
app.post("/jobs", async (req, res) => {
  try {
    const payload = req.body || {}
    const incoming = buildJob(payload)

    const { data, error } = await supabase
      .from("jobs")
      .upsert(incoming, { onConflict: "job_url" })
      .select()
      .single()

    if (error) {
      console.error("[core] falha ao salvar job no Supabase", error)
      return res.status(500).json({ success: false, message: error.message })
    }

    return res.status(201).json({ success: true, job: transformJobForApi(data) })
  } catch (error) {
    console.error("[core] falha ao salvar job", error)
    return res.status(400).json({ success: false, message: error.message })
  }
})

// GET /jobs - Get all jobs
app.get("/jobs", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[core] falha ao buscar jobs", error)
      return res.status(500).json({ success: false, message: error.message })
    }

    const jobs = data.map(transformJobForApi)
    res.json(jobs)
  } catch (error) {
    console.error("[core] erro ao buscar jobs", error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /jobs/pending - Get jobs pending for a channel
app.get("/jobs/pending", async (req, res) => {
  try {
    const channel = normalizeChannel(req.query.channel)
    const statusColumn = `status_${channel}`

    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq(statusColumn, false)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[core] falha ao buscar jobs pendentes", error)
      return res.status(500).json({ success: false, message: error.message })
    }

    const jobs = data.map(transformJobForApi)
    res.json(jobs)
  } catch (error) {
    console.error("[core] erro ao buscar jobs pendentes", error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT /jobs/status - Update job status for a channel
app.put("/jobs/status", async (req, res) => {
  try {
    const { id, channel, status } = req.body || {}
    if (!id) {
      return res.status(400).json({ success: false, message: "ID é obrigatório" })
    }

    const targetChannel = normalizeChannel(channel)
    const statusColumn = `status_${targetChannel}`

    const { data, error } = await supabase
      .from("jobs")
      .update({
        [statusColumn]: Boolean(status),
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ success: false, message: "Vaga não encontrada" })
      }
      console.error("[core] falha ao atualizar status", error)
      return res.status(500).json({ success: false, message: error.message })
    }

    res.json({ success: true, job: transformJobForApi(data) })
  } catch (error) {
    console.error("[core] erro ao atualizar status", error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /jobs/:id - Get a job by ID
app.get("/jobs/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", req.params.id)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ success: false, message: "Vaga não encontrada" })
      }
      console.error("[core] falha ao buscar job", error)
      return res.status(500).json({ success: false, message: error.message })
    }

    res.json(transformJobForApi(data))
  } catch (error) {
    console.error("[core] erro ao buscar job", error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /jobs/check-url - Check if a job URL exists
app.get("/jobs/check-url", async (req, res) => {
  try {
    const url = req.query.url
    if (!url) {
      return res.status(400).json({ success: false, message: "URL é obrigatória" })
    }

    const { data, error } = await supabase
      .from("jobs")
      .select("id")
      .eq("job_url", url)
      .maybeSingle()

    if (error) {
      console.error("[core] falha ao verificar URL", error)
      return res.status(500).json({ success: false, message: error.message })
    }

    res.json({ exists: !!data, id: data?.id || null })
  } catch (error) {
    console.error("[core] erro ao verificar URL", error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// DELETE /jobs/:id - Delete a job
app.delete("/jobs/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("jobs")
      .delete()
      .eq("id", req.params.id)

    if (error) {
      console.error("[core] falha ao deletar job", error)
      return res.status(500).json({ success: false, message: error.message })
    }

    res.json({ success: true })
  } catch (error) {
    console.error("[core] erro ao deletar job", error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /stats - Get job statistics
app.get("/stats", async (req, res) => {
  try {
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("status_discord, status_whatsapp, status_telegram, source")

    if (error) {
      console.error("[core] falha ao buscar stats", error)
      return res.status(500).json({ success: false, message: error.message })
    }

    const stats = {
      total: jobs.length,
      pending: {
        discord: jobs.filter((j) => !j.status_discord).length,
        whatsapp: jobs.filter((j) => !j.status_whatsapp).length,
        telegram: jobs.filter((j) => !j.status_telegram).length
      },
      sent: {
        discord: jobs.filter((j) => j.status_discord).length,
        whatsapp: jobs.filter((j) => j.status_whatsapp).length,
        telegram: jobs.filter((j) => j.status_telegram).length
      },
      bySource: {}
    }

    for (const job of jobs) {
      const source = job.source || "unknown"
      stats.bySource[source] = (stats.bySource[source] || 0) + 1
    }

    res.json(stats)
  } catch (error) {
    console.error("[core] erro ao buscar stats", error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log("message_formatting/core is running on http://localhost:" + PORT)
  console.log("Using Supabase database: " + SUPABASE_URL)
})

export default app

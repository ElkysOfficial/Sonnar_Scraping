/**
 * Job Data Client — fala HTTP com message-formatting-core
 * Fonte real: apps/scraper/src/data/jobs.json (gerenciado pelo core).
 */

import "dotenv/config"
import axios from "axios"

const CORE_BASE_URL = process.env.MESSAGE_FORMATTING_CORE_URL || "http://localhost:3100"
const client = axios.create({ baseURL: CORE_BASE_URL, timeout: 10000 })

/**
 * Acrescenta os aliases `title`/`url` que partes do WhatsApp esperam,
 * mantendo o shape original retornado pelo core.
 */
function withLegacyAliases(job) {
  return {
    ...job,
    title: job.job_title,
    url: job.job_url
  }
}

export async function fetchJobData() {
  try {
    const { data } = await client.get("/jobs")
    return Array.isArray(data) ? data.map(withLegacyAliases) : []
  } catch (error) {
    console.error("[jobDataClient] Error fetching jobs:", error.message)
    return []
  }
}

export async function fetchPendingJobs(limit = 100) {
  try {
    const { data } = await client.get("/jobs/pending", { params: { channel: "whatsapp" } })
    if (!Array.isArray(data)) return []
    return data.slice(0, limit).map(withLegacyAliases)
  } catch (error) {
    console.error("[jobDataClient] Error fetching pending jobs:", error.message)
    return []
  }
}

export async function getJobById(id) {
  try {
    const { data } = await client.get(`/jobs/${encodeURIComponent(id)}`)
    return data ? withLegacyAliases(data) : null
  } catch (error) {
    if (error.response?.status === 404) return null
    console.error("[jobDataClient] Error fetching job:", error.message)
    return null
  }
}

export async function markJobStatus(id, channel, status = true) {
  try {
    const { data } = await client.put("/jobs/status", { id, channel, status })
    return data?.job ? withLegacyAliases(data.job) : null
  } catch (error) {
    console.error("[jobDataClient] Error updating job status:", error.message)
    return null
  }
}

export async function getJobStats() {
  try {
    const { data } = await client.get("/stats")
    const total = data?.total ?? 0
    const pending = data?.pending?.whatsapp ?? 0
    const sent = data?.sent?.whatsapp ?? Math.max(0, total - pending)
    return { total, pending, sent }
  } catch (error) {
    console.error("[jobDataClient] Error fetching stats:", error.message)
    return { total: 0, pending: 0, sent: 0 }
  }
}

export default {
  fetchJobData,
  fetchPendingJobs,
  getJobById,
  markJobStatus,
  getJobStats
}

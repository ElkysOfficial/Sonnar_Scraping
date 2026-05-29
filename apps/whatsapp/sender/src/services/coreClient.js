/**
 * Cliente HTTP do message-formatting-core. Migrou do `apps/whatsapp/formatter/src/utils/jobDataClient.js`
 * quando o processo `sonnar-wa-formatter` foi removido — o sender agora fala direto
 * com o core (mesma VPS, localhost:3100), sem o middleman do formatter.
 *
 * Logica preservada 1:1.
 */

import "dotenv/config"
import axios from "axios"
import { errorLog } from "../utils/logger.js"

const CORE_BASE_URL = process.env.MESSAGE_FORMATTING_CORE_URL || "http://localhost:3100"
const client = axios.create({ baseURL: CORE_BASE_URL, timeout: 10000 })

function withLegacyAliases(job) {
  return {
    ...job,
    title: job.job_title,
    url: job.job_url
  }
}

export async function fetchPendingJobs(limit = 100) {
  try {
    const { data } = await client.get("/jobs/pending", { params: { channel: "whatsapp" } })
    if (!Array.isArray(data)) return []
    return data.slice(0, limit).map(withLegacyAliases)
  } catch (error) {
    errorLog(`[coreClient] Error fetching pending jobs: ${error.message}`)
    return []
  }
}

export async function markJobStatus(id, channel, status = true) {
  try {
    const { data } = await client.put("/jobs/status", { id, channel, status })
    return data?.job ? withLegacyAliases(data.job) : null
  } catch (error) {
    errorLog(`[coreClient] Error updating job status: ${error.message}`)
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
    errorLog(`[coreClient] Error fetching stats: ${error.message}`)
    return { total: 0, pending: 0, sent: 0 }
  }
}

export default { fetchPendingJobs, markJobStatus, getJobStats }

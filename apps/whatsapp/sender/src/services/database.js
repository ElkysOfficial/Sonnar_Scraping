/**
 * Database Service for WhatsApp Bot
 *
 * Camada de acesso ao Supabase do PORTAL (projeto compartilhado bot/portal)
 * e ao message-formatting-core (jobs.json via HTTP).
 *
 * Escopo atual (refactor 2026-05-16):
 *  - Jobs: vem do core (HTTP), nao do Supabase.
 *  - sender_state / group_delivery_history / vip_delivery_history: Supabase.
 *  - vip_subscribers (Fluxo B) e leitura do portal (Fluxo A): ver utils/database.js.
 *  - Moderacao de grupo (group_features/auto_responders/user_mutes) foi
 *    descontinuada — nao ha mais tabelas nem funcoes para isso.
 */

import axios from "axios"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env")
dotenv.config({ path: envPath })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "[database] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check your .env file."
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// =====================================================
// SENDER STATE
// =====================================================

const SENDER_STATE_SELECT_FIELDS =
  "id, sender_type, last_sent_at, last_processed_job_id, last_processed_created_at, jobs_processed_count, metadata"

/**
 * Get sender state
 */
export async function getSenderState(senderType) {
  const { data, error } = await supabase
    .from("sender_state")
    .select(SENDER_STATE_SELECT_FIELDS)
    .eq("sender_type", senderType)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Update sender state (marca d'agua simples — card/job senders)
 */
export async function updateSenderState(senderType, lastSentAt = new Date(), metadata = {}) {
  const { data, error } = await supabase
    .from("sender_state")
    .upsert(
      {
        sender_type: senderType,
        last_sent_at: lastSentAt instanceof Date ? lastSentAt.toISOString() : lastSentAt,
        metadata: metadata
      },
      { onConflict: "sender_type" }
    )
    .select("id, sender_type, last_sent_at")
    .single()

  if (error) throw error
  return data
}

/**
 * Atualiza sender_state apos processar jobs (delta fetch)
 */
export async function updateSenderStateDelta(senderType, lastJobId, lastCreatedAt, jobsCount) {
  const { data, error } = await supabase
    .from("sender_state")
    .upsert(
      {
        sender_type: senderType,
        last_sent_at: new Date().toISOString(),
        last_processed_job_id: lastJobId,
        last_processed_created_at: lastCreatedAt,
        jobs_processed_count: jobsCount,
        metadata: {}
      },
      { onConflict: "sender_type" }
    )
    .select("id, sender_type, last_processed_created_at")
    .single()

  if (error) throw error
  return data
}

// =====================================================
// GROUP DELIVERY HISTORY
// =====================================================

/**
 * Record job delivery to group
 */
export async function recordGroupDelivery(jobId, groupId) {
  const { data, error } = await supabase
    .from("group_delivery_history")
    .upsert(
      { job_id: jobId, group_id: groupId },
      { onConflict: "job_id,group_id", ignoreDuplicates: true }
    )
    .select("id")
    .single()

  if (error && error.code !== "23505") throw error
  return data
}

/**
 * Check if job was sent to group today
 */
export async function wasJobSentToGroupToday(jobId, groupId) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from("group_delivery_history")
    .select("id")
    .eq("job_id", jobId)
    .eq("group_id", groupId)
    .gte("sent_at", today.toISOString())
    .maybeSingle()

  if (error) throw error
  return !!data
}

/**
 * Get jobs sent to group today
 */
export async function getGroupSentJobsToday(groupId) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from("group_delivery_history")
    .select("job_id")
    .eq("group_id", groupId)
    .gte("sent_at", today.toISOString())
    .order("sent_at", { ascending: false })
    .limit(1000)

  if (error) throw error
  return new Set(data.map((d) => d.job_id))
}

// =====================================================
// CLEANUP - Limpeza automatica de registros antigos
// =====================================================

/**
 * Remove registros antigos de vip_delivery_history
 */
export async function cleanupOldVipDeliveryHistory(daysToKeep = 30) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

  const { error } = await supabase
    .from("vip_delivery_history")
    .delete()
    .lt("sent_at", cutoffDate.toISOString())

  if (error) throw error
  return true
}

/**
 * Remove registros antigos de group_delivery_history
 */
export async function cleanupOldGroupDeliveryHistory(daysToKeep = 7) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

  const { error } = await supabase
    .from("group_delivery_history")
    .delete()
    .lt("sent_at", cutoffDate.toISOString())

  if (error) throw error
  return true
}

/**
 * Executa cleanup completo de todos os historicos
 */
export async function runFullCleanup() {
  await cleanupOldVipDeliveryHistory(30)
  await cleanupOldGroupDeliveryHistory(7)
  return { ok: true }
}

// =====================================================
// JOBS (via message-formatting-core / jobs.json)
// =====================================================
// Fonte: apps/scraper/src/data/jobs.json, servido pelo core via HTTP.

const CORE_BASE_URL = process.env.MESSAGE_FORMATTING_CORE_URL || process.env.CORE_API_URL || "http://localhost:3100"
const coreClient = axios.create({ baseURL: CORE_BASE_URL, timeout: 15000 })

// Converte job API (statuses object) -> shape "raw db row" que os callers esperam.
function jobApiToDbShape(job) {
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
    // skills/description vem do core e sao usados pelo card e pelo snapshot.
    skills: Array.isArray(job.skills) ? job.skills : [],
    description: job.description || "",
    created_at: job.created_at,
    updated_at: job.updated_at,
    status_discord: !!job.statuses?.discord,
    status_whatsapp: !!job.statuses?.whatsapp,
    status_telegram: !!job.statuses?.telegram
  }
}

async function fetchAllJobsFromCore() {
  const { data } = await coreClient.get("/jobs")
  return (Array.isArray(data) ? data : []).map(jobApiToDbShape)
}

/**
 * Get all jobs (for VIP matching/search)
 */
export async function getAllJobs(options = {}) {
  let limit, createdAfter, cursorCreatedAt, cursorId

  if (Number.isInteger(options)) {
    limit = options
  } else if (options && typeof options === "object") {
    limit = options.limit
    createdAfter = options.createdAfter
    cursorCreatedAt = options.cursorCreatedAt
    cursorId = options.cursorId
  }

  let rows = await fetchAllJobsFromCore()

  if (createdAfter) {
    rows = rows.filter((j) => (j.created_at || "") >= createdAfter)
  }

  if (cursorCreatedAt && cursorId) {
    rows = rows.filter((j) => {
      const ts = j.created_at || ""
      if (ts < cursorCreatedAt) return true
      if (ts === cursorCreatedAt && (j.id || "") < cursorId) return true
      return false
    })
  }

  if (Number.isInteger(limit)) {
    rows = rows.slice(0, limit)
  }
  return rows
}

/**
 * Get jobs using keyset pagination (cursor-based)
 */
export async function getJobsPage(options = {}) {
  const { limit = 50, cursorCreatedAt, cursorId, statusFilter } = options
  let rows = await fetchAllJobsFromCore()

  if (cursorCreatedAt && cursorId) {
    rows = rows.filter((j) => {
      const ts = j.created_at || ""
      if (ts < cursorCreatedAt) return true
      if (ts === cursorCreatedAt && (j.id || "") < cursorId) return true
      return false
    })
  }

  if (statusFilter === "pending_whatsapp") rows = rows.filter((j) => !j.status_whatsapp)
  else if (statusFilter === "pending_discord") rows = rows.filter((j) => !j.status_discord)
  else if (statusFilter === "pending_telegram") rows = rows.filter((j) => !j.status_telegram)

  const hasMore = rows.length > limit
  const pageData = hasMore ? rows.slice(0, limit) : rows

  let nextCursor = null
  if (hasMore && pageData.length > 0) {
    const last = pageData[pageData.length - 1]
    nextCursor = { createdAt: last.created_at, id: last.id }
  }
  return { data: pageData, nextCursor }
}

/**
 * Get jobs delta (novos desde ultima execucao) — usa sender_state como marca d'agua.
 */
export async function getJobsDelta(senderType, limit = 100) {
  const state = await getSenderState(senderType)
  const lastCreatedAt = state?.last_processed_created_at

  let rows = await fetchAllJobsFromCore()
  rows.sort((a, b) => {
    const ta = a.created_at || ""
    const tb = b.created_at || ""
    if (ta !== tb) return ta.localeCompare(tb)
    return (a.id || "").localeCompare(b.id || "")
  })

  if (lastCreatedAt) {
    rows = rows.filter((j) => (j.created_at || "") > lastCreatedAt)
  }
  return rows.slice(0, limit)
}

/**
 * Get pending jobs for WhatsApp
 */
export async function getPendingWhatsAppJobs(limit = 100) {
  const { data } = await coreClient.get("/jobs/pending", { params: { channel: "whatsapp" } })
  const rows = (Array.isArray(data) ? data : []).map(jobApiToDbShape)
  return rows.slice(0, limit)
}

/**
 * Mark job as sent to WhatsApp
 */
export async function markJobSentToWhatsApp(jobId) {
  const { data } = await coreClient.put("/jobs/status", {
    id: jobId,
    channel: "whatsapp",
    status: true
  })
  const job = data?.job
  if (!job) return null
  return { id: job.id, status_whatsapp: !!job.statuses?.whatsapp }
}

/**
 * Get job by ID
 */
export async function getJobById(jobId) {
  try {
    const { data } = await coreClient.get(`/jobs/${encodeURIComponent(jobId)}`)
    return data ? jobApiToDbShape(data) : null
  } catch (err) {
    if (err.response?.status === 404) return null
    throw err
  }
}

/**
 * Transform job for API compatibility
 */
export function transformJobForApi(job) {
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
    skills: Array.isArray(job.skills) ? job.skills : [],
    description: job.description || "",
    created_at: job.created_at,
    updated_at: job.updated_at,
    statuses: {
      discord: job.status_discord,
      whatsapp: job.status_whatsapp,
      telegram: job.status_telegram
    }
  }
}

export default {
  supabase,
  // Sender State
  getSenderState,
  updateSenderState,
  updateSenderStateDelta,
  // Group Delivery History
  recordGroupDelivery,
  wasJobSentToGroupToday,
  getGroupSentJobsToday,
  // Cleanup
  cleanupOldVipDeliveryHistory,
  cleanupOldGroupDeliveryHistory,
  runFullCleanup,
  // Jobs
  getAllJobs,
  getJobsPage,
  getJobsDelta,
  getPendingWhatsAppJobs,
  markJobSentToWhatsApp,
  getJobById,
  transformJobForApi
}

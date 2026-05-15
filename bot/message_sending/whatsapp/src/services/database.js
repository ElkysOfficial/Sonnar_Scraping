/**
 * Database Service for WhatsApp Bot
 * Provides Supabase-backed storage for all bot data
 * Replaces JSON file storage with proper database persistence
 */

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

const JOB_SELECT_FIELDS = [
  "id",
  "job_title",
  "job_url",
  "company",
  "location",
  "work_type",
  "hiring_regime",
  "salary",
  "publication_date",
  "source",
  "created_at",
  "updated_at",
  "status_discord",
  "status_whatsapp",
  "status_telegram"
].join(",")

// Campos específicos para VIP Subscribers (evita SELECT *)
const VIP_SUBSCRIBER_SELECT_FIELDS = [
  "id",
  "user_name",
  "lid",
  "phone",
  "stacks",
  "filters",
  "active",
  "added_at",
  "updated_at"
].join(",")

// Campos específicos para VIP Pending Subscribers
const VIP_PENDING_SELECT_FIELDS = [
  "id",
  "user_name",
  "lid",
  "phone",
  "stacks",
  "filters",
  "payment_proof",
  "status",
  "requested_at",
  "decided_at",
  "decided_by",
  "payment_received_at",
  "reject_reason"
].join(",")

// Campos específicos para Auto Responders
const AUTO_RESPONDER_SELECT_FIELDS = "id, group_id, match_pattern, answer, active, created_at"

// Campos específicos para Group Features
const GROUP_FEATURE_SELECT_FIELDS = "id, group_id, feature, enabled, config"

// =====================================================
// VIP SUBSCRIBERS
// =====================================================

/**
 * Get all active VIP subscribers
 */
export async function getActiveVipSubscribers() {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .select(VIP_SUBSCRIBER_SELECT_FIELDS)
    .eq("active", true)

  if (error) throw error
  return data
}

/**
 * Get VIP subscriber by LID
 */
export async function getVipSubscriberByLid(lid) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .select(VIP_SUBSCRIBER_SELECT_FIELDS)
    .eq("lid", lid)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Create or update VIP subscriber
 */
export async function upsertVipSubscriber(subscriber) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .upsert(
      {
        user_name: subscriber.user_name || subscriber.userName,
        lid: subscriber.lid,
        phone: subscriber.phone,
        stacks: subscriber.stacks || [],
        filters: subscriber.filters || {},
        active: subscriber.active ?? true
      },
      { onConflict: "lid" }
    )
    .select("id, lid, active")
    .single()

  if (error) throw error
  return data
}

/**
 * Deactivate VIP subscriber
 */
export async function deactivateVipSubscriber(lid) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .update({ active: false })
    .eq("lid", lid)
    .select("id, lid, active")
    .single()

  if (error) throw error
  return data
}

/**
 * Update VIP subscriber filters
 */
export async function updateVipFilters(lid, filters) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .update({ filters })
    .eq("lid", lid)
    .select("id, lid, filters")
    .single()

  if (error) throw error
  return data
}

// =====================================================
// VIP PENDING SUBSCRIBERS
// =====================================================

/**
 * Get all pending VIP subscribers
 */
export async function getPendingVipSubscribers() {
  const { data, error } = await supabase
    .from("vip_pending_subscribers")
    .select(VIP_PENDING_SELECT_FIELDS)
    .eq("status", "pending")
    .order("requested_at", { ascending: true })

  if (error) throw error
  return data
}

/**
 * Add pending VIP subscriber
 */
export async function addPendingVipSubscriber(subscriber) {
  const { data, error } = await supabase
    .from("vip_pending_subscribers")
    .upsert(
      {
        user_name: subscriber.user_name || subscriber.userName,
        lid: subscriber.lid,
        phone: subscriber.phone,
        stacks: subscriber.stacks || [],
        filters: subscriber.filters || {},
        status: "pending"
      },
      { onConflict: "lid" }
    )
    .select("id, lid, status")
    .single()

  if (error) throw error
  return data
}

/**
 * Approve pending VIP subscriber
 */
export async function approvePendingVipSubscriber(lid) {
  // Get pending subscriber - only fields needed for approval
  const { data: pending, error: getError } = await supabase
    .from("vip_pending_subscribers")
    .select("id, user_name, lid, phone, stacks, filters")
    .eq("lid", lid)
    .single()

  if (getError) throw getError
  if (!pending) throw new Error("Pending subscriber not found")

  // Create active subscriber
  const { error: insertError } = await supabase.from("vip_subscribers").insert({
    user_name: pending.user_name,
    lid: pending.lid,
    phone: pending.phone,
    stacks: pending.stacks,
    filters: pending.filters,
    active: true
  })

  if (insertError) throw insertError

  // Mark as approved (keep history)
  const { error: updateError } = await supabase
    .from("vip_pending_subscribers")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: null
    })
    .eq("lid", lid)

  if (updateError) throw updateError

  return pending
}

/**
 * Remove pending VIP subscriber
 */
export async function removePendingVipSubscriber(lid) {
  const { error } = await supabase
    .from("vip_pending_subscribers")
    .delete()
    .eq("lid", lid)

  if (error) throw error
  return true
}

// =====================================================
// VIP DELIVERY HISTORY
// =====================================================

// Campos específicos para reduzir egress (evita SELECT *)
const VIP_DELIVERY_SELECT_FIELDS = "id, vip_subscriber_id, job_id, sent_at"
const GROUP_DELIVERY_SELECT_FIELDS = "id, job_id, group_id, sent_at"

/**
 * Record job delivery to VIP subscriber
 */
export async function recordVipDelivery(subscriberId, jobId) {
  const { data, error } = await supabase
    .from("vip_delivery_history")
    .upsert(
      { vip_subscriber_id: subscriberId, job_id: jobId },
      { onConflict: "vip_subscriber_id,job_id", ignoreDuplicates: true }
    )
    .select("id")
    .single()

  if (error && error.code !== "23505") throw error // Ignore duplicate
  return data
}

/**
 * Check if job was sent to VIP subscriber
 */
export async function wasJobSentToVip(subscriberId, jobId) {
  const { data, error } = await supabase
    .from("vip_delivery_history")
    .select("id")
    .eq("vip_subscriber_id", subscriberId)
    .eq("job_id", jobId)
    .maybeSingle()

  if (error) throw error
  return !!data
}

/**
 * Get sent job IDs for a VIP subscriber
 * OTIMIZADO: Limite de 2000 registros mais recentes para reduzir egress
 */
export async function getVipSentJobIds(subscriberId) {
  const { data, error } = await supabase
    .from("vip_delivery_history")
    .select("job_id")
    .eq("vip_subscriber_id", subscriberId)
    .order("sent_at", { ascending: false })
    .limit(2000) // Limite para reduzir egress (últimas 2000 vagas enviadas)

  if (error) throw error
  return new Set(data.map((d) => d.job_id))
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
 * OTIMIZADO: Limite de 1000 registros para reduzir egress
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
    .limit(1000) // Limite para reduzir egress (dificilmente terá mais de 1000/dia)

  if (error) throw error
  return new Set(data.map((d) => d.job_id))
}

// =====================================================
// CLEANUP - Limpeza automática de registros antigos
// =====================================================

/**
 * Remove registros antigos de vip_delivery_history
 * @param {number} daysToKeep - Dias para manter (padrão: 30)
 * @returns {Promise<number>} Número de registros removidos
 */
export async function cleanupOldVipDeliveryHistory(daysToKeep = 30) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

  // Primeiro conta quantos registros serão removidos
  const { count, error: countError } = await supabase
    .from("vip_delivery_history")
    .select("id", { count: "exact", head: true })
    .lt("sent_at", cutoffDate.toISOString())

  if (countError) throw countError

  if (count === 0) {
    return 0
  }

  // Remove em batches para evitar timeout
  const batchSize = 1000
  let totalDeleted = 0

  while (totalDeleted < count) {
    const { error } = await supabase
      .from("vip_delivery_history")
      .delete()
      .lt("sent_at", cutoffDate.toISOString())
      .limit(batchSize)

    if (error) throw error
    totalDeleted += Math.min(batchSize, count - totalDeleted)
  }

  return count
}

/**
 * Remove registros antigos de group_delivery_history
 * @param {number} daysToKeep - Dias para manter (padrão: 7)
 * @returns {Promise<number>} Número de registros removidos
 */
export async function cleanupOldGroupDeliveryHistory(daysToKeep = 7) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

  // Primeiro conta quantos registros serão removidos
  const { count, error: countError } = await supabase
    .from("group_delivery_history")
    .select("id", { count: "exact", head: true })
    .lt("sent_at", cutoffDate.toISOString())

  if (countError) throw countError

  if (count === 0) {
    return 0
  }

  // Remove em batches para evitar timeout
  const batchSize = 1000
  let totalDeleted = 0

  while (totalDeleted < count) {
    const { error } = await supabase
      .from("group_delivery_history")
      .delete()
      .lt("sent_at", cutoffDate.toISOString())
      .limit(batchSize)

    if (error) throw error
    totalDeleted += Math.min(batchSize, count - totalDeleted)
  }

  return count
}

/**
 * Executa cleanup completo de todos os históricos
 * @returns {Promise<{vip: number, group: number}>}
 */
export async function runFullCleanup() {
  const vipDeleted = await cleanupOldVipDeliveryHistory(30) // 30 dias para VIP
  const groupDeleted = await cleanupOldGroupDeliveryHistory(7) // 7 dias para grupo

  return {
    vip: vipDeleted,
    group: groupDeleted
  }
}

// =====================================================
// AUTO RESPONDERS
// =====================================================

/**
 * Get auto responders (global or for specific group)
 */
export async function getAutoResponders(groupId = null) {
  let query = supabase.from("auto_responders").select(AUTO_RESPONDER_SELECT_FIELDS).eq("active", true)

  if (groupId) {
    query = query.or(`group_id.eq.${groupId},group_id.is.null`)
  } else {
    query = query.is("group_id", null)
  }

  const { data, error } = await query

  if (error) throw error
  return data
}

/**
 * Add auto responder
 */
export async function addAutoResponder(matchPattern, answer, groupId = null) {
  const { data, error } = await supabase
    .from("auto_responders")
    .insert({
      group_id: groupId,
      match_pattern: matchPattern,
      answer: answer
    })
    .select("id, match_pattern")
    .single()

  if (error) throw error
  return data
}

/**
 * Remove auto responder by ID
 */
export async function removeAutoResponder(id) {
  const { error } = await supabase.from("auto_responders").delete().eq("id", id)

  if (error) throw error
  return true
}

/**
 * Remove auto responder by match pattern
 */
export async function removeAutoResponderByMatch(matchPattern, groupId = null) {
  let query = supabase
    .from("auto_responders")
    .delete()
    .eq("match_pattern", matchPattern)

  if (groupId) {
    query = query.eq("group_id", groupId)
  } else {
    query = query.is("group_id", null)
  }

  const { error } = await query
  if (error) throw error
  return true
}

// =====================================================
// GROUP FEATURES
// =====================================================

/**
 * Check if a feature is enabled for a group
 */
export async function isFeatureEnabled(groupId, feature) {
  const { data, error } = await supabase
    .from("group_features")
    .select("enabled")
    .eq("group_id", groupId)
    .eq("feature", feature)
    .maybeSingle()

  if (error) throw error
  return data?.enabled ?? false
}

/**
 * Enable/disable a feature for a group
 */
export async function setFeatureEnabled(groupId, feature, enabled, config = {}) {
  const { data, error } = await supabase
    .from("group_features")
    .upsert(
      {
        group_id: groupId,
        feature: feature,
        enabled: enabled,
        config: config
      },
      { onConflict: "group_id,feature" }
    )
    .select("id, feature, enabled")
    .single()

  if (error) throw error
  return data
}

/**
 * Get all enabled features for a group
 */
export async function getGroupFeatures(groupId) {
  const { data, error } = await supabase
    .from("group_features")
    .select(GROUP_FEATURE_SELECT_FIELDS)
    .eq("group_id", groupId)

  if (error) throw error
  return data
}

/**
 * Get all groups with a specific feature enabled
 */
export async function getGroupsWithFeature(feature) {
  const { data, error } = await supabase
    .from("group_features")
    .select("group_id")
    .eq("feature", feature)
    .eq("enabled", true)

  if (error) throw error
  return data.map((d) => d.group_id)
}

// =====================================================
// SENDER STATE
// =====================================================

// Campos específicos para Sender State
const SENDER_STATE_SELECT_FIELDS = "id, sender_type, last_sent_at, metadata"

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
 * Update sender state
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

// =====================================================
// USER MUTES
// =====================================================

/**
 * Check if user is muted in group
 */
export async function isUserMuted(groupId, userId) {
  const { data, error } = await supabase
    .from("user_mutes")
    .select("id, expires_at")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return false

  // Check if mute has expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    await supabase.from("user_mutes").delete().eq("id", data.id)
    return false
  }

  return true
}

/**
 * Mute user in group
 */
export async function muteUser(groupId, userId, mutedBy = null, reason = null, expiresAt = null) {
  const { data, error } = await supabase
    .from("user_mutes")
    .upsert(
      {
        group_id: groupId,
        user_id: userId,
        muted_by: mutedBy,
        reason: reason,
        expires_at: expiresAt
      },
      { onConflict: "group_id,user_id" }
    )
    .select("id, user_id, expires_at")
    .single()

  if (error) throw error
  return data
}

/**
 * Unmute user in group
 */
export async function unmuteUser(groupId, userId) {
  const { error } = await supabase
    .from("user_mutes")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId)

  if (error) throw error
  return true
}

// Campos específicos para User Mutes
const USER_MUTE_SELECT_FIELDS = "id, group_id, user_id, muted_by, reason, expires_at, created_at"

/**
 * Get all muted users in a group
 */
export async function getMutedUsers(groupId) {
  const { data, error } = await supabase
    .from("user_mutes")
    .select(USER_MUTE_SELECT_FIELDS)
    .eq("group_id", groupId)

  if (error) throw error
  return data
}

// =====================================================
// JOBS (from core)
// =====================================================

// Campos mínimos para listagem (reduz egress ~70%)
const JOB_LIST_FIELDS = "id, job_title, company, location, work_type, created_at"

/**
 * Get all jobs (for VIP matching/search)
 * OTIMIZADO: Usa keyset pagination em vez de OFFSET
 * @param {Object} options - Opções de busca
 * @param {number} options.limit - Limite de resultados
 * @param {string} options.createdAfter - ISO timestamp para delta fetch
 * @param {string} options.cursorCreatedAt - Cursor para keyset pagination
 * @param {string} options.cursorId - Cursor ID para keyset pagination
 */
export async function getAllJobs(options = {}) {
  let limit
  let createdAfter
  let cursorCreatedAt
  let cursorId

  if (Number.isInteger(options)) {
    limit = options
  } else if (options && typeof options === "object") {
    limit = options.limit
    createdAfter = options.createdAfter
    cursorCreatedAt = options.cursorCreatedAt
    cursorId = options.cursorId
  }

  let query = supabase
    .from("jobs")
    .select(JOB_SELECT_FIELDS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })

  // Delta fetch: jobs novos desde timestamp
  if (createdAfter) {
    query = query.gte("created_at", createdAfter)
  }

  // Keyset pagination: mais eficiente que OFFSET
  if (cursorCreatedAt && cursorId) {
    // WHERE (created_at, id) < (cursor_created_at, cursor_id)
    query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`)
  }

  if (Number.isInteger(limit)) {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) throw error
  return data
}

/**
 * Get jobs using keyset pagination (cursor-based)
 * Retorna também o cursor para próxima página
 * @param {Object} options - Opções de busca
 * @returns {{ data: Array, nextCursor: { createdAt: string, id: string } | null }}
 */
export async function getJobsPage(options = {}) {
  const { limit = 50, cursorCreatedAt, cursorId, statusFilter } = options

  let query = supabase
    .from("jobs")
    .select(JOB_LIST_FIELDS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1) // +1 para saber se há mais páginas

  // Keyset pagination
  if (cursorCreatedAt && cursorId) {
    query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`)
  }

  // Filtro por status
  if (statusFilter === 'pending_whatsapp') {
    query = query.eq("status_whatsapp", false)
  } else if (statusFilter === 'pending_discord') {
    query = query.eq("status_discord", false)
  } else if (statusFilter === 'pending_telegram') {
    query = query.eq("status_telegram", false)
  }

  const { data, error } = await query

  if (error) throw error

  const hasMore = data.length > limit
  const pageData = hasMore ? data.slice(0, limit) : data

  // Cursor para próxima página
  let nextCursor = null
  if (hasMore && pageData.length > 0) {
    const lastItem = pageData[pageData.length - 1]
    nextCursor = {
      createdAt: lastItem.created_at,
      id: lastItem.id
    }
  }

  return { data: pageData, nextCursor }
}

/**
 * Get jobs delta (novos desde última execução)
 * Para uso com sender_state
 * @param {string} senderType - Tipo do sender (vip, whatsapp, discord)
 * @param {number} limit - Limite de jobs
 */
export async function getJobsDelta(senderType, limit = 100) {
  // Busca último estado do sender
  const state = await getSenderState(senderType)
  const lastCreatedAt = state?.last_processed_created_at

  let query = supabase
    .from("jobs")
    .select(JOB_SELECT_FIELDS)
    .order("created_at", { ascending: true }) // ASC para processar em ordem
    .order("id", { ascending: true })
    .limit(limit)

  if (lastCreatedAt) {
    query = query.gt("created_at", lastCreatedAt)
  }

  const { data, error } = await query

  if (error) throw error
  return data
}

/**
 * Atualiza sender_state após processar jobs (delta fetch)
 * @param {string} senderType - Tipo do sender
 * @param {string} lastJobId - ID do último job processado
 * @param {string} lastCreatedAt - Timestamp do último job processado
 * @param {number} jobsCount - Quantidade de jobs processados
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

/**
 * Get pending jobs for WhatsApp
 */
export async function getPendingWhatsAppJobs(limit = 100) {
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT_FIELDS)
    .eq("status_whatsapp", false)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

/**
 * Mark job as sent to WhatsApp
 */
export async function markJobSentToWhatsApp(jobId) {
  const { data, error } = await supabase
    .from("jobs")
    .update({ status_whatsapp: true })
    .eq("id", jobId)
    .select("id, status_whatsapp")
    .single()

  if (error) throw error
  return data
}

/**
 * Get job by ID
 */
export async function getJobById(jobId) {
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT_FIELDS)
    .eq("id", jobId)
    .maybeSingle()

  if (error) throw error
  return data
}

// =====================================================
// HELPER: Transform job for API compatibility
// =====================================================

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
  // VIP Subscribers
  getActiveVipSubscribers,
  getVipSubscriberByLid,
  upsertVipSubscriber,
  deactivateVipSubscriber,
  updateVipFilters,
  // VIP Pending
  getPendingVipSubscribers,
  addPendingVipSubscriber,
  approvePendingVipSubscriber,
  removePendingVipSubscriber,
  // VIP Delivery History
  recordVipDelivery,
  wasJobSentToVip,
  getVipSentJobIds,
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
  // Auto Responders
  getAutoResponders,
  addAutoResponder,
  removeAutoResponder,
  removeAutoResponderByMatch,
  // Group Features
  isFeatureEnabled,
  setFeatureEnabled,
  getGroupFeatures,
  getGroupsWithFeature,
  // Sender State
  getSenderState,
  updateSenderState,
  // User Mutes
  isUserMuted,
  muteUser,
  unmuteUser,
  getMutedUsers,
  // Jobs
  getPendingWhatsAppJobs,
  markJobSentToWhatsApp,
  getJobById,
  transformJobForApi
}

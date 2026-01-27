/**
 * Database Service for WhatsApp Bot
 * Provides Supabase-backed storage for all bot data
 * Replaces JSON file storage with proper database persistence
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[database] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// =====================================================
// VIP SUBSCRIBERS
// =====================================================

/**
 * Get all active VIP subscribers
 */
export async function getActiveVipSubscribers() {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .select("*")
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
    .select("*")
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
    .select()
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
    .select()
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
    .select()
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
    .select("*")
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
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Approve pending VIP subscriber
 */
export async function approvePendingVipSubscriber(lid) {
  // Get pending subscriber
  const { data: pending, error: getError } = await supabase
    .from("vip_pending_subscribers")
    .select("*")
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
    .select()
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
 */
export async function getVipSentJobIds(subscriberId) {
  const { data, error } = await supabase
    .from("vip_delivery_history")
    .select("job_id")
    .eq("vip_subscriber_id", subscriberId)

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
    .select()
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

  if (error) throw error
  return new Set(data.map((d) => d.job_id))
}

// =====================================================
// AUTO RESPONDERS
// =====================================================

/**
 * Get auto responders (global or for specific group)
 */
export async function getAutoResponders(groupId = null) {
  let query = supabase.from("auto_responders").select("*").eq("active", true)

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
    .select()
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
    .select()
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
    .select("*")
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

/**
 * Get sender state
 */
export async function getSenderState(senderType) {
  const { data, error } = await supabase
    .from("sender_state")
    .select("*")
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
    .select()
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
    .select()
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

/**
 * Get all muted users in a group
 */
export async function getMutedUsers(groupId) {
  const { data, error } = await supabase
    .from("user_mutes")
    .select("*")
    .eq("group_id", groupId)

  if (error) throw error
  return data
}

// =====================================================
// JOBS (from core)
// =====================================================

/**
 * Get all jobs (for VIP matching/search)
 */
export async function getAllJobs(limit) {
  let query = supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })

  if (Number.isInteger(limit)) {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) throw error
  return data
}

/**
 * Get pending jobs for WhatsApp
 */
export async function getPendingWhatsAppJobs(limit = 100) {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
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
    .select()
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
    .select("*")
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

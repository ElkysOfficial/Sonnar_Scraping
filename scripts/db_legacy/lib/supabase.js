/**
 * Supabase Client Library for Node.js
 * Centralized database access for all Sonar services
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// =====================================================
// JOBS
// =====================================================

/**
 * Insert or update a job (upsert by job_url)
 */
export async function upsertJob(job) {
  const { data, error } = await supabase
    .from("jobs")
    .upsert(
      {
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
        status_discord: job.statuses?.discord ?? job.status_discord ?? false,
        status_whatsapp: job.statuses?.whatsapp ?? job.status_whatsapp ?? false,
        status_telegram: job.statuses?.telegram ?? job.status_telegram ?? false
      },
      { onConflict: "job_url" }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Get all jobs
 */
export async function getAllJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

/**
 * Get pending jobs for a specific channel
 */
export async function getPendingJobs(channel) {
  const statusColumn = `status_${channel}`
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq(statusColumn, false)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

/**
 * Get a job by ID
 */
export async function getJobById(id) {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single()

  if (error && error.code !== "PGRST116") throw error
  return data
}

/**
 * Get a job by URL
 */
export async function getJobByUrl(url) {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("job_url", url)
    .single()

  if (error && error.code !== "PGRST116") throw error
  return data
}

/**
 * Update job channel status
 */
export async function updateJobStatus(id, channel, status) {
  const statusColumn = `status_${channel}`
  const { data, error } = await supabase
    .from("jobs")
    .update({ [statusColumn]: status })
    .eq("id", id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Check if a job URL already exists
 */
export async function jobUrlExists(url) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("job_url", url)
    .single()

  if (error && error.code !== "PGRST116") throw error
  return !!data
}

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
    .single()

  if (error && error.code !== "PGRST116") throw error
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
        stacks: subscriber.stacks,
        filters: subscriber.filters,
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
    .upsert({
      user_name: subscriber.user_name || subscriber.userName,
      lid: subscriber.lid,
      phone: subscriber.phone,
      stacks: subscriber.stacks,
      filters: subscriber.filters,
      status: "pending"
    }, { onConflict: "lid" })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Approve pending VIP subscriber (move to active)
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
  const { error: insertError } = await supabase
    .from("vip_subscribers")
    .insert({
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
      { onConflict: "vip_subscriber_id,job_id" }
    )
    .select()
    .single()

  if (error) throw error
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
    .single()

  if (error && error.code !== "PGRST116") throw error
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
  return data.map((d) => d.job_id)
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
      { onConflict: "job_id,group_id" }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Check if job was sent to group
 */
export async function wasJobSentToGroup(jobId, groupId) {
  const { data, error } = await supabase
    .from("group_delivery_history")
    .select("id")
    .eq("job_id", jobId)
    .eq("group_id", groupId)
    .single()

  if (error && error.code !== "PGRST116") throw error
  return !!data
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
 * Remove auto responder
 */
export async function removeAutoResponder(id) {
  const { error } = await supabase.from("auto_responders").delete().eq("id", id)

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
    .single()

  if (error && error.code !== "PGRST116") throw error
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
    .single()

  if (error && error.code !== "PGRST116") throw error
  return data
}

/**
 * Update sender state
 */
export async function updateSenderState(senderType, lastSentAt, metadata = {}) {
  const { data, error } = await supabase
    .from("sender_state")
    .upsert(
      {
        sender_type: senderType,
        last_sent_at: lastSentAt,
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
    .single()

  if (error && error.code !== "PGRST116") throw error
  if (!data) return false

  // Check if mute has expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Remove expired mute
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
// ENRICHMENT CACHE
// =====================================================

/**
 * Get cached enrichment value
 */
export async function getCachedEnrichment(cacheType, cacheKey) {
  const { data, error } = await supabase
    .from("enrichment_cache")
    .select("cache_value, expires_at")
    .eq("cache_type", cacheType)
    .eq("cache_key", cacheKey)
    .single()

  if (error && error.code !== "PGRST116") throw error
  if (!data) return null

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    return null
  }

  return data.cache_value
}

/**
 * Set cached enrichment value
 */
export async function setCachedEnrichment(cacheType, cacheKey, cacheValue, expiresInDays = 30) {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  const { data, error } = await supabase
    .from("enrichment_cache")
    .upsert(
      {
        cache_type: cacheType,
        cache_key: cacheKey,
        cache_value: cacheValue,
        expires_at: expiresAt.toISOString()
      },
      { onConflict: "cache_type,cache_key" }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

// =====================================================
// SCRAPER STATS
// =====================================================

/**
 * Record scraper statistics
 */
export async function recordScraperStats(source, stats) {
  const { data, error } = await supabase
    .from("scraper_stats")
    .insert({
      source: source,
      jobs_found: stats.jobs_found || 0,
      jobs_new: stats.jobs_new || 0,
      jobs_enriched: stats.jobs_enriched || 0,
      errors: stats.errors || 0,
      duration_ms: stats.duration_ms
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Get scraper stats summary
 */
export async function getScraperStatsSummary(hours = 24) {
  const since = new Date()
  since.setHours(since.getHours() - hours)

  const { data, error } = await supabase
    .from("scraper_stats")
    .select("source, jobs_found, jobs_new, errors")
    .gte("scraped_at", since.toISOString())

  if (error) throw error

  // Aggregate by source
  const summary = {}
  for (const stat of data) {
    if (!summary[stat.source]) {
      summary[stat.source] = { jobs_found: 0, jobs_new: 0, errors: 0, runs: 0 }
    }
    summary[stat.source].jobs_found += stat.jobs_found
    summary[stat.source].jobs_new += stat.jobs_new
    summary[stat.source].errors += stat.errors
    summary[stat.source].runs += 1
  }

  return summary
}

// =====================================================
// RETENTION POLICIES
// =====================================================

/**
 * Get retention policy
 */
export async function getRetentionPolicy(policyName) {
  const { data, error } = await supabase
    .from("retention_policies")
    .select("*")
    .eq("policy_name", policyName)
    .single()

  if (error && error.code !== "PGRST116") throw error
  return data
}

/**
 * Update retention policy
 */
export async function updateRetentionPolicy(policyName, retentionDays) {
  const { data, error } = await supabase
    .from("retention_policies")
    .update({ retention_days: retentionDays })
    .eq("policy_name", policyName)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Run cleanup with policies (calls database function)
 */
export async function runCleanup() {
  const { data, error } = await supabase.rpc("run_cleanup_with_policies")

  if (error) throw error
  return data
}

export default {
  supabase,
  // Jobs
  upsertJob,
  getAllJobs,
  getPendingJobs,
  getJobById,
  getJobByUrl,
  updateJobStatus,
  jobUrlExists,
  // VIP Subscribers
  getActiveVipSubscribers,
  getVipSubscriberByLid,
  upsertVipSubscriber,
  deactivateVipSubscriber,
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
  wasJobSentToGroup,
  // Auto Responders
  getAutoResponders,
  addAutoResponder,
  removeAutoResponder,
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
  // Enrichment Cache
  getCachedEnrichment,
  setCachedEnrichment,
  // Scraper Stats
  recordScraperStats,
  getScraperStatsSummary,
  // Retention Policies
  getRetentionPolicy,
  updateRetentionPolicy,
  runCleanup
}

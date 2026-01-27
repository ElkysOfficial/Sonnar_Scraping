/**
 * VIP delivery history stored in Supabase
 */

import { supabase } from "./database.js"
import { errorLog, infoLog } from "../utils/logger.js"

// Minimum interval between VIP sends (7 minutes in ms)
const MIN_SEND_INTERVAL = 7 * 60 * 1000

// Cooldown to resend the same job (48 hours in ms)
const JOB_REPOST_COOLDOWN = 48 * 60 * 60 * 1000

const subscriberIdCache = new Map()

async function getSubscriberId(lid) {
  if (subscriberIdCache.has(lid)) {
    return subscriberIdCache.get(lid)
  }

  const { data, error } = await supabase
    .from("vip_subscribers")
    .select("id")
    .eq("lid", lid)
    .maybeSingle()

  if (error) throw error

  const id = data?.id || null
  if (id) {
    subscriberIdCache.set(lid, id)
  }
  return id
}

async function getLastSentAt(subscriberId) {
  const { data, error } = await supabase
    .from("vip_delivery_history")
    .select("sent_at")
    .eq("vip_subscriber_id", subscriberId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.sent_at ? new Date(data.sent_at).getTime() : null
}

export async function canSendToSubscriber(lid) {
  try {
    const subscriberId = await getSubscriberId(lid)
    if (!subscriberId) {
      return false
    }

    const lastSentAt = await getLastSentAt(subscriberId)
    if (!lastSentAt) {
      return true
    }

    const elapsed = Date.now() - lastSentAt
    return elapsed >= MIN_SEND_INTERVAL
  } catch (error) {
    errorLog(`[VIP History] Error checking send interval: ${error.message}`)
    return false
  }
}

export async function getTimeUntilCanSend(lid) {
  try {
    const subscriberId = await getSubscriberId(lid)
    if (!subscriberId) {
      return 0
    }

    const lastSentAt = await getLastSentAt(subscriberId)
    if (!lastSentAt) {
      return 0
    }

    const elapsed = Date.now() - lastSentAt
    const remaining = MIN_SEND_INTERVAL - elapsed
    return remaining > 0 ? remaining : 0
  } catch (error) {
    errorLog(`[VIP History] Error checking cooldown: ${error.message}`)
    return 0
  }
}

export async function wasJobSentRecently(lid, jobId) {
  try {
    const subscriberId = await getSubscriberId(lid)
    if (!subscriberId) {
      return false
    }

    const { data, error } = await supabase
      .from("vip_delivery_history")
      .select("sent_at")
      .eq("vip_subscriber_id", subscriberId)
      .eq("job_id", jobId)
      .maybeSingle()

    if (error) throw error
    if (!data?.sent_at) {
      return false
    }

    const elapsed = Date.now() - new Date(data.sent_at).getTime()
    return elapsed < JOB_REPOST_COOLDOWN
  } catch (error) {
    errorLog(`[VIP History] Error checking recent job: ${error.message}`)
    return false
  }
}

export async function recordJobSent(lid, jobId) {
  try {
    const subscriberId = await getSubscriberId(lid)
    if (!subscriberId) {
      return
    }

    const { error } = await supabase
      .from("vip_delivery_history")
      .upsert(
        {
          vip_subscriber_id: subscriberId,
          job_id: jobId,
          sent_at: new Date().toISOString()
        },
        { onConflict: "vip_subscriber_id,job_id" }
      )

    if (error) throw error
    infoLog(`[VIP History] Recorded send for ${lid}: ${jobId}`)
  } catch (error) {
    errorLog(`[VIP History] Error recording send: ${error.message}`)
  }
}

export async function cleanOldEntries() {
  try {
    const cutoff = new Date(Date.now() - JOB_REPOST_COOLDOWN).toISOString()
    const { data, error } = await supabase
      .from("vip_delivery_history")
      .delete()
      .lt("sent_at", cutoff)
      .select("id")

    if (error) throw error

    if (data?.length) {
      infoLog(`[VIP History] Removed ${data.length} old entries`)
    }
  } catch (error) {
    errorLog(`[VIP History] Error cleaning entries: ${error.message}`)
  }
}

export async function getSubscriberStats(lid) {
  try {
    const subscriberId = await getSubscriberId(lid)
    if (!subscriberId) {
      return {
        totalSent: 0,
        lastSentAt: null,
        canSendNow: true,
        timeUntilCanSend: 0
      }
    }

    const { count, error: countError } = await supabase
      .from("vip_delivery_history")
      .select("id", { count: "exact", head: true })
      .eq("vip_subscriber_id", subscriberId)

    if (countError) throw countError

    const lastSentAt = await getLastSentAt(subscriberId)
    const canSendNow = await canSendToSubscriber(lid)
    const timeUntilCanSend = await getTimeUntilCanSend(lid)

    return {
      totalSent: count || 0,
      lastSentAt: lastSentAt ? new Date(lastSentAt).toISOString() : null,
      canSendNow,
      timeUntilCanSend
    }
  } catch (error) {
    errorLog(`[VIP History] Error reading stats: ${error.message}`)
    return {
      totalSent: 0,
      lastSentAt: null,
      canSendNow: true,
      timeUntilCanSend: 0
    }
  }
}

export async function getSentJobIds(lid) {
  try {
    const subscriberId = await getSubscriberId(lid)
    if (!subscriberId) {
      return new Set()
    }

    const cutoff = new Date(Date.now() - JOB_REPOST_COOLDOWN).toISOString()
    const { data, error } = await supabase
      .from("vip_delivery_history")
      .select("job_id")
      .eq("vip_subscriber_id", subscriberId)
      .gte("sent_at", cutoff)

    if (error) throw error
    return new Set((data || []).map((d) => d.job_id))
  } catch (error) {
    errorLog(`[VIP History] Error loading sent jobs: ${error.message}`)
    return new Set()
  }
}

/**
 * VIP delivery history stored in Supabase
 * OTIMIZADO: Cache em memória com carregamento em batch para reduzir egress
 */

import { supabase } from "./database.js"
import { errorLog, infoLog } from "../utils/logger.js"

// Minimum interval between VIP sends (7 minutes in ms)
const MIN_SEND_INTERVAL = 7 * 60 * 1000

// Cooldown to resend the same job (48 hours in ms)
const JOB_REPOST_COOLDOWN = 48 * 60 * 60 * 1000

// Cache TTL (30 minutos - alinhado com o ciclo de envio)
const CACHE_TTL = 30 * 60 * 1000

const DEFAULT_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000
const CLEANUP_INTERVAL = (() => {
  const parsed = Number(process.env.VIP_HISTORY_CLEANUP_INTERVAL_MS)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CLEANUP_INTERVAL
  }
  return parsed > 0 ? parsed : DEFAULT_CLEANUP_INTERVAL
})()

let lastCleanupAt = 0

// =====================================================
// CACHES EM MEMÓRIA (reduz queries N+1)
// =====================================================

// Cache de subscriber_id por LID
const subscriberIdCache = new Map()

// Cache de último envio por subscriber_id
const lastSentCache = {
  data: new Map(), // subscriber_id -> timestamp
  loadedAt: 0,
  isLoaded: false
}

// Cache de job_ids enviados por subscriber_id
const sentJobsCache = {
  data: new Map(), // subscriber_id -> Set<job_id>
  loadedAt: 0,
  isLoaded: false
}

/**
 * Verifica se o cache está válido
 */
function isCacheValid(cache) {
  return cache.isLoaded && (Date.now() - cache.loadedAt) < CACHE_TTL
}

/**
 * Invalida todos os caches (chamado após mudanças)
 */
export function invalidateCache() {
  lastSentCache.isLoaded = false
  sentJobsCache.isLoaded = false
}

/**
 * Carrega todos os dados de histórico em batch (1 query em vez de N)
 * Deve ser chamado no início de cada ciclo
 */
export async function loadHistoryBatch() {
  try {
    const cutoff = new Date(Date.now() - JOB_REPOST_COOLDOWN).toISOString()

    // Uma única query que retorna todos os dados necessários
    const { data, error } = await supabase
      .from("vip_delivery_history")
      .select("vip_subscriber_id, job_id, sent_at")
      .gte("sent_at", cutoff)
      .order("sent_at", { ascending: false })

    if (error) throw error

    // Processa os dados e popula os caches
    const lastSentMap = new Map()
    const sentJobsMap = new Map()

    for (const row of data || []) {
      const subId = row.vip_subscriber_id
      const sentAt = new Date(row.sent_at).getTime()

      // Atualiza lastSentCache (pega apenas o mais recente por subscriber)
      if (!lastSentMap.has(subId) || sentAt > lastSentMap.get(subId)) {
        lastSentMap.set(subId, sentAt)
      }

      // Atualiza sentJobsCache
      if (!sentJobsMap.has(subId)) {
        sentJobsMap.set(subId, new Set())
      }
      sentJobsMap.get(subId).add(row.job_id)
    }

    // Atualiza os caches
    lastSentCache.data = lastSentMap
    lastSentCache.loadedAt = Date.now()
    lastSentCache.isLoaded = true

    sentJobsCache.data = sentJobsMap
    sentJobsCache.loadedAt = Date.now()
    sentJobsCache.isLoaded = true

    infoLog(`[VIP History] Cache carregado: ${lastSentMap.size} assinantes, ${data?.length || 0} registros`)
    return true
  } catch (error) {
    errorLog(`[VIP History] Erro ao carregar cache em batch: ${error.message}`)
    return false
  }
}

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

/**
 * Carrega IDs de todos os assinantes ativos em batch
 */
export async function loadSubscriberIdsBatch(subscribers) {
  try {
    const lidsToLoad = subscribers
      .map(s => s.lid)
      .filter(lid => !subscriberIdCache.has(lid))

    if (lidsToLoad.length === 0) return

    const { data, error } = await supabase
      .from("vip_subscribers")
      .select("id, lid")
      .in("lid", lidsToLoad)

    if (error) throw error

    for (const row of data || []) {
      subscriberIdCache.set(row.lid, row.id)
    }

    infoLog(`[VIP History] Carregados ${data?.length || 0} subscriber IDs em batch`)
  } catch (error) {
    errorLog(`[VIP History] Erro ao carregar subscriber IDs: ${error.message}`)
  }
}

async function getLastSentAt(subscriberId) {
  // Usa o cache se estiver carregado e válido
  if (isCacheValid(lastSentCache)) {
    return lastSentCache.data.get(subscriberId) || null
  }

  // Fallback para query individual (caso o cache não esteja carregado)
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

    // Usa o cache se estiver carregado e válido
    if (isCacheValid(sentJobsCache)) {
      const sentJobs = sentJobsCache.data.get(subscriberId)
      return sentJobs ? sentJobs.has(jobId) : false
    }

    // Fallback para query individual
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

    // Atualiza o cache local para evitar query extra
    if (lastSentCache.isLoaded) {
      lastSentCache.data.set(subscriberId, Date.now())
    }
    if (sentJobsCache.isLoaded) {
      if (!sentJobsCache.data.has(subscriberId)) {
        sentJobsCache.data.set(subscriberId, new Set())
      }
      sentJobsCache.data.get(subscriberId).add(jobId)
    }

    infoLog(`[VIP History] Recorded send for ${lid}: ${jobId}`)
  } catch (error) {
    errorLog(`[VIP History] Error recording send: ${error.message}`)
  }
}

export async function cleanOldEntries(force = false) {
  try {
    const now = Date.now()
    if (!force && now - lastCleanupAt < CLEANUP_INTERVAL) {
      return
    }

    const cutoff = new Date(Date.now() - JOB_REPOST_COOLDOWN).toISOString()
    const { data, error } = await supabase
      .from("vip_delivery_history")
      .delete()
      .lt("sent_at", cutoff)
      .select("id")

    if (error) throw error

    lastCleanupAt = now

    if (data?.length) {
      infoLog(`[VIP History] Removed ${data.length} old entries`)
      // Invalida o cache após limpeza
      invalidateCache()
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

    // Usa o cache se estiver carregado e válido
    if (isCacheValid(sentJobsCache)) {
      return sentJobsCache.data.get(subscriberId) || new Set()
    }

    // Fallback para query individual
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

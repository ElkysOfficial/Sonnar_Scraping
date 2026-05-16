/**
 * Historico de entrega de vagas VIP (vip_delivery_history no Supabase).
 *
 * Refactor 2026-05-16: a tabela passou a ser chaveada por LID (TEXT), nao mais
 * por vip_subscriber_id. Assim funciona para os dois fluxos — assinante do
 * portal (Fluxo A, sem linha em vip_subscribers) e do WhatsApp (Fluxo B).
 *
 * Cache em memoria para reduzir egress.
 */

import { supabase } from "./database.js"
import { errorLog, infoLog } from "../utils/logger.js"

// Intervalo minimo entre envios VIP (7 minutos)
const MIN_SEND_INTERVAL = 7 * 60 * 1000

// Cooldown para reenviar a mesma vaga (48 horas)
const JOB_REPOST_COOLDOWN = 48 * 60 * 60 * 1000

// TTL do cache (30 min — alinhado ao ciclo de envio)
const CACHE_TTL = 30 * 60 * 1000

const DEFAULT_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000
const CLEANUP_INTERVAL = (() => {
  const parsed = Number(process.env.VIP_HISTORY_CLEANUP_INTERVAL_MS)
  if (!Number.isFinite(parsed)) return DEFAULT_CLEANUP_INTERVAL
  return parsed > 0 ? parsed : DEFAULT_CLEANUP_INTERVAL
})()

let lastCleanupAt = 0

// =====================================================
// CACHES EM MEMORIA (chaveados por LID)
// =====================================================

const lastSentCache = { data: new Map(), loadedAt: 0, isLoaded: false }   // lid -> timestamp
const sentJobsCache = { data: new Map(), loadedAt: 0, isLoaded: false }   // lid -> Set<job_id>

function isCacheValid(cache) {
  return cache.isLoaded && Date.now() - cache.loadedAt < CACHE_TTL
}

export function invalidateCache() {
  lastSentCache.isLoaded = false
  sentJobsCache.isLoaded = false
}

/**
 * Carrega o historico recente em batch (1 query) e popula os caches.
 */
export async function loadHistoryBatch() {
  try {
    const cutoff = new Date(Date.now() - JOB_REPOST_COOLDOWN).toISOString()

    const { data, error } = await supabase
      .from("vip_delivery_history")
      .select("lid, job_id, sent_at")
      .gte("sent_at", cutoff)
      .order("sent_at", { ascending: false })

    if (error) throw error

    const lastSentMap = new Map()
    const sentJobsMap = new Map()

    for (const row of data || []) {
      const lid = row.lid
      const sentAt = new Date(row.sent_at).getTime()

      if (!lastSentMap.has(lid) || sentAt > lastSentMap.get(lid)) {
        lastSentMap.set(lid, sentAt)
      }
      if (!sentJobsMap.has(lid)) sentJobsMap.set(lid, new Set())
      sentJobsMap.get(lid).add(row.job_id)
    }

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

/**
 * Mantido por compatibilidade — nao ha mais mapa LID->id para carregar.
 */
export async function loadSubscriberIdsBatch() {}

async function getLastSentAt(lid) {
  if (isCacheValid(lastSentCache)) {
    return lastSentCache.data.get(lid) || null
  }

  const { data, error } = await supabase
    .from("vip_delivery_history")
    .select("sent_at")
    .eq("lid", lid)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.sent_at ? new Date(data.sent_at).getTime() : null
}

export async function canSendToSubscriber(lid) {
  try {
    const lastSentAt = await getLastSentAt(lid)
    if (!lastSentAt) return true
    return Date.now() - lastSentAt >= MIN_SEND_INTERVAL
  } catch (error) {
    errorLog(`[VIP History] Error checking send interval: ${error.message}`)
    return false
  }
}

export async function getTimeUntilCanSend(lid) {
  try {
    const lastSentAt = await getLastSentAt(lid)
    if (!lastSentAt) return 0
    const remaining = MIN_SEND_INTERVAL - (Date.now() - lastSentAt)
    return remaining > 0 ? remaining : 0
  } catch (error) {
    errorLog(`[VIP History] Error checking cooldown: ${error.message}`)
    return 0
  }
}

export async function wasJobSentRecently(lid, jobId) {
  try {
    if (isCacheValid(sentJobsCache)) {
      const sentJobs = sentJobsCache.data.get(lid)
      return sentJobs ? sentJobs.has(jobId) : false
    }

    const { data, error } = await supabase
      .from("vip_delivery_history")
      .select("sent_at")
      .eq("lid", lid)
      .eq("job_id", jobId)
      .maybeSingle()

    if (error) throw error
    if (!data?.sent_at) return false
    return Date.now() - new Date(data.sent_at).getTime() < JOB_REPOST_COOLDOWN
  } catch (error) {
    errorLog(`[VIP History] Error checking recent job: ${error.message}`)
    return false
  }
}

export async function recordJobSent(lid, jobId, jobSnapshot = null, matchScore = null) {
  try {
    const row = { lid, job_id: jobId, sent_at: new Date().toISOString() }
    // Snapshot da vaga para o dashboard do portal exibir o que foi enviado.
    if (jobSnapshot) row.job_snapshot = jobSnapshot
    if (matchScore != null) row.match_score = Math.round(matchScore)

    const { error } = await supabase
      .from("vip_delivery_history")
      .upsert(row, { onConflict: "lid,job_id" })

    if (error) throw error

    if (lastSentCache.isLoaded) {
      lastSentCache.data.set(lid, Date.now())
    }
    if (sentJobsCache.isLoaded) {
      if (!sentJobsCache.data.has(lid)) sentJobsCache.data.set(lid, new Set())
      sentJobsCache.data.get(lid).add(jobId)
    }

    infoLog(`[VIP History] Recorded send for ${lid}: ${jobId}`)
  } catch (error) {
    errorLog(`[VIP History] Error recording send: ${error.message}`)
  }
}

export async function cleanOldEntries(force = false) {
  try {
    const now = Date.now()
    if (!force && now - lastCleanupAt < CLEANUP_INTERVAL) return

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
      invalidateCache()
    }
  } catch (error) {
    errorLog(`[VIP History] Error cleaning entries: ${error.message}`)
  }
}

export async function getSubscriberStats(lid) {
  try {
    const { count, error: countError } = await supabase
      .from("vip_delivery_history")
      .select("id", { count: "exact", head: true })
      .eq("lid", lid)

    if (countError) throw countError

    const lastSentAt = await getLastSentAt(lid)
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
    return { totalSent: 0, lastSentAt: null, canSendNow: true, timeUntilCanSend: 0 }
  }
}

export async function getSentJobIds(lid) {
  try {
    if (isCacheValid(sentJobsCache)) {
      return sentJobsCache.data.get(lid) || new Set()
    }

    const cutoff = new Date(Date.now() - JOB_REPOST_COOLDOWN).toISOString()
    const { data, error } = await supabase
      .from("vip_delivery_history")
      .select("job_id")
      .eq("lid", lid)
      .gte("sent_at", cutoff)

    if (error) throw error
    return new Set((data || []).map((d) => d.job_id))
  } catch (error) {
    errorLog(`[VIP History] Error loading sent jobs: ${error.message}`)
    return new Set()
  }
}

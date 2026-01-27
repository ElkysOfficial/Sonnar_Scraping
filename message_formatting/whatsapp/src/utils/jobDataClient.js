/**
 * Job Data Client - Supabase Direct Access
 * Fetches job data directly from Supabase database
 */

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[jobDataClient] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

/**
 * Transform DB row to API-compatible format
 */
function transformJob(job) {
  return {
    id: job.id,
    job_title: job.job_title,
    title: job.job_title,
    job_url: job.job_url,
    url: job.job_url,
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

/**
 * Fetch all jobs from Supabase
 */
export async function fetchJobData() {
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[jobDataClient] Error fetching jobs:", error.message)
      return []
    }

    return data.map(transformJob)
  } catch (error) {
    console.error("[jobDataClient] Error fetching jobs:", error.message)
    return []
  }
}

/**
 * Fetch pending jobs for WhatsApp (not yet sent)
 */
export async function fetchPendingJobs(limit = 100) {
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("status_whatsapp", false)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[jobDataClient] Error fetching pending jobs:", error.message)
      return []
    }

    return data.map(transformJob)
  } catch (error) {
    console.error("[jobDataClient] Error fetching pending jobs:", error.message)
    return []
  }
}

/**
 * Get a single job by ID
 */
export async function getJobById(id) {
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single()

    if (error) {
      console.error("[jobDataClient] Error fetching job:", error.message)
      return null
    }

    return transformJob(data)
  } catch (error) {
    console.error("[jobDataClient] Error fetching job:", error.message)
    return null
  }
}

/**
 * Mark job status for a specific channel
 */
export async function markJobStatus(id, channel, status = true) {
  try {
    const statusColumn = `status_${channel}`
    const { data, error } = await supabase
      .from("jobs")
      .update({ [statusColumn]: status })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[jobDataClient] Error updating job status:", error.message)
      return null
    }

    return transformJob(data)
  } catch (error) {
    console.error("[jobDataClient] Error updating job status:", error.message)
    return null
  }
}

/**
 * Get job statistics
 */
export async function getJobStats() {
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("status_discord, status_whatsapp, status_telegram")

    if (error) {
      console.error("[jobDataClient] Error fetching stats:", error.message)
      return { total: 0, pending: 0, sent: 0 }
    }

    const total = data.length
    const pending = data.filter((j) => !j.status_whatsapp).length
    const sent = total - pending

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

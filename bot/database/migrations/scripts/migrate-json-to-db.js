/**
 * Migration Script: JSON files to Supabase
 *
 * This script migrates all existing JSON data to Supabase database.
 * Run this once after setting up the database schema.
 *
 * Usage:
 *   cd database
 *   npm install
 *   node scripts/migrate-json-to-db.js
 */

import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, "../..")

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`  File not found: ${filePath}`)
      return null
    }
    const content = fs.readFileSync(filePath, "utf8")
    if (!content.trim()) {
      return null
    }
    return JSON.parse(content)
  } catch (error) {
    console.error(`  Error reading ${filePath}:`, error.message)
    return null
  }
}

async function migrateJobs() {
  console.log("\n📋 Migrating jobs from job_data.json...")
  const filePath = path.join(ROOT_DIR, "message_formatting/core/src/data/job_data.json")
  const jobs = readJsonFile(filePath)

  if (!jobs || !Array.isArray(jobs)) {
    console.log("  No jobs to migrate")
    return 0
  }

  console.log(`  Found ${jobs.length} jobs`)

  // Transform jobs to match database schema
  const transformedJobs = jobs.map((job) => ({
    id: job.id,
    job_title: job.job_title || "",
    job_url: job.job_url || "",
    company: job.company || "",
    location: job.location || "",
    work_type: job.work_type || "",
    hiring_regime: job.hiring_regime || "",
    salary: job.salary || "",
    publication_date: job.publication_date || "",
    source: job.source || "",
    status_discord: job.statuses?.discord ?? false,
    status_whatsapp: job.statuses?.whatsapp ?? false,
    status_telegram: job.statuses?.telegram ?? false,
    created_at: job.created_at,
    updated_at: job.updated_at
  }))

  // Insert in batches of 500
  const batchSize = 500
  let inserted = 0

  for (let i = 0; i < transformedJobs.length; i += batchSize) {
    const batch = transformedJobs.slice(i, i + batchSize)
    const { error } = await supabase
      .from("jobs")
      .upsert(batch, { onConflict: "job_url" })

    if (error) {
      console.error(`  Error inserting batch ${i / batchSize + 1}:`, error.message)
    } else {
      inserted += batch.length
      console.log(`  Inserted batch ${i / batchSize + 1} (${inserted}/${transformedJobs.length})`)
    }
  }

  console.log(`  ✅ Migrated ${inserted} jobs`)
  return inserted
}

async function migrateVipSubscribers() {
  console.log("\n👤 Migrating VIP subscribers...")
  const filePath = path.join(ROOT_DIR, "message_sending/whatsapp/database/vip-subscribers.json")
  const data = readJsonFile(filePath)

  if (!data) {
    console.log("  No VIP subscribers to migrate")
    return 0
  }

  const subscribers = Object.entries(data).map(([userName, info]) => ({
    user_name: userName,
    lid: info.lid,
    stacks: info.stacks || [],
    filters: info.filters || {},
    active: info.active ?? true,
    added_at: info.addedAt
  }))

  console.log(`  Found ${subscribers.length} VIP subscribers`)

  const { error } = await supabase
    .from("vip_subscribers")
    .upsert(subscribers, { onConflict: "lid" })

  if (error) {
    console.error("  Error inserting VIP subscribers:", error.message)
    return 0
  }

  console.log(`  ✅ Migrated ${subscribers.length} VIP subscribers`)
  return subscribers.length
}

async function migrateVipPendingSubscribers() {
  console.log("\n⏳ Migrating pending VIP subscribers...")
  const filePath = path.join(ROOT_DIR, "message_sending/whatsapp/database/vip-pending-subscribers.json")
  const data = readJsonFile(filePath)

  if (!data) {
    console.log("  No pending VIP subscribers to migrate")
    return 0
  }

  const subscribers = Object.entries(data).map(([userName, info]) => ({
    user_name: userName,
    lid: info.lid,
    stacks: info.stacks || [],
    filters: info.filters || {},
    requested_at: info.addedAt
  }))

  console.log(`  Found ${subscribers.length} pending VIP subscribers`)

  const { error } = await supabase
    .from("vip_pending_subscribers")
    .upsert(subscribers, { onConflict: "lid" })

  if (error) {
    console.error("  Error inserting pending VIP subscribers:", error.message)
    return 0
  }

  console.log(`  ✅ Migrated ${subscribers.length} pending VIP subscribers`)
  return subscribers.length
}

async function migrateVipHistory() {
  console.log("\n📜 Migrating VIP delivery history...")
  const filePath = path.join(ROOT_DIR, "message_sending/whatsapp/database/vip-history.json")
  const data = readJsonFile(filePath)

  if (!data) {
    console.log("  No VIP history to migrate")
    return 0
  }

  // First, get subscriber IDs by LID
  const { data: subscribers } = await supabase.from("vip_subscribers").select("id, lid")
  const lidToId = Object.fromEntries((subscribers || []).map((s) => [s.lid, s.id]))

  const records = []
  for (const [lid, history] of Object.entries(data)) {
    const subscriberId = lidToId[lid]
    if (!subscriberId) {
      console.log(`  Skipping unknown LID: ${lid}`)
      continue
    }

    const sentJobs = history.sentJobs || {}
    for (const [jobId, sentAt] of Object.entries(sentJobs)) {
      records.push({
        vip_subscriber_id: subscriberId,
        job_id: jobId,
        sent_at: new Date(sentAt).toISOString()
      })
    }
  }

  console.log(`  Found ${records.length} VIP delivery records`)

  if (records.length === 0) {
    return 0
  }

  // Insert in batches
  const batchSize = 500
  let inserted = 0

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const { error } = await supabase
      .from("vip_delivery_history")
      .upsert(batch, { onConflict: "vip_subscriber_id,job_id", ignoreDuplicates: true })

    if (error) {
      console.error(`  Error inserting batch:`, error.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`  ✅ Migrated ${inserted} VIP delivery records`)
  return inserted
}

async function migrateSentHistory() {
  console.log("\n📤 Migrating group delivery history...")
  const filePath = path.join(ROOT_DIR, "message_sending/whatsapp/database/sent_history.json")
  const data = readJsonFile(filePath)

  if (!data || !data.records) {
    console.log("  No group delivery history to migrate")
    return 0
  }

  const records = data.records.map((r) => ({
    job_id: r.jobId,
    group_id: r.groupId,
    sent_at: new Date(r.sentAt).toISOString()
  }))

  console.log(`  Found ${records.length} group delivery records`)

  const { error } = await supabase
    .from("group_delivery_history")
    .upsert(records, { onConflict: "job_id,group_id", ignoreDuplicates: true })

  if (error) {
    console.error("  Error inserting group delivery history:", error.message)
    return 0
  }

  console.log(`  ✅ Migrated ${records.length} group delivery records`)
  return records.length
}

async function migrateAutoResponders() {
  console.log("\n💬 Migrating auto responders...")
  const filePath = path.join(ROOT_DIR, "message_sending/whatsapp/database/auto-responder.json")
  const data = readJsonFile(filePath)

  if (!data || !Array.isArray(data)) {
    console.log("  No auto responders to migrate")
    return 0
  }

  const responders = data.map((r) => ({
    group_id: null, // Global responders
    match_pattern: r.match,
    answer: r.answer,
    active: true
  }))

  console.log(`  Found ${responders.length} auto responders`)

  const { error } = await supabase.from("auto_responders").insert(responders)

  if (error) {
    console.error("  Error inserting auto responders:", error.message)
    return 0
  }

  console.log(`  ✅ Migrated ${responders.length} auto responders`)
  return responders.length
}

async function migrateGroupFeatures() {
  console.log("\n⚙️ Migrating group features...")

  const featureFiles = [
    { file: "anti-link-groups.json", feature: "anti_link" },
    { file: "anti-audio.json", feature: "anti_audio" },
    { file: "anti-document.json", feature: "anti_document" },
    { file: "auto-sticker-groups.json", feature: "auto_sticker" },
    { file: "exit-groups.json", feature: "exit" },
    { file: "inactive-groups.json", feature: "inactive" },
    { file: "only-admins.json", feature: "only_admins" },
    { file: "welcome-groups.json", feature: "welcome" },
    { file: "prefix-groups.json", feature: "prefix" },
    { file: "auto-responder-groups.json", feature: "auto_responder" }
  ]

  const dbDir = path.join(ROOT_DIR, "message_sending/whatsapp/database")
  const records = []

  for (const { file, feature } of featureFiles) {
    const filePath = path.join(dbDir, file)
    const data = readJsonFile(filePath)

    if (!data || !Array.isArray(data)) {
      continue
    }

    for (const groupId of data) {
      records.push({
        group_id: groupId,
        feature: feature,
        enabled: true
      })
    }
  }

  console.log(`  Found ${records.length} group feature settings`)

  if (records.length === 0) {
    return 0
  }

  const { error } = await supabase
    .from("group_features")
    .upsert(records, { onConflict: "group_id,feature" })

  if (error) {
    console.error("  Error inserting group features:", error.message)
    return 0
  }

  console.log(`  ✅ Migrated ${records.length} group feature settings`)
  return records.length
}

async function migrateSenderState() {
  console.log("\n⏰ Migrating sender state...")

  const stateFiles = [
    { file: "job-sender-state.json", type: "job" },
    { file: "card-sender-state.json", type: "card" },
    { file: "vip-promo-state.json", type: "vip_promo" }
  ]

  const dbDir = path.join(ROOT_DIR, "message_sending/whatsapp/database")
  const records = []

  for (const { file, type } of stateFiles) {
    const filePath = path.join(dbDir, file)
    const data = readJsonFile(filePath)

    if (!data || !data.lastSentAt) {
      continue
    }

    records.push({
      sender_type: type,
      last_sent_at: new Date(data.lastSentAt).toISOString()
    })
  }

  console.log(`  Found ${records.length} sender state records`)

  if (records.length === 0) {
    return 0
  }

  const { error } = await supabase
    .from("sender_state")
    .upsert(records, { onConflict: "sender_type" })

  if (error) {
    console.error("  Error inserting sender state:", error.message)
    return 0
  }

  console.log(`  ✅ Migrated ${records.length} sender state records`)
  return records.length
}

async function migrateMutedUsers() {
  console.log("\n🔇 Migrating muted users...")
  const filePath = path.join(ROOT_DIR, "message_sending/whatsapp/database/muted.json")
  const data = readJsonFile(filePath)

  if (!data) {
    console.log("  No muted users to migrate")
    return 0
  }

  const records = []
  for (const [groupId, users] of Object.entries(data)) {
    for (const userId of Object.keys(users)) {
      records.push({
        group_id: groupId,
        user_id: userId
      })
    }
  }

  console.log(`  Found ${records.length} muted user records`)

  if (records.length === 0) {
    return 0
  }

  const { error } = await supabase
    .from("user_mutes")
    .upsert(records, { onConflict: "group_id,user_id" })

  if (error) {
    console.error("  Error inserting muted users:", error.message)
    return 0
  }

  console.log(`  ✅ Migrated ${records.length} muted user records`)
  return records.length
}

async function main() {
  console.log("🚀 Starting JSON to Supabase migration...")
  console.log(`   Supabase URL: ${SUPABASE_URL}`)

  const stats = {
    jobs: 0,
    vipSubscribers: 0,
    vipPending: 0,
    vipHistory: 0,
    groupHistory: 0,
    autoResponders: 0,
    groupFeatures: 0,
    senderState: 0,
    mutedUsers: 0
  }

  try {
    stats.jobs = await migrateJobs()
    stats.vipSubscribers = await migrateVipSubscribers()
    stats.vipPending = await migrateVipPendingSubscribers()
    stats.vipHistory = await migrateVipHistory()
    stats.groupHistory = await migrateSentHistory()
    stats.autoResponders = await migrateAutoResponders()
    stats.groupFeatures = await migrateGroupFeatures()
    stats.senderState = await migrateSenderState()
    stats.mutedUsers = await migrateMutedUsers()

    console.log("\n" + "=".repeat(50))
    console.log("📊 Migration Summary:")
    console.log("=".repeat(50))
    console.log(`   Jobs:              ${stats.jobs}`)
    console.log(`   VIP Subscribers:   ${stats.vipSubscribers}`)
    console.log(`   VIP Pending:       ${stats.vipPending}`)
    console.log(`   VIP History:       ${stats.vipHistory}`)
    console.log(`   Group History:     ${stats.groupHistory}`)
    console.log(`   Auto Responders:   ${stats.autoResponders}`)
    console.log(`   Group Features:    ${stats.groupFeatures}`)
    console.log(`   Sender State:      ${stats.senderState}`)
    console.log(`   Muted Users:       ${stats.mutedUsers}`)
    console.log("=".repeat(50))
    console.log("\n✅ Migration completed!")

  } catch (error) {
    console.error("\n❌ Migration failed:", error)
    process.exit(1)
  }
}

main()

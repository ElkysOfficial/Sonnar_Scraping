/**
 * Supabase-backed data helpers
 */
import { PREFIX, SPIDER_API_TOKEN } from "../config.js"
import {
  supabase,
  isFeatureEnabled,
  setFeatureEnabled,
  getAutoResponders,
  addAutoResponder,
  removeAutoResponder,
  removeAutoResponderByMatch,
  isUserMuted,
  muteUser,
  unmuteUser,
  getMutedUsers
} from "../services/database.js"
import {
  normalizeText,
  normalizeStackInput,
  normalizeWorkModeInput,
  normalizeSeniorityInput
} from "./matchingEngine.js"

const GLOBAL_CONFIG_GROUP_ID = "__global__"

const RESTRICTION_FEATURES = [
  "anti_audio",
  "anti_document",
  "anti_image",
  "anti_video",
  "anti_product",
  "anti_event",
  "anti_sticker"
]

function normalizeFeature(feature) {
  return (feature || "").toString().trim().toLowerCase().replace(/-/g, "_")
}

function denormalizeFeature(feature) {
  return (feature || "").toString().trim().toLowerCase().replace(/_/g, "-")
}

async function getFeatureConfig(groupId, feature) {
  const { data, error } = await supabase
    .from("group_features")
    .select("config")
    .eq("group_id", groupId)
    .eq("feature", feature)
    .maybeSingle()

  if (error) throw error
  return data?.config || null
}

async function setFeatureConfig(groupId, feature, config) {
  await setFeatureEnabled(groupId, feature, true, config || {})
}

// ===== GROUP FEATURES =====

export async function activateExitGroup(groupId) {
  await setFeatureEnabled(groupId, "exit", true)
}

export async function deactivateExitGroup(groupId) {
  await setFeatureEnabled(groupId, "exit", false)
}

export async function isActiveExitGroup(groupId) {
  return await isFeatureEnabled(groupId, "exit")
}

export async function activateWelcomeGroup(groupId) {
  await setFeatureEnabled(groupId, "welcome", true)
}

export async function deactivateWelcomeGroup(groupId) {
  await setFeatureEnabled(groupId, "welcome", false)
}

export async function isActiveWelcomeGroup(groupId) {
  return await isFeatureEnabled(groupId, "welcome")
}

export async function activateGroup(groupId) {
  await setFeatureEnabled(groupId, "inactive", false)
}

export async function deactivateGroup(groupId) {
  await setFeatureEnabled(groupId, "inactive", true)
}

export async function isActiveGroup(groupId) {
  const inactive = await isFeatureEnabled(groupId, "inactive")
  return !inactive
}

export async function activateAutoResponderGroup(groupId) {
  await setFeatureEnabled(groupId, "auto_responder", true)
}

export async function deactivateAutoResponderGroup(groupId) {
  await setFeatureEnabled(groupId, "auto_responder", false)
}

export async function isActiveAutoResponderGroup(groupId) {
  return await isFeatureEnabled(groupId, "auto_responder")
}

export async function activateAntiLinkGroup(groupId) {
  await setFeatureEnabled(groupId, "anti_link", true)
}

export async function deactivateAntiLinkGroup(groupId) {
  await setFeatureEnabled(groupId, "anti_link", false)
}

export async function isActiveAntiLinkGroup(groupId) {
  return await isFeatureEnabled(groupId, "anti_link")
}

export async function activateAutoStickerGroup(groupId) {
  await setFeatureEnabled(groupId, "auto_sticker", true)
}

export async function deactivateAutoStickerGroup(groupId) {
  await setFeatureEnabled(groupId, "auto_sticker", false)
}

export async function isActiveAutoStickerGroup(groupId) {
  return await isFeatureEnabled(groupId, "auto_sticker")
}

export async function activateOnlyAdmins(groupId) {
  await setFeatureEnabled(groupId, "only_admins", true)
}

export async function deactivateOnlyAdmins(groupId) {
  await setFeatureEnabled(groupId, "only_admins", false)
}

export async function isActiveOnlyAdmins(groupId) {
  return await isFeatureEnabled(groupId, "only_admins")
}

// ===== GROUP RESTRICTIONS =====

export async function readGroupRestrictions() {
  const { data, error } = await supabase
    .from("group_features")
    .select("group_id, feature, enabled")
    .in("feature", RESTRICTION_FEATURES)

  if (error) throw error

  const restrictions = {}
  for (const row of data || []) {
    if (!restrictions[row.group_id]) {
      restrictions[row.group_id] = {}
    }
    restrictions[row.group_id][denormalizeFeature(row.feature)] = !!row.enabled
  }

  return restrictions
}

export async function saveGroupRestrictions(restrictions) {
  const entries = restrictions || {}
  const tasks = []

  for (const [groupId, rules] of Object.entries(entries)) {
    for (const [restriction, enabled] of Object.entries(rules || {})) {
      tasks.push(setFeatureEnabled(groupId, normalizeFeature(restriction), !!enabled))
    }
  }

  await Promise.all(tasks)
}

export async function isActiveGroupRestriction(groupId, restriction) {
  return await isFeatureEnabled(groupId, normalizeFeature(restriction))
}

export async function updateIsActiveGroupRestriction(groupId, restriction, isActive) {
  await setFeatureEnabled(groupId, normalizeFeature(restriction), !!isActive)
}

export function readRestrictedMessageTypes() {
  return {
    sticker: "stickerMessage",
    video: "videoMessage",
    image: "imageMessage",
    audio: "audioMessage",
    product: "productMessage",
    document: "documentMessage",
    event: "eventMessage"
  }
}

// ===== PREFIX =====

export async function setPrefix(groupJid, prefix) {
  await setFeatureConfig(groupJid, "prefix", { prefix })
}

export async function getPrefix(groupJid) {
  const groupConfig = await getFeatureConfig(groupJid, "prefix")
  if (groupConfig?.prefix) {
    return groupConfig.prefix
  }

  const globalConfig = await getFeatureConfig(GLOBAL_CONFIG_GROUP_ID, "prefix")
  if (globalConfig?.prefix) {
    return globalConfig.prefix
  }

  return PREFIX
}

// ===== AUTO RESPONDER =====

async function listAutoRespondersRaw() {
  const { data, error } = await supabase
    .from("auto_responders")
    .select("id, match_pattern, answer")
    .is("group_id", null)
    .order("created_at", { ascending: true })

  if (error) throw error
  return data || []
}

export async function getAutoResponderResponse(match, groupId = null) {
  const value = (match || "").toString().trim()
  if (!value) {
    return null
  }

  const normalized = value.toLowerCase()
  const responders = await getAutoResponders(groupId)
  const found = responders.find((r) =>
    (r.match_pattern || "").toLowerCase() === normalized
  )

  return found ? found.answer : null
}

export async function listAutoResponderItems() {
  const responses = await listAutoRespondersRaw()

  return responses.map((item, index) => ({
    key: index + 1,
    id: item.id,
    match: item.match_pattern,
    answer: item.answer
  }))
}

export async function addAutoResponderItem(match, answer) {
  const matchText = (match || "").toString().trim()
  const answerText = (answer || "").toString().trim()
  if (!matchText || !answerText) {
    return false
  }

  const existing = await listAutoRespondersRaw()
  const exists = existing.some(
    (item) => (item.match_pattern || "").toLowerCase() === matchText.toLowerCase()
  )

  if (exists) {
    return false
  }

  await addAutoResponder(matchText, answerText, null)
  return true
}

export async function removeAutoResponderItemByKey(key) {
  const responses = await listAutoRespondersRaw()
  const index = key - 1

  if (index < 0 || index >= responses.length) {
    return false
  }

  await removeAutoResponder(responses[index].id)
  return true
}

// ===== SPIDER API TOKEN =====

export async function setSpiderApiToken(token) {
  await setFeatureConfig(GLOBAL_CONFIG_GROUP_ID, "spider_api_token", { token })
}

export async function getSpiderApiToken() {
  const config = await getFeatureConfig(GLOBAL_CONFIG_GROUP_ID, "spider_api_token")
  return config?.token || SPIDER_API_TOKEN
}

// ===== MUTES =====

export async function muteMember(groupId, memberId) {
  await muteUser(groupId, memberId)
}

export async function unmuteMember(groupId, memberId) {
  await unmuteUser(groupId, memberId)
}

export async function checkIfMemberIsMuted(groupId, memberId) {
  return await isUserMuted(groupId, memberId)
}

// ===== VIP SUBSCRIBERS =====

function normalizeVipFilters(filtersInput) {
  if (!filtersInput || typeof filtersInput !== "object") {
    return {
      roles: [],
      stacks: [],
      seniority: [],
      locations: [],
      workMode: [],
      contract: [],
      languages: [],
      weights: {
        roles: 20,
        stacks: 30,
        seniority: 15,
        locations: 10,
        workMode: 10,
        contract: 10,
        languages: 5
      },
      must: {
        roles: true,
        stacks: true,
        workMode: false,
        contract: false,
        languages: false
      },
      ignoreUnknown: true
    }
  }

  const normalizeList = (values, normalizer) => {
    const list = Array.isArray(values) ? values : []
    const normalized = []
    for (const value of list) {
      const base = normalizeText(value)
      const normalizedValue = normalizer ? normalizer(base) : base
      if (normalizedValue) {
        normalized.push(normalizedValue)
      }
    }
    return [...new Set(normalized)]
  }

  return {
    roles: normalizeList(filtersInput.roles),
    stacks: normalizeList(filtersInput.stacks, normalizeStackInput),
    seniority: normalizeList(filtersInput.seniority, normalizeSeniorityInput),
    locations: normalizeList(filtersInput.locations),
    workMode: normalizeList(filtersInput.workMode, normalizeWorkModeInput),
    contract: normalizeList(filtersInput.contract),
    languages: normalizeList(filtersInput.languages),
    weights: filtersInput.weights || {
      roles: 20,
      stacks: 30,
      seniority: 15,
      locations: 10,
      workMode: 10,
      contract: 10,
      languages: 5
    },
    must: filtersInput.must || {
      roles: true,
      stacks: true,
      workMode: false,
      contract: false,
      languages: false
    },
    ignoreUnknown: filtersInput.ignoreUnknown !== false
  }
}

function mapVipSubscriber(row) {
  const filters = row.filters || normalizeVipFilters({ stacks: row.stacks || [] })
  return {
    name: row.user_name || row.name || "",
    lid: row.lid,
    phone: row.phone || null,
    stacks: row.stacks || filters.stacks || [],
    filters,
    active: row.active ?? true,
    addedAt: row.added_at,
    updatedAt: row.updated_at
  }
}

export async function getVipSubscribersObject() {
  const subscribers = await getVipSubscribers(false)
  return Object.fromEntries(subscribers.map((s) => [s.name, { ...s }]))
}

export async function getVipSubscribers(onlyActive = true) {
  let query = supabase.from("vip_subscribers").select("*").order("added_at", { ascending: true })
  if (onlyActive) {
    query = query.eq("active", true)
  }

  const { data, error } = await query
  if (error) throw error

  return (data || []).map(mapVipSubscriber)
}

export async function addVipSubscriber(name, lid, filtersInput) {
  if (!name || !name.trim()) {
    throw new Error("Nome e obrigatorio para adicionar VIP")
  }
  if (!lid) {
    throw new Error("LID e obrigatorio para adicionar VIP")
  }

  const normalizedName = name.trim()
  const filters = normalizeVipFilters(filtersInput)
  const stacks = filters.stacks || []
  const now = new Date().toISOString()

  const { data: existing, error: existingError } = await supabase
    .from("vip_subscribers")
    .select("id")
    .eq("lid", lid)
    .maybeSingle()

  if (existingError) throw existingError

  const payload = {
    user_name: normalizedName,
    lid,
    stacks,
    filters,
    active: true,
    updated_at: now
  }

  if (!existing) {
    payload.added_at = now
  }

  const { error } = await supabase
    .from("vip_subscribers")
    .upsert(payload, { onConflict: "lid" })

  if (error) throw error
  return !existing
}

export async function setVipActive(lid, active) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .update({ active: !!active, updated_at: new Date().toISOString() })
    .eq("lid", lid)
    .select("id")
    .maybeSingle()

  if (error) throw error
  return !!data
}

export async function setVipActiveByName(name, active) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .update({ active: !!active, updated_at: new Date().toISOString() })
    .eq("user_name", name)
    .select("id")
    .maybeSingle()

  if (error) throw error
  return !!data
}

export async function removeVipSubscriber(lid) {
  const { error } = await supabase
    .from("vip_subscribers")
    .delete()
    .eq("lid", lid)

  if (error) throw error
  return true
}

export async function removeVipSubscriberByName(name) {
  const { error } = await supabase
    .from("vip_subscribers")
    .delete()
    .eq("user_name", name)

  if (error) throw error
  return true
}

export async function getVipSubscriber(lid) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .select("*")
    .eq("lid", lid)
    .eq("active", true)
    .maybeSingle()

  if (error) throw error
  return data ? mapVipSubscriber(data) : null
}

export async function getVipSubscriberByName(name) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .select("*")
    .eq("user_name", name)
    .maybeSingle()

  if (error) throw error
  return data ? mapVipSubscriber(data) : null
}

export async function isVipSubscriber(lid) {
  const subscriber = await getVipSubscriber(lid)
  return subscriber !== null
}

export async function getSubscribersByStack(stack) {
  const subscribers = await getVipSubscribers(true)
  const stackLower = (stack || "").toLowerCase()

  return subscribers.filter((s) =>
    (s.filters?.stacks || s.stacks || []).some(
      (st) => st.toLowerCase() === stackLower || st.toLowerCase() === "todas"
    )
  )
}

// ===== VIP PENDING =====

function mapVipPending(row) {
  return {
    name: row.user_name || row.name || "",
    lid: row.lid,
    phone: row.phone || null,
    stacks: row.stacks || [],
    filters: row.filters || {},
    paymentProof: row.payment_proof || null,
    status: row.status || "pending",
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    paymentReceivedAt: row.payment_received_at,
    rejectReason: row.reject_reason || null
  }
}

export async function getVipPendingSubscribers() {
  const { data, error } = await supabase
    .from("vip_pending_subscribers")
    .select("*")
    .order("requested_at", { ascending: true })

  if (error) throw error
  return (data || []).map(mapVipPending)
}

export async function getVipPendingByLid(lid) {
  const pending = await getVipPendingSubscribers()
  return pending.find((p) => p.lid === lid && p.status === "pending") || null
}

export async function getVipPendingByNumber(clientNumber) {
  const pending = await getVipPendingSubscribers()
  const normalized = (clientNumber || "").replace("@lid", "").replace("@s.whatsapp.net", "")
  return (
    pending.find((p) => {
      const pendingNumber = p.lid?.replace("@lid", "").replace("@s.whatsapp.net", "") || ""
      return pendingNumber === normalized && p.status === "pending"
    }) || null
  )
}

export async function addVipPendingSubscriber(name, lid, filtersInput, paymentProof = null) {
  const filters = normalizeVipFilters(filtersInput)
  const stacks = filters.stacks || []
  const now = new Date().toISOString()

  const { data: existing, error: existingError } = await supabase
    .from("vip_pending_subscribers")
    .select("requested_at")
    .eq("lid", lid)
    .maybeSingle()

  if (existingError) throw existingError

  const payload = {
    user_name: (name || "").trim(),
    lid,
    stacks,
    filters,
    payment_proof: paymentProof,
    status: "pending",
    requested_at: existing?.requested_at || now
  }

  const { error } = await supabase
    .from("vip_pending_subscribers")
    .upsert(payload, { onConflict: "lid" })

  if (error) throw error
  return !existing
}

export async function updateVipPendingPaymentProof(lid, paymentProof) {
  const { data, error } = await supabase
    .from("vip_pending_subscribers")
    .update({
      payment_proof: paymentProof,
      payment_received_at: new Date().toISOString()
    })
    .eq("lid", lid)
    .eq("status", "pending")
    .select("lid")
    .maybeSingle()

  if (error) throw error
  return !!data
}

export async function approveVipSubscriber(lid, decidedBy) {
  const { data: pending, error } = await supabase
    .from("vip_pending_subscribers")
    .select("*")
    .eq("lid", lid)
    .eq("status", "pending")
    .maybeSingle()

  if (error) throw error
  if (!pending) return { ok: false, reason: "not_found" }

  const { error: updateError } = await supabase
    .from("vip_pending_subscribers")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: decidedBy || null
    })
    .eq("lid", lid)

  if (updateError) throw updateError

  await addVipSubscriber(pending.user_name || pending.name || "VIP", pending.lid, pending.filters)

  return {
    ok: true,
    subscriber: {
      name: pending.user_name || pending.name || "",
      lid: pending.lid,
      filters: pending.filters
    }
  }
}

export async function rejectVipSubscriber(lid, decidedBy, reason = null) {
  const { data: pending, error } = await supabase
    .from("vip_pending_subscribers")
    .select("*")
    .eq("lid", lid)
    .eq("status", "pending")
    .maybeSingle()

  if (error) throw error
  if (!pending) return { ok: false, reason: "not_found" }

  const { error: updateError } = await supabase
    .from("vip_pending_subscribers")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      decided_by: decidedBy || null,
      reject_reason: reason || null
    })
    .eq("lid", lid)

  if (updateError) throw updateError

  return { ok: true, subscriber: mapVipPending(pending) }
}

// ===== MUTED LIST (compat) =====

export async function getMutedUsersList(groupId) {
  return await getMutedUsers(groupId)
}

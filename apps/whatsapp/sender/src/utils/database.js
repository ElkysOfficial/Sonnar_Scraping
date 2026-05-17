/**
 * Helpers de dados do bot.
 *
 * Refactor 2026-05-16:
 *  - Moderacao de grupo (prefixo por grupo, anti-*, welcome/exit, mutes,
 *    auto-responder, only-admins) foi DESCONTINUADA. As funcoes continuam
 *    exportadas para nao quebrar comandos/middlewares, mas agora sao no-op
 *    ou retornam constantes — nao tocam mais o banco.
 *  - VIP: dois fluxos.
 *      Fluxo A (portal): assinante pareou via token; o vinculo (wa_lid),
 *        o plano e o perfil vivem em subscribers/subscriber_profiles. O bot
 *        NAO mantem copia — le direto. Cancelar no Stripe reflete na hora.
 *      Fluxo B (fora do portal): captado pelo WhatsApp; vive na tabela
 *        local vip_subscribers, com status pending/active/rejected.
 *  - Envio personalizado (privado) so vale para o plano 'plus'. Pro recebe
 *    no grupo (controle de acesso ao grupo, nao de envio); free nao recebe.
 */
import { PREFIX, SPIDER_API_TOKEN } from "../config.js"
import { supabase } from "../services/database.js"
import { buildVipFiltersFromPortal } from "./portalProfile.js"
import {
  normalizeText,
  normalizeStackInput,
  normalizeWorkModeInput,
  normalizeSeniorityInput
} from "./matchingEngine.js"

// =====================================================
// MODERACAO DESCONTINUADA — funcoes mantidas como no-op
// =====================================================

export async function activateExitGroup() {}
export async function deactivateExitGroup() {}
export async function isActiveExitGroup() { return false }
export async function activateWelcomeGroup() {}
export async function deactivateWelcomeGroup() {}
export async function isActiveWelcomeGroup() { return false }
export async function activateGroup() {}
export async function deactivateGroup() {}
// Bot sempre ativo: nao ha mais on/off por grupo.
export async function isActiveGroup() { return true }
export async function activateAutoResponderGroup() {}
export async function deactivateAutoResponderGroup() {}
export async function isActiveAutoResponderGroup() { return false }
export async function activateAntiLinkGroup() {}
export async function deactivateAntiLinkGroup() {}
export async function isActiveAntiLinkGroup() { return false }
export async function activateAutoStickerGroup() {}
export async function deactivateAutoStickerGroup() {}
export async function isActiveAutoStickerGroup() { return false }
export async function activateOnlyAdmins() {}
export async function deactivateOnlyAdmins() {}
export async function isActiveOnlyAdmins() { return false }
export async function readGroupRestrictions() { return {} }
export async function saveGroupRestrictions() {}
export async function isActiveGroupRestriction() { return false }
export async function updateIsActiveGroupRestriction() {}

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

// ===== PREFIXO (fixo do config.js) =====

export async function setPrefix() {}
export async function getPrefix() {
  return PREFIX
}

// ===== AUTO RESPONDER (descontinuado) =====

export async function getAutoResponderResponse() { return null }
export async function listAutoResponderItems() { return [] }
export async function addAutoResponderItem() { return false }
export async function removeAutoResponderItemByKey() { return false }

// ===== SPIDER API TOKEN (fixo do config.js) =====

export async function setSpiderApiToken() {}
export async function getSpiderApiToken() {
  return SPIDER_API_TOKEN
}

// ===== MUTES (descontinuado) =====

export async function muteMember() {}
export async function unmuteMember() {}
export async function checkIfMemberIsMuted() { return false }
export async function getMutedUsersList() { return [] }

// =====================================================
// VIP SUBSCRIBERS
// =====================================================

// Cache da lista de destinatarios "plus" (Fluxo A + B unidos).
const vipSubscribersCache = {
  data: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000
}

const VIP_LOCAL_FIELDS =
  "id, lid, user_name, phone, plan, filters, status, added_at, updated_at"

const VIP_PENDING_FIELDS =
  "id, lid, user_name, phone, plan, filters, payment_proof, status, added_at, decided_at, decided_by, reject_reason"

export function invalidateVipSubscribersCache() {
  vipSubscribersCache.data = null
  vipSubscribersCache.timestamp = 0
}

function isVipCacheValid() {
  if (!vipSubscribersCache.data) return false
  return Date.now() - vipSubscribersCache.timestamp < vipSubscribersCache.ttl
}

/**
 * Normaliza o objeto de filtros VIP para o shape que o matchingEngine espera.
 */
export function normalizeVipFilters(filtersInput) {
  const defaults = {
    weights: { roles: 20, stacks: 30, seniority: 15, locations: 10, workMode: 10, contract: 10, languages: 5 },
    must: { roles: true, stacks: true, workMode: false, contract: false, languages: false }
  }

  if (!filtersInput || typeof filtersInput !== "object") {
    return {
      roles: [], areas: [], stacks: [], seniority: [], locations: [],
      workMode: [], contract: [], languages: [],
      weights: defaults.weights, must: defaults.must, ignoreUnknown: true
    }
  }

  const normalizeList = (values, normalizer) => {
    const list = Array.isArray(values) ? values : []
    const normalized = []
    for (const value of list) {
      const base = normalizeText(value)
      const normalizedValue = normalizer ? normalizer(base) : base
      if (normalizedValue) normalized.push(normalizedValue)
    }
    return [...new Set(normalized)]
  }

  // Areas de atuacao — valores canonicos (backend, frontend, devops, infra...).
  const areas = Array.isArray(filtersInput.areas)
    ? [...new Set(filtersInput.areas.map((a) => String(a).toLowerCase().trim()).filter(Boolean))]
    : []

  return {
    roles: normalizeList(filtersInput.roles),
    areas,
    stacks: normalizeList(filtersInput.stacks, normalizeStackInput),
    seniority: normalizeList(filtersInput.seniority, normalizeSeniorityInput),
    locations: normalizeList(filtersInput.locations),
    workMode: normalizeList(filtersInput.workMode, normalizeWorkModeInput),
    contract: normalizeList(filtersInput.contract),
    languages: normalizeList(filtersInput.languages),
    weights: filtersInput.weights || defaults.weights,
    must: filtersInput.must || defaults.must,
    ignoreUnknown: filtersInput.ignoreUnknown !== false
  }
}

/**
 * Mapeia uma linha local (vip_subscribers) para o shape consumido pelos senders.
 */
function mapLocalVip(row) {
  const filters = normalizeVipFilters(row.filters)
  return {
    name: row.user_name || "",
    lid: row.lid,
    phone: row.phone || null,
    plan: row.plan || "plus",
    stacks: filters.stacks || [],
    filters,
    status: row.status || "pending",
    active: row.status === "active",
    source: "local",
    addedAt: row.added_at,
    updatedAt: row.updated_at
  }
}

/**
 * Le os assinantes 'plus' ATIVOS direto do portal (Fluxo A).
 * Cancelamento/expiracao no Stripe (subscribers.status != 'active') some daqui.
 */
async function getPortalPlusSubscribers() {
  const { data, error } = await supabase
    .from("subscriber_profiles")
    .select(
      "wa_lid, stack, areas, seniority, work_models, location, min_salary, subscribers!inner(name, surname, plan, status, phone)"
    )
    .not("wa_lid", "is", null)
    .eq("subscribers.plan", "plus")
    .eq("subscribers.status", "active")

  if (error) throw error

  return (data || []).map((row) => {
    const sub = row.subscribers || {}
    const name = [sub.name, sub.surname].filter(Boolean).join(" ").trim() || sub.name || "Assinante Sonnar"
    return {
      name,
      lid: row.wa_lid,
      phone: sub.phone || null,
      plan: "plus",
      filters: normalizeVipFilters(buildVipFiltersFromPortal(row)),
      stacks: Array.isArray(row.stack) ? row.stack.map((s) => String(s).toLowerCase()) : [],
      status: "active",
      active: true,
      source: "portal"
    }
  })
}

/**
 * Lista de destinatarios de vagas PERSONALIZADAS (plano plus).
 * Une Fluxo A (portal) + Fluxo B (tabela local). Local tem prioridade no dedupe.
 *
 * @param {boolean} onlyActive  true = so quem pode receber agora.
 */
export async function getVipSubscribers(onlyActive = true) {
  if (onlyActive && isVipCacheValid()) {
    return vipSubscribersCache.data
  }

  // Fluxo B: tabela local (so plano plus).
  let localQuery = supabase
    .from("vip_subscribers")
    .select(VIP_LOCAL_FIELDS)
    .eq("plan", "plus")
    .order("added_at", { ascending: true })
  if (onlyActive) {
    localQuery = localQuery.eq("status", "active")
  }
  const { data: localData, error: localError } = await localQuery
  if (localError) throw localError
  const local = (localData || []).map(mapLocalVip)

  // Fluxo A: portal.
  let portal = []
  try {
    portal = await getPortalPlusSubscribers()
  } catch (err) {
    // Nao derruba o ciclo se a leitura do portal falhar.
    portal = []
  }

  // Une com dedupe por LID — local prevalece.
  const byLid = new Map()
  for (const sub of portal) byLid.set(sub.lid, sub)
  for (const sub of local) byLid.set(sub.lid, sub)
  const merged = [...byLid.values()]

  if (onlyActive) {
    vipSubscribersCache.data = merged
    vipSubscribersCache.timestamp = Date.now()
  }
  return merged
}

export async function getVipSubscribersObject() {
  const subscribers = await getVipSubscribers(false)
  return Object.fromEntries(subscribers.map((s) => [s.name, { ...s }]))
}

/**
 * Adiciona/atualiza assinante do Fluxo B como ATIVO (uso: comando /vip ou aprovacao).
 */
export async function addVipSubscriber(name, lid, filtersInput, plan = "plus") {
  if (!name || !name.trim()) throw new Error("Nome e obrigatorio para adicionar VIP")
  if (!lid) throw new Error("LID e obrigatorio para adicionar VIP")

  const filters = normalizeVipFilters(filtersInput)
  const now = new Date().toISOString()

  const { error } = await supabase
    .from("vip_subscribers")
    .upsert(
      {
        user_name: name.trim(),
        lid,
        plan,
        filters,
        status: "active",
        updated_at: now
      },
      { onConflict: "lid" }
    )

  if (error) throw error
  invalidateVipSubscribersCache()
  return true
}

export async function setVipActive(lid, active) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .update({ status: active ? "active" : "rejected", updated_at: new Date().toISOString() })
    .eq("lid", lid)
    .select("id")
    .maybeSingle()

  if (error) throw error
  invalidateVipSubscribersCache()
  return !!data
}

export async function setVipActiveByName(name, active) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .update({ status: active ? "active" : "rejected", updated_at: new Date().toISOString() })
    .eq("user_name", name)
    .select("id")
    .maybeSingle()

  if (error) throw error
  invalidateVipSubscribersCache()
  return !!data
}

export async function removeVipSubscriber(lid) {
  const { error } = await supabase.from("vip_subscribers").delete().eq("lid", lid)
  if (error) throw error
  invalidateVipSubscribersCache()
  return true
}

export async function removeVipSubscriberByName(name) {
  const { error } = await supabase.from("vip_subscribers").delete().eq("user_name", name)
  if (error) throw error
  invalidateVipSubscribersCache()
  return true
}

/**
 * Busca um assinante ativo por LID — Fluxo B (local) e, se nao achar, Fluxo A (portal).
 */
export async function getVipSubscriber(lid) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .select(VIP_LOCAL_FIELDS)
    .eq("lid", lid)
    .eq("status", "active")
    .eq("plan", "plus")
    .maybeSingle()

  if (error) throw error
  if (data) return mapLocalVip(data)

  // Fallback: assinante do portal (Fluxo A).
  const portal = await getPortalPlusSubscribers()
  return portal.find((s) => s.lid === lid) || null
}

export async function getVipSubscriberByName(name) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .select(VIP_LOCAL_FIELDS)
    .eq("user_name", name)
    .maybeSingle()

  if (error) throw error
  return data ? mapLocalVip(data) : null
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

// =====================================================
// VIP — FLUXO B: aprovacao manual (status pending/active/rejected)
// =====================================================

function mapVipPending(row) {
  return {
    name: row.user_name || "",
    lid: row.lid,
    phone: row.phone || null,
    plan: row.plan || "plus",
    stacks: row.filters?.stacks || [],
    filters: row.filters || {},
    paymentProof: row.payment_proof || null,
    status: row.status || "pending",
    requestedAt: row.added_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    rejectReason: row.reject_reason || null
  }
}

export async function getVipPendingSubscribers() {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .select(VIP_PENDING_FIELDS)
    .eq("status", "pending")
    .order("added_at", { ascending: true })

  if (error) throw error
  return (data || []).map(mapVipPending)
}

export async function getVipPendingByLid(lid) {
  const pending = await getVipPendingSubscribers()
  return pending.find((p) => p.lid === lid) || null
}

export async function getVipPendingByNumber(clientNumber) {
  const pending = await getVipPendingSubscribers()
  const normalized = (clientNumber || "").replace("@lid", "").replace("@s.whatsapp.net", "")
  return (
    pending.find((p) => {
      const num = p.lid?.replace("@lid", "").replace("@s.whatsapp.net", "") || ""
      return num === normalized
    }) || null
  )
}

/**
 * Registra um assinante do Fluxo B como PENDENTE de aprovacao.
 * Plano default 'plus' (quem paga vagas personalizadas fora do portal).
 */
export async function addVipPendingSubscriber(name, lid, filtersInput, paymentProof = null) {
  if (!lid) throw new Error("LID e obrigatorio")
  const filters = normalizeVipFilters(filtersInput)
  const now = new Date().toISOString()

  const { error } = await supabase
    .from("vip_subscribers")
    .upsert(
      {
        user_name: (name || "").trim() || "Assinante",
        lid,
        plan: "plus",
        filters,
        payment_proof: paymentProof,
        status: "pending",
        updated_at: now
      },
      { onConflict: "lid" }
    )

  if (error) throw error
  invalidateVipSubscribersCache()
  return true
}

export async function updateVipPendingPaymentProof(lid, paymentProof) {
  const { data, error } = await supabase
    .from("vip_subscribers")
    .update({ payment_proof: paymentProof, updated_at: new Date().toISOString() })
    .eq("lid", lid)
    .eq("status", "pending")
    .select("lid")
    .maybeSingle()

  if (error) throw error
  return !!data
}

export async function approveVipSubscriber(lid, decidedBy) {
  const { data: pending, error } = await supabase
    .from("vip_subscribers")
    .select(VIP_PENDING_FIELDS)
    .eq("lid", lid)
    .eq("status", "pending")
    .maybeSingle()

  if (error) throw error
  if (!pending) return { ok: false, reason: "not_found" }

  const { error: updateError } = await supabase
    .from("vip_subscribers")
    .update({
      status: "active",
      decided_at: new Date().toISOString(),
      decided_by: decidedBy || null,
      updated_at: new Date().toISOString()
    })
    .eq("lid", lid)

  if (updateError) throw updateError
  invalidateVipSubscribersCache()

  return {
    ok: true,
    subscriber: {
      name: pending.user_name || "",
      lid: pending.lid,
      filters: pending.filters
    }
  }
}

export async function rejectVipSubscriber(lid, decidedBy, reason = null) {
  const { data: pending, error } = await supabase
    .from("vip_subscribers")
    .select(VIP_PENDING_FIELDS)
    .eq("lid", lid)
    .eq("status", "pending")
    .maybeSingle()

  if (error) throw error
  if (!pending) return { ok: false, reason: "not_found" }

  const { error: updateError } = await supabase
    .from("vip_subscribers")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      decided_by: decidedBy || null,
      reject_reason: reason || null,
      updated_at: new Date().toISOString()
    })
    .eq("lid", lid)

  if (updateError) throw updateError
  invalidateVipSubscribersCache()

  return { ok: true, subscriber: mapVipPending(pending) }
}

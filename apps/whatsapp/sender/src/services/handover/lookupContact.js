/**
 * lookupContact — identifica quem esta do outro lado da conversa.
 *
 * Ordem de busca (do mais especifico pro mais generico):
 *   1. Eh um dos numeros admin? -> identified_as: 'admin'
 *   2. Existe em clients (Elkys) por telefone/whatsapp? -> 'elkys_client'
 *   3. Existe em subscribers (Sonnar) por phone? -> 'sonnar_subscriber'
 *   4. Caso contrario -> 'unknown' (vira lead quando solicitar atendimento)
 *
 * O lookup eh paralelo (Promise.all) pra reduzir latencia.
 */
import { getSonnarClient } from "./sonnarClient.js"
import { getElkysClient } from "./elkysClient.js"
import { ADMIN_PHONES, ADMIN_LIDS } from "../../config.js"
import { errorLog } from "../../utils/logger.js"

// getElkysClient eh re-exportado abaixo via resolveTargetJid.

/**
 * Extrai o numero (so digitos) de um JID do WhatsApp.
 * "5511999999999@s.whatsapp.net" -> "5511999999999"
 *
 * IMPORTANTE: a partir da migracao LID, JIDs como "120152280592452@lid"
 * NAO representam o numero de telefone — sao identificadores opacos.
 * isAdminJid checa LIDs separadamente; este helper continua devolvendo
 * digitos crus pra compatibilidade com codigo legado.
 */
export function jidToPhone(jid) {
  if (!jid) return ""
  return jid.replace(/@.*$/, "").replace(/\D/g, "")
}

/**
 * Verifica se o JID corresponde a um admin.
 *
 * Aceita:
 *   - JIDs com phone (ex: 5511999999999@s.whatsapp.net)
 *     → compara digitos contra ADMIN_PHONES
 *   - JIDs com LID (ex: 120152280592452@lid)
 *     → compara JID completo contra ADMIN_LIDS (inclui OWNER_LID)
 *
 * v3.10.26: aceita LID porque WhatsApp passou a usar @lid por privacidade.
 */
export function isAdminJid(jid) {
  if (!jid) return false
  // 1. Match por LID (@lid)
  if (ADMIN_LIDS.includes(jid)) return true
  // 2. Match por numero (@s.whatsapp.net)
  if (jid.includes("@s.whatsapp.net")) {
    const phone = jidToPhone(jid)
    if (ADMIN_PHONES.includes(phone)) return true
  }
  return false
}

/**
 * Normaliza um telefone para JID do WhatsApp.
 * Aceita formatos variados. Retorna null se invalido.
 *
 * IMPORTANTE: WhatsApp moderno usa @lid pra mensagens diretas. Use
 * resolveTargetJid (async, busca no banco) quando precisar do JID
 * REAL de um cliente — phoneToJid eh fallback pra phones brasileiros
 * conhecidos (admins) que ainda tem registro @s.whatsapp.net.
 */
export function phoneToJid(phone) {
  const digits = (phone || "").replace(/\D/g, "")
  if (digits.length < 10) return null
  const full = digits.length <= 11 ? `55${digits}` : digits
  return `${full}@s.whatsapp.net`
}

/**
 * Resolve o JID REAL de um cliente a partir de um input do admin.
 *
 * Comportamentos:
 *   1. Input ja eh um JID completo (@lid ou @s.whatsapp.net): usa direto.
 *   2. Input eh so digitos: busca em whatsapp_conversations.jid pra encontrar
 *      o JID atual do cliente (pode ser LID — qualquer numero alto eh LID).
 *      Prioriza a conversa MAIS RECENTE.
 *   3. Nada encontrado: fallback para phoneToJid (@s.whatsapp.net) so se
 *      tiver entre 10 e 13 digitos (formato phone brasileiro).
 *
 * @param {string} input
 * @returns {Promise<string|null>}
 */
export async function resolveTargetJid(input) {
  const raw = (input || "").trim()
  if (!raw) return null

  // 1. Ja eh JID completo
  if (raw.includes("@s.whatsapp.net") || raw.includes("@lid") || raw.includes("@g.us")) {
    return raw
  }

  const digits = raw.replace(/\D/g, "")
  if (!digits) return null

  // 2. Busca conversa real no banco — match pelos digitos como prefixo do JID
  const supa = getElkysClient()
  if (supa) {
    try {
      // Tenta exato primeiro (jid comeca com esses digitos seguido de @)
      const { data: exact } = await supa
        .from("whatsapp_conversations")
        .select("jid, last_message_at")
        .ilike("jid", `${digits}@%`)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      if (exact?.jid) return exact.jid

      // Tenta sufixo (caso o admin tenha digitado so os 11 ultimos digitos)
      const { data: suffix } = await supa
        .from("whatsapp_conversations")
        .select("jid, last_message_at")
        .ilike("jid", `%${digits}@%`)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      if (suffix?.jid) return suffix.jid
    } catch (err) {
      errorLog(`[resolveTargetJid] busca falhou: ${err.message}`)
    }
  }

  // 3. Fallback: phone brasileiro tradicional @s.whatsapp.net
  if (digits.length >= 10 && digits.length <= 13) {
    return phoneToJid(digits)
  }

  // Nada encontrado e nao parece phone valido
  return null
}

/**
 * @typedef {Object} ContactInfo
 * @property {'admin'|'elkys_client'|'sonnar_subscriber'|'unknown'} identifiedAs
 * @property {string} phone
 * @property {string} displayName
 * @property {string|null} clientId       Elkys clients.id
 * @property {string|null} subscriberId    Sonnar subscribers.id
 * @property {string|null} subscriberPlan  free | pro | plus
 * @property {string|null} email
 */

/**
 * Identifica o contato por JID. Sempre devolve um objeto — mesmo
 * quando nao encontrado, com identifiedAs='unknown'.
 *
 * @param {string} jid
 * @returns {Promise<ContactInfo>}
 */
export async function lookupContact(jid) {
  const phone = jidToPhone(jid)
  const base = {
    identifiedAs: "unknown",
    phone,
    displayName: phone ? `+${phone}` : "(sem numero)",
    clientId: null,
    subscriberId: null,
    subscriberPlan: null,
    email: null,
  }

  // 1. Admin? (verificacao local — funciona com phone OU LID)
  if (isAdminJid(jid)) {
    return { ...base, identifiedAs: "admin", displayName: "Admin" }
  }

  if (!phone) return base

  // 2 + 3. Busca em paralelo nos dois bancos
  const [elkysResult, sonnarResult] = await Promise.allSettled([
    lookupElkysClient(phone),
    lookupSonnarSubscriber(phone),
  ])

  const elkys = elkysResult.status === "fulfilled" ? elkysResult.value : null
  const sonnar = sonnarResult.status === "fulfilled" ? sonnarResult.value : null

  // Prioridade: cliente Elkys eh mais "valioso" que assinante Sonnar
  // (cliente Elkys paga projeto, assinante Sonnar paga R$5-10/mes)
  if (elkys) {
    return {
      ...base,
      identifiedAs: "elkys_client",
      displayName: elkys.full_name || elkys.razao_social || phone,
      clientId: elkys.id,
      email: elkys.email,
      subscriberId: sonnar?.id || null,        // pode ser ambos
      subscriberPlan: sonnar?.plan || null,
    }
  }

  if (sonnar) {
    return {
      ...base,
      identifiedAs: "sonnar_subscriber",
      displayName: sonnar.name || phone,
      subscriberId: sonnar.id,
      subscriberPlan: sonnar.plan,
      email: sonnar.email,
    }
  }

  return base
}

/**
 * Busca cliente Elkys por telefone. Tenta multiplos campos:
 *   - clients.whatsapp (mais especifico)
 *   - clients.phone
 *   - client_contacts.phone
 */
async function lookupElkysClient(phone) {
  const supa = getElkysClient()
  if (!supa) return null

  try {
    // 1. clients.whatsapp ou clients.phone exato
    const { data: byClient } = await supa
      .from("clients")
      .select("id, full_name, razao_social, nome_fantasia, email, phone, whatsapp")
      .or(`whatsapp.eq.${phone},phone.eq.${phone}`)
      .limit(1)
      .maybeSingle()

    if (byClient) return byClient

    // 2. Match parcial (ultimos 9 digitos — DDD+numero local)
    const tail = phone.slice(-9)
    if (tail.length >= 8) {
      const { data: byTail } = await supa
        .from("clients")
        .select("id, full_name, razao_social, nome_fantasia, email, phone, whatsapp")
        .or(`whatsapp.ilike.%${tail}%,phone.ilike.%${tail}%`)
        .limit(1)
        .maybeSingle()
      if (byTail) return byTail
    }

    // 3. client_contacts (contatos secundarios da empresa)
    const { data: byContact } = await supa
      .from("client_contacts")
      .select("client_id, full_name, email, phone, clients!inner(id, full_name, razao_social, email)")
      .ilike("phone", `%${tail}%`)
      .limit(1)
      .maybeSingle()

    if (byContact?.clients) {
      return {
        id: byContact.clients.id,
        full_name: byContact.full_name || byContact.clients.full_name,
        razao_social: byContact.clients.razao_social,
        email: byContact.email || byContact.clients.email,
      }
    }

    return null
  } catch (err) {
    errorLog(`[lookupContact] elkys lookup falhou: ${err.message}`)
    return null
  }
}

/**
 * Busca assinante Sonnar por telefone (banco do Sonnar).
 * Usa o cliente Supabase ja existente no sender.
 */
async function lookupSonnarSubscriber(phone) {
  const supa = getSonnarClient()
  if (!supa) return null

  try {
    const tail = phone.slice(-11) // DDD + numero
    const { data, error } = await supa
      .from("subscribers")
      .select("id, name, email, phone, plan")
      .or(`phone.eq.${phone},phone.ilike.%${tail}%`)
      .limit(1)
      .maybeSingle()
    if (error) {
      errorLog(`[lookupContact] sonnar lookup falhou: ${error.message}`)
      return null
    }
    return data || null
  } catch (err) {
    errorLog(`[lookupContact] sonnar exception: ${err.message}`)
    return null
  }
}

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
import { ADMIN_PHONES } from "../../config.js"
import { errorLog } from "../../utils/logger.js"

/**
 * Extrai o numero (so digitos) de um JID do WhatsApp.
 * "5511999999999@s.whatsapp.net" -> "5511999999999"
 */
export function jidToPhone(jid) {
  if (!jid) return ""
  return jid.replace(/@.*$/, "").replace(/\D/g, "")
}

/**
 * Normaliza um telefone para JID do WhatsApp.
 * Aceita formatos variados. Retorna null se invalido.
 */
export function phoneToJid(phone) {
  const digits = (phone || "").replace(/\D/g, "")
  if (digits.length < 10) return null
  const full = digits.length <= 11 ? `55${digits}` : digits
  return `${full}@s.whatsapp.net`
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

  if (!phone) return base

  // 1. Admin? (verificacao local — nao precisa de DB)
  if (ADMIN_PHONES.includes(phone)) {
    return { ...base, identifiedAs: "admin", displayName: "Admin" }
  }

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

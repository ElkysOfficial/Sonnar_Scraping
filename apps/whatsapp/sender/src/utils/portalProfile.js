/**
 * Conversao do perfil de busca do PORTAL para os filtros VIP do bot.
 *
 * Usado tanto no pareamento (Fluxo A, edge function link-whatsapp) quanto
 * na leitura periodica de assinantes plus direto de subscriber_profiles.
 */

// work_models do portal -> workMode do bot
const WORK_MODEL_MAP = { remote: "remoto", hybrid: "hibrido", onsite: "presencial" }

// seniority do portal -> termos de senioridade do bot
const SENIORITY_MAP = { junior: "junior", pleno: "pleno", senior: "senior", staff_lead: "senior" }

/**
 * Converte um registro de subscriber_profiles (+ campos do subscriber)
 * no objeto de filtros que o matchingEngine do bot espera.
 *
 * @param {{ stack?: string[], seniority?: string, work_models?: string[], location?: string }} sub
 */
export function buildVipFiltersFromPortal(sub) {
  const stacks = Array.isArray(sub?.stack)
    ? sub.stack.map((s) => String(s).toLowerCase()).filter(Boolean)
    : []
  const workMode = (sub?.work_models || [])
    .map((w) => WORK_MODEL_MAP[w])
    .filter(Boolean)
  const seniority = sub?.seniority && SENIORITY_MAP[sub.seniority]
    ? [SENIORITY_MAP[sub.seniority]]
    : []
  const locations = sub?.location ? [String(sub.location).toLowerCase()] : []

  const areas = Array.isArray(sub?.areas)
    ? sub.areas.map((a) => String(a).toLowerCase().trim()).filter(Boolean)
    : []

  return {
    roles: [],
    areas,
    stacks,
    seniority,
    locations,
    workMode,
    contract: [],
    languages: [],
    // Area e senioridade sao gates — o peso so ranqueia (stacks domina).
    weights: {
      roles: 0,
      stacks: 55,
      seniority: 10,
      locations: 20,
      workMode: 15,
      contract: 0,
      languages: 0
    },
    // O portal nao coleta cargo (roles) -> nao pode ser obrigatorio.
    must: {
      roles: false,
      stacks: true,
      workMode: false,
      contract: false,
      languages: false
    },
    ignoreUnknown: true
  }
}

export default { buildVipFiltersFromPortal }

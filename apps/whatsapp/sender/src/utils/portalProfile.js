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

  return {
    roles: [],
    stacks,
    seniority,
    locations,
    workMode,
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

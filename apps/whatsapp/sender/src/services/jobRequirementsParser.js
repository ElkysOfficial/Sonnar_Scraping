/**
 * Parser deterministico dos requisitos da vaga (Plus #5, v3.8.x).
 *
 * Roda no sender Node, sobre o campo `description` da vaga (ja em PT —
 * lembrando que o scraper traduz inline antes de gravar). Extrai:
 *
 *   - yearsRequired: numero minimo de anos exigido (ex: "5+ anos", "minimo 3 anos")
 *   - seniorityRequired: nivel inferido do TITULO ou do texto da descricao
 *
 * E porta JS direta de apps/scraper/src/utils/job_enrichment.py +
 * supabase/functions/_shared/resumeParser.ts (mesmas heuristicas, mesmo idioma).
 *
 * Usado pelo textBuilder.formatJobMessage quando o assinante tem curriculo
 * ativo (subscriberResume passado).
 */

// ──────────────────────────────────────────────────────────────────────
// Anos exigidos pela vaga
// ──────────────────────────────────────────────────────────────────────

// "5+ anos", "5 ou mais anos", "minimo 5 anos", "pelo menos 5 anos"
const _MIN_YEARS_PATTERNS = [
  /(\d{1,2})\s*\+\s*(?:anos?|years?)/i,
  /(?:minim[oa]|pelo\s+menos|at\s*least)\s+(\d{1,2})\s+(?:anos?|years?)/i,
  /(\d{1,2})\s+(?:ou\s+mais|or\s+more)\s+(?:anos?|years?)/i,
  /(?:experi[eê]ncia\s+(?:de|com)\s+)(\d{1,2})\s*\+?\s*(?:anos?|years?)/i,
  // Fallback bem generico: "X anos de experiencia"
  /(\d{1,2})\s+(?:anos?|years?)\s+(?:de\s+experi[eê]ncia|of\s+experience)/i,
]

/**
 * Extrai o numero MINIMO de anos exigido pela vaga.
 * @param {string} description - texto da vaga (em PT)
 * @returns {number|null}
 */
function extractRequiredYears(description) {
  if (!description) return null
  for (const re of _MIN_YEARS_PATTERNS) {
    const m = description.match(re)
    if (m && m[1]) {
      const n = parseInt(m[1], 10)
      if (n > 0 && n <= 30) return n
    }
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────
// Senioridade exigida (inferida do titulo + descricao)
// ──────────────────────────────────────────────────────────────────────

const _SENIORITY_RANK = {
  junior: 1,
  pleno: 2,
  senior: 3,
  lead: 4,
  principal: 5,
  staff: 5,
}

const _SENIORITY_KEYWORDS = [
  ["staff",     ["staff engineer", "staff developer"]],
  ["principal", ["principal engineer", "principal developer"]],
  ["lead",      ["tech lead", "team lead", "engineering lead", "lider tecnico", " lead "]],
  ["senior",    [" senior", " sênior", " sr.", " sr "]],
  ["pleno",     [" pleno", "mid-level", "mid level"]],
  ["junior",    [" junior", " júnior", " jr.", " jr ", "trainee", "estagiari"]],
]

/**
 * Detecta a senioridade exigida pela vaga. Procura primeiro no titulo,
 * depois na descricao.
 * @param {string} title
 * @param {string} description
 * @returns {string|null}
 */
function extractRequiredSeniority(title, description) {
  const t = ` ${(title || "").toLowerCase()} `
  const d = ` ${(description || "").toLowerCase()} `
  for (const [label, keywords] of _SENIORITY_KEYWORDS) {
    for (const kw of keywords) {
      if (t.includes(kw)) return label
    }
  }
  // Fallback no body — menos confiavel mas captura vagas onde o titulo nao traz nivel.
  for (const [label, keywords] of _SENIORITY_KEYWORDS) {
    for (const kw of keywords) {
      if (d.includes(kw)) return label
    }
  }
  return null
}

/**
 * Compara senioridade do candidato vs exigida pela vaga.
 * @returns {"match"|"under"|"over"|"unknown"}
 */
function compareSeniority(candidateLevel, requiredLevel) {
  if (!candidateLevel || !requiredLevel) return "unknown"
  const c = _SENIORITY_RANK[candidateLevel]
  const r = _SENIORITY_RANK[requiredLevel]
  if (!c || !r) return "unknown"
  if (c === r) return "match"
  return c < r ? "under" : "over"
}

// ──────────────────────────────────────────────────────────────────────
// API principal
// ──────────────────────────────────────────────────────────────────────

/**
 * Extrai requisitos da vaga (anos minimos + senioridade) usando titulo +
 * descricao. Ambos podem ser null.
 *
 * @param {{ title?: string, description?: string }} job
 * @returns {{ yearsRequired: number|null, seniorityRequired: string|null }}
 */
function extractJobRequirements(job) {
  const title = job?.title || ""
  const description = job?.description || ""
  return {
    yearsRequired: extractRequiredYears(description),
    seniorityRequired: extractRequiredSeniority(title, description),
  }
}

export {
  extractRequiredYears,
  extractRequiredSeniority,
  compareSeniority,
  extractJobRequirements,
}

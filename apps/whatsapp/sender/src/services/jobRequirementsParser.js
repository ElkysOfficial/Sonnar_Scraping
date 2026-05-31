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

// ──────────────────────────────────────────────────────────────────────
// Soft skills exigidas pela vaga (v3.10.31)
// ──────────────────────────────────────────────────────────────────────

const _SOFT_SKILL_KEYWORDS = {
  lideranca: ["lideranca", "liderança", "lider", "líder", "leadership", "lead the"],
  comunicacao: ["comunicacao", "comunicação", "communication", "comunicativo"],
  proatividade: ["proatividade", "proativo", "proatividade", "proactive"],
  autonomia: ["autonomia", "autonomo", "autônomo", "self-driven", "self driven"],
  trabalho_equipe: ["trabalho em equipe", "team player", "colaborativ", "team work"],
  resolucao_problemas: ["resolucao de problemas", "resolução de problemas", "problem solving", "problem-solving"],
  organizacao: ["organizacao", "organização", "organizado"],
  adaptabilidade: ["adaptabilidade", "adaptavel", "adaptável", "flexibilidade"],
  criatividade: ["criatividade", "criativo", "innovation", "inovacao", "inovação"],
  mentoria: ["mentoria", "mentor", "mentoring"],
  negociacao: ["negociacao", "negociação", "negotiation"],
  pensamento_critico: ["pensamento critico", "pensamento crítico", "critical thinking"],
}

/**
 * Extrai soft skills mencionadas na descricao da vaga.
 * @param {string} description
 * @returns {string[]} lista de soft skills detectadas (keys do dicionario)
 */
function extractSoftSkills(description) {
  if (!description) return []
  const lower = description.toLowerCase()
  const found = []
  for (const [key, terms] of Object.entries(_SOFT_SKILL_KEYWORDS)) {
    if (terms.some((t) => lower.includes(t))) found.push(key)
  }
  return found
}

const SOFT_SKILL_LABEL = {
  lideranca: "Liderança",
  comunicacao: "Comunicação",
  proatividade: "Proatividade",
  autonomia: "Autonomia",
  trabalho_equipe: "Trabalho em equipe",
  resolucao_problemas: "Resolução de problemas",
  organizacao: "Organização",
  adaptabilidade: "Adaptabilidade",
  criatividade: "Criatividade",
  mentoria: "Mentoria",
  negociacao: "Negociação",
  pensamento_critico: "Pensamento crítico",
}

// ──────────────────────────────────────────────────────────────────────
// Atividades / verbos chave da vaga
// ──────────────────────────────────────────────────────────────────────

const _ACTIVITY_VERBS = [
  "construir", "desenvolver", "implementar", "criar", "projetar",
  "liderar", "gerenciar", "coordenar", "supervisionar",
  "automatizar", "otimizar", "refatorar", "deployar", "deploy",
  "monitorar", "manter", "documentar", "revisar", "code review",
  "testar", "validar", "integrar", "migrar",
  "analisar", "modelar", "arquitetar",
  "mentorar", "treinar", "ensinar",
]

/**
 * Extrai verbos de acao da descricao — usado pra comparar com o que o
 * candidato ja fez (extraido do CV).
 */
function extractKeyActivities(description) {
  if (!description) return []
  const lower = description.toLowerCase()
  const found = []
  for (const verb of _ACTIVITY_VERBS) {
    if (lower.includes(verb)) found.push(verb)
  }
  return Array.from(new Set(found))
}

// ──────────────────────────────────────────────────────────────────────
// Idiomas exigidos
// ──────────────────────────────────────────────────────────────────────

const _LANGUAGE_PATTERNS = [
  { key: "ingles",    re: /\b(ingl[eê]s|english)\b.{0,40}(avancado|avançado|fluente|advanced|fluent|nativo|native|intermediario|intermediário|intermediate)/i },
  { key: "espanhol",  re: /\b(espanhol|spanish)\b.{0,40}(avancado|avançado|fluente|advanced|fluent|nativo|native|intermediario|intermediário)/i },
  { key: "frances",   re: /\b(frances|francês|french)\b/i },
  { key: "alemao",    re: /\b(alemao|alemão|german)\b/i },
  { key: "ingles_basic", re: /\b(ingl[eê]s|english)\b.{0,40}(basico|básico|basic)/i },
  { key: "ingles_any", re: /\b(ingl[eê]s|english)\b/i },
]

/**
 * Extrai idiomas exigidos. Devolve array tipo ['ingles', 'espanhol'].
 */
function extractLanguagesRequired(description) {
  if (!description) return []
  const found = new Set()
  for (const p of _LANGUAGE_PATTERNS) {
    if (p.re.test(description)) {
      // Se ja temos uma variante mais especifica, ignora a generica
      if (p.key === "ingles_any" && (found.has("ingles") || found.has("ingles_basic"))) continue
      found.add(p.key)
    }
  }
  return Array.from(found)
}

const LANGUAGE_LABEL = {
  ingles: "Inglês avançado",
  ingles_basic: "Inglês básico",
  ingles_any: "Inglês",
  espanhol: "Espanhol",
  frances: "Francês",
  alemao: "Alemão",
}

// ──────────────────────────────────────────────────────────────────────
// Setor / indústria
// ──────────────────────────────────────────────────────────────────────

const _INDUSTRY_KEYWORDS = {
  fintech: ["fintech", "banco", "financeira", "pagamento", "cartao", "cartão", "credito", "crédito"],
  healthtech: ["healthtech", "saude", "saúde", "medico", "médico", "hospital", "clinica"],
  edtech: ["edtech", "educacao", "educação", "ensino", "escola", "universidade"],
  ecommerce: ["e-commerce", "ecommerce", "varejo", "marketplace", "compras online", "shopify"],
  saas: ["saas", "software as a service", "b2b", "plataforma"],
  blockchain: ["blockchain", "web3", "crypto", "criptomoeda", "defi", "nft"],
  govtech: ["govtech", "publico", "governo", "prefeitura"],
  agro: ["agro", "agronegocio", "agricultura", "agropecuario"],
  logistica: ["logistica", "logística", "transporte", "frete", "delivery"],
  energia: ["energia", "renovavel", "solar", "eolica"],
}

/**
 * Detecta a indústria/setor da vaga.
 * @returns {string|null} key do dicionario ou null
 */
function extractIndustry(text) {
  if (!text) return null
  const lower = text.toLowerCase()
  const scores = {}
  for (const [key, terms] of Object.entries(_INDUSTRY_KEYWORDS)) {
    const matches = terms.filter((t) => lower.includes(t)).length
    if (matches > 0) scores[key] = matches
  }
  if (Object.keys(scores).length === 0) return null
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
}

const INDUSTRY_LABEL = {
  fintech: "FinTech",
  healthtech: "HealthTech",
  edtech: "EdTech",
  ecommerce: "E-commerce / Varejo",
  saas: "SaaS / B2B",
  blockchain: "Blockchain / Web3",
  govtech: "GovTech",
  agro: "Agro",
  logistica: "Logística",
  energia: "Energia",
}

// ──────────────────────────────────────────────────────────────────────
// Stack categorizada (Backend, Frontend, etc)
// ──────────────────────────────────────────────────────────────────────

const _STACK_CATEGORIES = {
  backend: {
    label: "Backend",
    emoji: "⚙️",
    skills: ["python", "node", "node.js", "java", "go", "golang", "rust", "ruby", "php", "c#", ".net",
             "django", "flask", "fastapi", "spring", "express", "nestjs", "rails", "laravel", "kotlin"],
  },
  frontend: {
    label: "Frontend",
    emoji: "🖥️",
    skills: ["react", "vue", "vue.js", "angular", "svelte", "next.js", "nuxt", "typescript",
             "javascript", "html", "css", "tailwind", "sass", "redux"],
  },
  mobile: {
    label: "Mobile",
    emoji: "📱",
    skills: ["react native", "flutter", "swift", "kotlin", "ios", "android", "xamarin"],
  },
  data: {
    label: "Data & ML",
    emoji: "📊",
    skills: ["sql", "pandas", "numpy", "spark", "airflow", "power bi", "tableau", "snowflake",
             "dbt", "etl", "tensorflow", "pytorch", "machine learning", "ml"],
  },
  cloud: {
    label: "Cloud & DevOps",
    emoji: "☁️",
    skills: ["aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ansible", "jenkins",
             "ci/cd", "linux", "nginx", "devops", "sre"],
  },
  database: {
    label: "Banco de dados",
    emoji: "🗄️",
    skills: ["postgresql", "postgres", "mysql", "mongodb", "redis", "dynamodb", "cassandra",
             "elasticsearch", "oracle", "sqlserver"],
  },
}

/**
 * Categoriza uma lista de skills em grupos (backend, frontend, etc).
 * Skills sem categoria conhecida vao em 'outras'.
 *
 * @param {string[]} skills
 * @returns {Array<{category: string, label: string, emoji: string, items: string[]}>}
 */
function categorizeSkills(skills) {
  if (!Array.isArray(skills) || skills.length === 0) return []
  const result = {}
  const used = new Set()
  const lowered = skills.map((s) => ({ orig: s, lower: s.toLowerCase().trim() }))

  for (const [key, def] of Object.entries(_STACK_CATEGORIES)) {
    const items = lowered
      .filter((s) => !used.has(s.orig) && def.skills.some((k) => s.lower === k || s.lower.includes(k)))
      .map((s) => {
        used.add(s.orig)
        return s.orig
      })
    if (items.length > 0) {
      result[key] = { category: key, label: def.label, emoji: def.emoji, items }
    }
  }

  const outras = lowered.filter((s) => !used.has(s.orig)).map((s) => s.orig)
  if (outras.length > 0) {
    result.outras = { category: "outras", label: "Outras", emoji: "🔧", items: outras }
  }

  return Object.values(result)
}

export {
  extractRequiredYears,
  extractRequiredSeniority,
  compareSeniority,
  extractJobRequirements,
  extractSoftSkills,
  extractKeyActivities,
  extractLanguagesRequired,
  extractIndustry,
  categorizeSkills,
  SOFT_SKILL_LABEL,
  LANGUAGE_LABEL,
  INDUSTRY_LABEL,
}

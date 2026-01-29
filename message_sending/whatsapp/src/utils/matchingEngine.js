const normalizeText = (value) => {
  if (!value) {
    return ""
  }
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

const normalizeTokensFromText = (value) => {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim()
}

const tokenizeText = (value) => {
  const normalized = normalizeTokensFromText(value)
  return normalized ? normalized.split(" ").filter(Boolean) : []
}

const BRAZIL_STATE_ALIASES = {
  ac: ["acre"],
  al: ["alagoas"],
  ap: ["amapa", "amapá"],
  am: ["amazonas"],
  ba: ["bahia"],
  ce: ["ceara", "ceará"],
  df: ["distrito federal"],
  es: ["espirito santo", "espírito santo"],
  go: ["goias", "goiás"],
  ma: ["maranhao", "maranhão"],
  mt: ["mato grosso"],
  ms: ["mato grosso do sul"],
  mg: ["minas gerais"],
  pa: ["para", "pará"],
  pb: ["paraiba", "paraíba"],
  pr: ["parana", "paraná"],
  pe: ["pernambuco"],
  pi: ["piaui", "piauí"],
  rj: ["rio de janeiro"],
  rn: ["rio grande do norte"],
  rs: ["rio grande do sul"],
  ro: ["rondonia", "rondônia"],
  rr: ["roraima"],
  sc: ["santa catarina"],
  sp: ["sao paulo", "são paulo"],
  se: ["sergipe"],
  to: ["tocantins"]
}

const BRAZIL_STATE_REVERSE_ALIASES = Object.entries(BRAZIL_STATE_ALIASES).reduce((acc, [abbr, names]) => {
  for (const name of names) {
    const normalizedName = normalizeTokensFromText(name)
    if (normalizedName) {
      acc[normalizedName] = abbr
    }
  }
  return acc
}, {})

const CITY_ALIASES = {
  bh: "belo horizonte"
}

const COUNTRY_ALIASES = {
  brasil: ["brasil", "brazil", "br"],
  usa: ["usa", "us", "united states", "estados unidos", "eua"],
  worldwide: ["worldwide", "global", "remote worldwide"]
}

const WORK_MODE_SYNONYMS = {
  remote: ["remoto", "remote", "home office", "trabalho remoto", "100% remoto", "anywhere", "full remote", "fully remote", "wfh", "work from home", "a distancia", "remote first", "remote only", "worldwide", "global remote", "remote friendly", "distributed", "remote worldwide"],
  hybrid: ["hibrido", "híbrido", "hybrid", "semi-presencial", "semi presencial", "parcialmente remoto", "flexivel", "flexible", "dias no escritorio", "part remote", "partial remote", "hybrid remote"],
  onsite: ["presencial", "on-site", "onsite", "in-office", "no escritorio", "local", "in loco", "alocado", "office based", "office-based", "in person", "in-person", "at office"]
}

const STACK_RULES = {
  java: {
    synonyms: ["java", "jvm", "spring", "spring boot", "springboot", "hibernate", "j2ee", "jakarta"],
    related: ["kotlin", "scala"],
    negatives: ["javascript", "typescript", "node", "nodejs", "node.js"]
  },
  javascript: {
    synonyms: ["javascript", "js", "node", "nodejs", "node.js", "typescript", "ts"],
    related: ["react", "angular", "vue", "next", "frontend"],
    negatives: ["java", "spring", "jvm", "hibernate"]
  },
  python: {
    synonyms: ["python", "django", "flask", "fastapi"],
    related: ["pandas", "numpy", "pytest", "sqlalchemy"]
  },
  csharp: {
    synonyms: ["c#", "csharp", ".net", "dotnet", "asp.net", "net core", ".net core"],
    related: ["entity framework", "ef core"]
  }
}

const STACK_CANONICAL_MAP = (() => {
  const mapping = new Map()
  const add = (term, canonical) => {
    const normalized = normalizeTokensFromText(term)
    if (normalized) {
      mapping.set(normalized, canonical)
    }
  }
  for (const [canonical, rule] of Object.entries(STACK_RULES)) {
    add(canonical, canonical)
    rule.synonyms?.forEach((term) => add(term, canonical))
    rule.related?.forEach((term) => add(term, canonical))
  }
  return mapping
})()

const getCanonicalStack = (value) => {
  const normalized = normalizeTokensFromText(value)
  return STACK_CANONICAL_MAP.get(normalized) || normalized
}

const hasNormalizedTerm = (normalizedText, tokens, term) => {
  const normalizedTerm = normalizeTokensFromText(term)
  if (!normalizedTerm) return false
  if (normalizedTerm.includes(" ")) {
    return (` ${normalizedText} `).includes(` ${normalizedTerm} `)
  }
  return tokens.has(normalizedTerm)
}

export function matchStacksWithScore(requestedStacks, text, weight = 1) {
  if (!requestedStacks || requestedStacks.length === 0) {
    return { matched: true, isEmpty: true, matchType: "none", score: 0 }
  }

  const normalizedText = normalizeTokensFromText(text)
  const tokens = new Set(tokenizeText(text))

  let best = { matched: false, score: 0, matchType: "none", matchedTerm: null, canonical: null }
  const negativeConflicts = []

  for (const rawTerm of requestedStacks) {
    const canonical = getCanonicalStack(rawTerm)
    const rule = STACK_RULES[canonical] || { synonyms: [canonical], related: [], negatives: [] }

    const exactHit = hasNormalizedTerm(normalizedText, tokens, canonical)
    const synonymHit = !exactHit && rule.synonyms?.some((term) => hasNormalizedTerm(normalizedText, tokens, term))
    const relatedHit = !exactHit && !synonymHit && rule.related?.some((term) => hasNormalizedTerm(normalizedText, tokens, term))

    if (exactHit || synonymHit || relatedHit) {
      const matchType = exactHit ? "exact" : synonymHit ? "synonym" : "related"
      const score = exactHit ? weight : synonymHit ? weight * 0.9 : weight * 0.75
      if (score > best.score) {
        best = {
          matched: true,
          score,
          matchType,
          matchedTerm: rawTerm,
          canonical
        }
      }
      continue
    }

    const negativeHit = rule.negatives?.some((term) => hasNormalizedTerm(normalizedText, tokens, term))
    if (negativeHit) {
      negativeConflicts.push({ requested: rawTerm, canonical, negatives: rule.negatives })
    }
  }

  if (best.matched) {
    return {
      matched: true,
      isEmpty: false,
      matchType: best.matchType,
      score: best.score,
      matchedTerm: best.matchedTerm,
      canonical: best.canonical,
      negativeConflicts
    }
  }

  if (negativeConflicts.length > 0) {
    return {
      matched: false,
      isEmpty: false,
      matchType: "conflict",
      score: 0,
      negativeConflicts,
      failReason: "stack_conflict"
    }
  }

  return { matched: false, isEmpty: false, matchType: "none", score: 0 }
}

export function normalizeLocationInput(value) {
  if (!value) {
    return { raw: "", city: "", state: "", country: "", segments: [], isCountryOnly: false }
  }

  const raw = value.toString()
  const segments = raw
    .split(/\s*[\/|,]\s*|\s+-\s+/)
    .map((segment) => normalizeTokensFromText(segment))
    .filter(Boolean)

  let city = ""
  let state = ""
  let country = ""

  for (const segment of segments) {
    if (COUNTRY_ALIASES.brasil.includes(segment)) {
      country = "brasil"
      continue
    }
    if (segment in BRAZIL_STATE_ALIASES) {
      state = segment
      continue
    }
    if (segment in BRAZIL_STATE_REVERSE_ALIASES) {
      state = BRAZIL_STATE_REVERSE_ALIASES[segment]
      continue
    }
    if (segment in CITY_ALIASES) {
      city = CITY_ALIASES[segment]
      continue
    }
    if (!city) {
      city = segment
    }
  }

  const isCountryOnly = !city && !state && country === "brasil"

  return {
    raw,
    city,
    state,
    country,
    segments,
    isCountryOnly
  }
}

export function detectWorkMode(workType, text) {
  const normalized = normalizeTokensFromText(`${workType || ""} ${text || ""}`)
  const includesAny = (terms) => {
    return (terms || []).some((term) => {
      const normalizedTerm = normalizeTokensFromText(term)
      return normalizedTerm && normalized.includes(normalizedTerm)
    })
  }

  if (includesAny(WORK_MODE_SYNONYMS.hybrid)) return "hybrid"
  if (includesAny(WORK_MODE_SYNONYMS.remote)) return "remote"
  if (includesAny(WORK_MODE_SYNONYMS.onsite)) return "onsite"
  return "unknown"
}

export function matchLocationForMode({
  requestedLocations,
  jobLocation,
  jobWorkMode,
  userAcceptsRemote,
  allowCountryOnlyForRemote = true,
  requireLocationForOnsite = true
}) {
  const normalizedJobLocation = normalizeLocationInput(jobLocation)
  const normalizedRequested = (requestedLocations || []).map(normalizeLocationInput)

  if (jobWorkMode === "remote" && userAcceptsRemote) {
    return {
      matched: true,
      reason: "remote_bypass",
      normalizedJobLocation,
      normalizedRequested
    }
  }

  const hasSpecificRequested = normalizedRequested.some((loc) => loc.city || loc.state)

  if (jobWorkMode === "remote" && !userAcceptsRemote) {
    return {
      matched: false,
      reason: "remote_not_accepted",
      normalizedJobLocation,
      normalizedRequested
    }
  }

  if (!normalizedJobLocation.city && !normalizedJobLocation.state) {
    return {
      matched: false,
      reason: requireLocationForOnsite ? "location_missing_for_onsite" : "location_missing",
      normalizedJobLocation,
      normalizedRequested
    }
  }

  if (!hasSpecificRequested && !allowCountryOnlyForRemote) {
    return {
      matched: false,
      reason: "location_country_only_for_onsite",
      normalizedJobLocation,
      normalizedRequested
    }
  }

  const matched = normalizedRequested.some((loc) => {
    const stateMatch = loc.state && normalizedJobLocation.state && loc.state === normalizedJobLocation.state
    const cityMatch = loc.city && normalizedJobLocation.city && loc.city === normalizedJobLocation.city
    return stateMatch || cityMatch
  })

  return {
    matched,
    reason: matched ? "location_match" : "locations_required_not_found",
    normalizedJobLocation,
    normalizedRequested
  }
}

export function normalizeStackInput(value) {
  const normalized = normalizeTokensFromText(value)
  if (!normalized) return ""
  if (normalized === "js") return "javascript"
  if (normalized === "java script") return "javascript"
  if (normalized === "ts") return "typescript"
  if (normalized === "nodejs") return "node"
  if (normalized === "node js") return "node"
  if (normalized === "c#") return "csharp"
  if (normalized === "c sharp") return "csharp"
  if (normalized === ".net") return "dotnet"
  return normalized
}

export function normalizeWorkModeInput(value) {
  const normalized = normalizeTokensFromText(value)
  if (!normalized) return ""
  if (normalized === "hibrido" || normalized === "hybrid") return "hibrido"
  if (normalized === "remoto" || normalized === "remote") return "remoto"
  if (normalized === "presencial" || normalized === "onsite" || normalized === "on site") return "presencial"
  return normalized
}

export function normalizeSeniorityInput(value) {
  const normalized = normalizeTokensFromText(value)
  if (!normalized) return ""
  if (normalized === "estagiario" || normalized === "estagiarioa") return "estagio"
  if (normalized === "jr" || normalized === "junior") return "junior"
  if (normalized === "sr" || normalized === "senior") return "senior"
  return normalized
}

export {
  normalizeText,
  normalizeTokensFromText,
  tokenizeText,
  BRAZIL_STATE_ALIASES,
  BRAZIL_STATE_REVERSE_ALIASES,
  WORK_MODE_SYNONYMS,
  STACK_RULES
}

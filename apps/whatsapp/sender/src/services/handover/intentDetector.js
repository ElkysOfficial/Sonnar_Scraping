/**
 * intentDetector — NLU deterministico (zero LLM, zero custo).
 *
 * Reconhece intent do cliente a partir de texto livre. Estrutura em
 * 3 camadas, em ordem de prioridade:
 *
 *   1. Numero exato (1, 2, 3, ..., 0)        -> rota direta
 *   2. Keywords + frases pontuadas             -> scoring com margem
 *   3. Comandos universais (menu, voltar, ...) -> reset/saudacao
 *
 * Sem match → null. Quando ambiguo (empate dentro de 2 pontos), tambem
 * devolve null pra que o caller mostre o menu de novo.
 */

// ──────────────────────────────────────────────────────────────────────
// Normalizacao
// ──────────────────────────────────────────────────────────────────────

/**
 * Lowercase + remove acentos + tira pontuacao + colapsa espacos.
 */
export function normalize(s) {
  if (!s) return ""
  return s
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Detecta um numero "puro" no inicio da mensagem. Aceita "1", "1.",
 * "1)", "01" mas NAO casa "1234" ou "1 segundo" (numero seguido de
 * texto que muda o sentido).
 */
export function detectNumberChoice(normalized, validNumbers = ["0", "1", "2", "3", "4", "5", "6"]) {
  if (!normalized) return null
  const m = normalized.match(/^0*(\d{1,2})\b/)
  if (!m) return null
  const num = m[1]
  if (!validNumbers.includes(num)) return null
  // Se tem mais texto depois do numero, so aceita se for muito curto
  // (ex: "1 por favor" -> aceita; "1 segundo" -> nao deveria virar opcao)
  const rest = normalized.slice(m[0].length).trim()
  if (!rest) return num
  // Curto E sem keyword de OUTRA opcao? aceita.
  if (rest.length <= 20 && !rest.match(/segundo|momento|minuto|hora/)) return num
  return null
}

// ──────────────────────────────────────────────────────────────────────
// Dicionario de intents (menu raiz)
// ──────────────────────────────────────────────────────────────────────

const INTENTS = {
  orcamento: {
    strong: ["orcamento", "cotacao", "preco", "preço"],
    weak:   ["proposta", "valor", "investimento", "quanto custa", "fazer projeto"],
    phrases: ["quero um orcamento", "fazer um orcamento", "preciso de uma proposta",
              "quanto custa", "qual o valor", "qual o preco", "fazer um projeto"],
  },
  reuniao: {
    strong: ["reuniao", "meeting"],
    weak:   ["agendar", "marcar", "conversar", "agenda", "horario", "videochamada", "call"],
    phrases: ["agendar reuniao", "marcar reuniao", "marcar uma conversa",
              "quero conversar", "agendar conversa", "agendar uma call"],
  },
  pagamento: {
    strong: ["boleto", "pix", "pagamento"],
    weak:   ["pagar", "fatura", "cobranca", "segunda via", "2 via", "nota fiscal",
             "comprovante", "transferencia"],
    phrases: ["preciso pagar", "quero pagar", "como faco o pagamento",
              "enviar boleto", "qual o pix", "dados de pagamento", "segunda via"],
  },
  parceria: {
    strong: ["parceria", "parceiro", "white label"],
    weak:   ["indicar", "indicacao", "afiliado", "comissao", "socio", "consultor"],
    phrases: ["ser parceiro", "programa de parceiro", "indicar projetos",
              "ser socio", "trabalhar com voces"],
  },
  sonnar: {
    strong: ["sonnar"],
    weak:   ["vaga", "vagas", "emprego", "trabalho", "developer", "programador",
             "desenvolvedor", "tecnologia", "ti"],
    phrases: ["vaga de tecnologia", "vaga de ti", "procurando vaga",
              "quero vagas", "vagas de programador"],
  },
  atendente: {
    strong: ["atendente", "humano"],
    weak:   ["duvida", "ajuda", "atendimento", "pessoa", "suporte"],
    phrases: ["falar com alguem", "falar com humano", "preciso de ajuda",
              "tem alguem ai", "pode me ajudar", "preciso falar com",
              "quero falar com"],
  },
}

// ──────────────────────────────────────────────────────────────────────
// Sim / Nao binario
// ──────────────────────────────────────────────────────────────────────

const YES_WORDS = new Set([
  "sim", "s", "claro", "isso", "ok", "okay", "beleza", "pode", "vai",
  "quero", "uhum", "yes", "y", "positivo", "afirmativo", "concordo",
])
const NO_WORDS = new Set([
  "nao", "n", "no", "negativo", "depois", "agora nao", "outra hora",
  "deixa", "esquece", "nope", "nem", "nada disso",
])

/**
 * Retorna "yes" | "no" | null
 */
export function detectYesNo(text) {
  const norm = normalize(text)
  if (!norm) return null

  // Match exato no inicio
  for (const w of YES_WORDS) {
    if (norm === w || norm.startsWith(w + " ")) return "yes"
  }
  for (const w of NO_WORDS) {
    if (norm === w || norm.startsWith(w + " ")) return "no"
  }

  // Substring (frases tipo "sim por favor")
  if (norm.split(" ").some((t) => YES_WORDS.has(t))) return "yes"
  if (norm.split(" ").some((t) => NO_WORDS.has(t))) return "no"

  return null
}

// ──────────────────────────────────────────────────────────────────────
// Saudacoes
// ──────────────────────────────────────────────────────────────────────

const GREETING_PATTERNS = [
  /^oi+$/, /^ola+$/, /^bom dia/, /^boa tarde/, /^boa noite/,
  /^e ai/, /^eai/, /^opa/, /^salve/, /^hey/, /^hi$/, /^hello/,
  /^tudo bem/, /^td bem/, /^tudo certo/, /^como vai/,
]

export function isGreeting(text) {
  const norm = normalize(text)
  if (!norm) return false
  return GREETING_PATTERNS.some((re) => re.test(norm))
}

// ──────────────────────────────────────────────────────────────────────
// Comandos universais (voltar/menu/sair)
// ──────────────────────────────────────────────────────────────────────

const BACK_WORDS = new Set([
  "menu", "voltar", "inicio", "início", "sair", "principal", "comeco",
  "começo", "home", "0",
])

export function isBackCommand(text) {
  const norm = normalize(text)
  return BACK_WORDS.has(norm) || norm === "0"
}

// ──────────────────────────────────────────────────────────────────────
// Detector principal
// ──────────────────────────────────────────────────────────────────────

/**
 * Numerica + keywords. Devolve nome do intent OU null se ambiguo/sem
 * match.
 *
 * @param {string} text
 * @param {object} opts
 * @param {string[]} [opts.validNumbers=["0".."6"]]
 * @returns {string | null}
 */
export function detectIntent(text, opts = {}) {
  const validNumbers = opts.validNumbers || ["0", "1", "2", "3", "4", "5", "6"]
  const norm = normalize(text)
  if (!norm) return null

  // 1. Numero exato
  const numberMatch = detectNumberChoice(norm, validNumbers)
  if (numberMatch !== null) {
    return numberByPosition(numberMatch)
  }

  // 2. Scoring por keywords + frases
  const scores = {}
  for (const [intent, def] of Object.entries(INTENTS)) {
    let score = 0
    // Strong keywords (+3 cada match)
    for (const kw of def.strong || []) {
      if (containsWord(norm, kw)) score += 3
    }
    // Weak keywords (+2 cada)
    for (const kw of def.weak || []) {
      if (containsWord(norm, kw)) score += 2
    }
    // Frases (+3 cada match)
    for (const ph of def.phrases || []) {
      if (norm.includes(ph)) score += 3
    }
    if (score > 0) scores[intent] = score
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return null

  const [winnerIntent, winnerScore] = ranked[0]
  const secondScore = ranked[1]?.[1] ?? 0

  // Vencedor precisa ter pelo menos 3 pontos e margem >= 2 sobre o 2o
  if (winnerScore < 3) return null
  if (winnerScore - secondScore < 2) return null

  return winnerIntent
}

function numberByPosition(numStr) {
  switch (numStr) {
    case "0": return "voltar"
    case "1": return "orcamento"
    case "2": return "reuniao"
    case "3": return "pagamento"
    case "4": return "parceria"
    case "5": return "sonnar"
    case "6": return "atendente"
    default:  return null
  }
}

/**
 * Match de palavra inteira (word boundaries) — evita "valor" casar
 * em "avaliar".
 */
function containsWord(haystack, needle) {
  if (!needle) return false
  // Escape regex chars
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i")
  return re.test(haystack)
}

// ──────────────────────────────────────────────────────────────────────
// Detector pro submenu pagamento (PIX vs Boleto)
// ──────────────────────────────────────────────────────────────────────

export function detectPaymentChoice(text) {
  const norm = normalize(text)
  const num = detectNumberChoice(norm, ["1", "2"])
  if (num === "1") return "pix"
  if (num === "2") return "boleto"
  if (containsWord(norm, "pix") || norm.includes("pix")) return "pix"
  if (containsWord(norm, "boleto")) return "boleto"
  return null
}

// ──────────────────────────────────────────────────────────────────────
// Detector pro closing_check ("conseguiu resolver ou quer atendente?")
// ──────────────────────────────────────────────────────────────────────

/**
 * Devolve "atendente" | "ok" | null
 *   "atendente" = cliente quer falar com humano agora
 *   "ok"        = cliente quer aguardar (ou disse que tah bom)
 */
export function detectClosingChoice(text) {
  const norm = normalize(text)
  if (!norm) return null

  // Numero direto
  const num = detectNumberChoice(norm, ["1", "2"])
  if (num === "1") return "atendente"
  if (num === "2") return "ok"

  // Intent atendente
  const intent = detectIntent(text)
  if (intent === "atendente") return "atendente"

  // Yes/no — "sim" = quer atendente; "nao" = ok
  const yn = detectYesNo(text)
  if (yn === "yes") return "atendente"
  if (yn === "no") return "ok"

  return null
}

// ──────────────────────────────────────────────────────────────────────
// Detector de rating (awaiting_rating)
// ──────────────────────────────────────────────────────────────────────

const RATING_WORDS = {
  1: ["um", "pessimo", "horrivel", "ruim demais"],
  2: ["dois", "ruim", "fraco"],
  3: ["tres", "razoavel", "ok"],
  4: ["quatro", "bom", "legal"],
  5: ["cinco", "excelente", "otimo", "perfeito", "show", "top"],
}

export function detectRating(text) {
  const norm = normalize(text)
  if (!norm) return null

  // Numero direto 1-5
  const m = norm.match(/^([1-5])\b/)
  if (m) return parseInt(m[1], 10)

  // Palavras
  for (const [num, words] of Object.entries(RATING_WORDS)) {
    if (words.some((w) => containsWord(norm, w))) return parseInt(num, 10)
  }

  if (norm === "pular" || norm === "skip" || norm === "passar") return "skip"

  return null
}

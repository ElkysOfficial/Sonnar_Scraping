/**
 * Porto JS do supabase/functions/_shared/resumeParser.ts (Deno).
 * Logica IDENTICA — usado apenas pra rodar a suite e2e localmente em Node.
 *
 * Quando o .ts evoluir, sincronizar este arquivo.
 */

import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const skillsRaw = await readFile(join(__dirname, "fixtures", "skills.txt"), "utf8")
export const SKILLS_VOCABULARY = skillsRaw
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean)

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const _SKILL_REGEXES = SKILLS_VOCABULARY
  .filter((s) => s.length >= 2)
  .map((skill) => ({
    skill,
    re: new RegExp(`(?<![A-Za-z0-9])${escapeRegex(skill)}(?![A-Za-z0-9])`, "i"),
  }))

export function extractSkills(text) {
  if (!text) return []
  const found = []
  const seen = new Set()
  for (const { skill, re } of _SKILL_REGEXES) {
    if (seen.has(skill)) continue
    if (re.test(text)) {
      found.push(skill)
      seen.add(skill)
    }
  }
  return found
}

const _DATE_RANGE_RE = /(\d{4})\s*[-–—a]+\s*(\d{4}|atual|present|presente|hoje|today)/gi
const _N_YEARS_RE = /(?:\b|^)(\d{1,2})\s+(?:anos?|years?|yr)\b/i

export function extractYearsTotal(text) {
  if (!text) return null
  const intervals = []
  const nowYear = new Date().getFullYear()
  for (const m of text.matchAll(_DATE_RANGE_RE)) {
    const startStr = m[1]
    const endStr = (m[2] || "").toLowerCase()
    const start = parseInt(startStr ?? "0", 10)
    if (start < 1980 || start > nowYear) continue
    const isOpen = ["atual", "present", "presente", "hoje", "today"].includes(endStr)
    const end = isOpen ? nowYear : parseInt(endStr, 10)
    if (end < start || end > nowYear) continue
    intervals.push([start, end])
  }
  if (intervals.length > 0) {
    intervals.sort((a, b) => a[0] - b[0])
    let total = 0
    let curStart = intervals[0][0]
    let curEnd = intervals[0][1]
    for (let i = 1; i < intervals.length; i++) {
      const [s, e] = intervals[i]
      if (s <= curEnd) curEnd = Math.max(curEnd, e)
      else { total += curEnd - curStart; curStart = s; curEnd = e }
    }
    total += curEnd - curStart
    return Math.max(0, total)
  }
  const m = text.match(_N_YEARS_RE)
  if (m && m[1]) {
    const n = parseInt(m[1], 10)
    if (n >= 0 && n <= 50) return n
  }
  return null
}

const _SENIORITY_KEYWORDS = [
  ["staff", ["staff engineer", "staff developer"]],
  ["principal", ["principal engineer", "principal developer"]],
  ["lead", ["tech lead", "team lead", "engineering lead", "lider tecnico"]],
  ["senior", ["senior", "senor", "sênior", "sr.", "sr "]],
  ["pleno", ["pleno", "mid-level", "mid level"]],
  ["junior", ["junior", "jr.", "jr ", "junior", "júnior", "trainee", "estagiario", "estagiário", "intern"]],
]

export function extractSeniority(text) {
  if (!text) return null
  const lower = text.toLowerCase()
  for (const [label, keywords] of _SENIORITY_KEYWORDS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return label
    }
  }
  return null
}

const _LANGUAGE_PATTERNS = [
  ["portugues", /\b(portugu[eê]s|portuguese|pt[-_]br)\b/i],
  ["ingles", /\b(ingl[eê]s|english|en[-_]us|fluent\s+english|advanced\s+english)\b/i],
  ["espanhol", /\b(espanhol|spanish|castellano|español)\b/i],
  ["frances", /\b(franc[eê]s|french|francais|français)\b/i],
  ["alemao", /\b(alem[aã]o|german|deutsch)\b/i],
  ["italiano", /\b(italiano|italian)\b/i],
  ["japones", /\b(japon[eê]s|japanese|nihongo)\b/i],
  ["mandarim", /\b(mandarim|mandarin|chin[eê]s|chinese)\b/i],
]

export function extractLanguages(text) {
  if (!text) return []
  const found = []
  for (const [lang, re] of _LANGUAGE_PATTERNS) {
    if (re.test(text)) found.push(lang)
  }
  return found
}

export function parseResumeText(text) {
  const clean = (text || "").trim()
  return {
    skills: extractSkills(clean),
    yearsTotal: extractYearsTotal(clean),
    seniority: extractSeniority(clean),
    languages: extractLanguages(clean),
    textLength: clean.length,
  }
}

// Parser deterministico de curriculo (Caminho A: zero LLM).
//
// Entrada: texto bruto extraido de PDF/DOCX.
// Saida: { skills, yearsTotal, seniority, languages }.
//
// Heuristicas:
//   - Skills: regex contra SKILLS_VOCABULARY com lookarounds que aceitam
//     chars nao-alfanumericos como fronteira (cobre "Node.js", "C#", ".NET").
//   - Anos totais: soma intervalos "AAAA - AAAA" detectados na secao de
//     experiencia. Fallback: regex "X anos" / "X years".
//   - Seniority: ranking por palavra-chave no titulo do role mais recente
//     (lead/staff > senior > pleno > junior).
//   - Idiomas: regex contra dicionario fixo PT/EN/ES + variantes.

import { SKILLS_VOCABULARY } from "./skills_vocabulary.ts";

export interface ResumeParseResult {
  skills: string[];
  yearsTotal: number | null;
  seniority: string | null;
  languages: string[];
  textLength: number;
}

// ──────────────────────────────────────────────────────────────────────
// Skills
// ──────────────────────────────────────────────────────────────────────

const _SKILL_REGEXES: Array<{ skill: string; re: RegExp }> = SKILLS_VOCABULARY
  .filter((s) => s.length >= 2)
  .map((skill) => ({
    skill,
    re: new RegExp(
      `(?<![A-Za-z0-9])${escapeRegex(skill)}(?![A-Za-z0-9])`,
      "i"
    ),
  }));

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSkills(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const { skill, re } of _SKILL_REGEXES) {
    if (seen.has(skill)) continue;
    if (re.test(text)) {
      found.push(skill);
      seen.add(skill);
    }
  }
  return found;
}

// ──────────────────────────────────────────────────────────────────────
// Anos totais de experiencia
// ──────────────────────────────────────────────────────────────────────

const _DATE_RANGE_RE =
  /(\d{4})\s*[-–—a]+\s*(\d{4}|atual|present|presente|hoje|today)/gi;

const _N_YEARS_RE =
  /(?:\b|^)(\d{1,2})\s+(?:anos?|years?|yr)\b/i;

export function extractYearsTotal(text: string): number | null {
  if (!text) return null;
  // Estrategia 1: soma intervalos "AAAA - AAAA"
  const intervals: Array<[number, number]> = [];
  const nowYear = new Date().getFullYear();
  for (const m of text.matchAll(_DATE_RANGE_RE)) {
    const startStr = m[1];
    const endStr = (m[2] || "").toLowerCase();
    const start = parseInt(startStr ?? "0", 10);
    if (start < 1980 || start > nowYear) continue;
    const isOpenEnd =
      endStr === "atual" || endStr === "present" || endStr === "presente" ||
      endStr === "hoje" || endStr === "today";
    const end = isOpenEnd ? nowYear : parseInt(endStr, 10);
    if (end < start || end > nowYear) continue;
    intervals.push([start, end]);
  }
  if (intervals.length > 0) {
    // Une intervalos sobrepostos pra nao contar 2x o mesmo periodo.
    intervals.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let curStart = intervals[0]![0];
    let curEnd = intervals[0]![1];
    for (let i = 1; i < intervals.length; i++) {
      const [s, e] = intervals[i]!;
      if (s <= curEnd) {
        curEnd = Math.max(curEnd, e);
      } else {
        total += curEnd - curStart;
        curStart = s;
        curEnd = e;
      }
    }
    total += curEnd - curStart;
    return Math.max(0, total);
  }
  // Estrategia 2: fallback "X anos"
  const m = text.match(_N_YEARS_RE);
  if (m && m[1]) {
    const n = parseInt(m[1], 10);
    if (n >= 0 && n <= 50) return n;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Seniority
// ──────────────────────────────────────────────────────────────────────

const _SENIORITY_KEYWORDS: Array<[string, string[]]> = [
  ["staff", ["staff engineer", "staff developer"]],
  ["principal", ["principal engineer", "principal developer"]],
  ["lead", ["tech lead", "team lead", "engineering lead", "lider tecnico"]],
  ["senior", ["senior", "senor", "sênior", "sr.", "sr "]],
  ["pleno", ["pleno", "mid-level", "mid level"]],
  ["junior", ["junior", "jr.", "jr ", "junior", "júnior", "trainee", "estagiario", "estagiário", "intern"]],
];

export function extractSeniority(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  // Primeira ocorrencia ganha (mais recente no CV costuma estar no topo)
  for (const [label, keywords] of _SENIORITY_KEYWORDS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return label;
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Idiomas
// ──────────────────────────────────────────────────────────────────────

const _LANGUAGE_PATTERNS: Array<[string, RegExp]> = [
  ["portugues", /\b(portugu[eê]s|portuguese|pt[-_]br)\b/i],
  ["ingles", /\b(ingl[eê]s|english|en[-_]us|fluent\s+english|advanced\s+english)\b/i],
  ["espanhol", /\b(espanhol|spanish|castellano)\b/i],
  ["frances", /\b(franc[eê]s|french|francais)\b/i],
  ["alemao", /\b(alem[aã]o|german|deutsch)\b/i],
  ["italiano", /\b(italiano|italian)\b/i],
  ["japones", /\b(japon[eê]s|japanese|nihongo)\b/i],
  ["mandarim", /\b(mandarim|mandarin|chin[eê]s|chinese)\b/i],
];

export function extractLanguages(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const [lang, re] of _LANGUAGE_PATTERNS) {
    if (re.test(text)) found.push(lang);
  }
  return found;
}

// ──────────────────────────────────────────────────────────────────────
// API principal
// ──────────────────────────────────────────────────────────────────────

export function parseResumeText(text: string): ResumeParseResult {
  const clean = (text || "").trim();
  return {
    skills: extractSkills(clean),
    yearsTotal: extractYearsTotal(clean),
    seniority: extractSeniority(clean),
    languages: extractLanguages(clean),
    textLength: clean.length,
  };
}

export const PARSER_VERSION = "v1.0";

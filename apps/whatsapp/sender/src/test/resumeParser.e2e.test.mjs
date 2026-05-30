/**
 * Suite e2e do resume parser — 25+ curriculos sinteticos cobrindo:
 *   - varios perfis: backend/frontend/devops/mobile/data/qa/blockchain
 *   - varios niveis: trainee/junior/pleno/senior/lead/staff
 *   - formatos de data: AAAA-AAAA, "presente"/"atual", "X anos", sem datas
 *   - idiomas mistos PT/EN/ES/FR/DE
 *   - edge cases: vazio, falsos positivos, paragrafos longos
 *
 * Foco: validar que o parser deterministico (zero LLM) produz resultados
 * confiaveis no caminho que UM CLIENTE REAL faria upload.
 *
 * Roda: node src/test/resumeParser.e2e.test.mjs
 */

import { parseResumeText } from "./resumeParser.local.mjs"
import { RESUME_CASES } from "./fixtures/sample-resumes.js"

let pass = 0
let fail = 0
let warn = 0
const failures = []

function arrayContainsAll(actual, expected) {
  if (!expected) return true
  const aSet = new Set(actual.map((s) => s.toLowerCase()))
  return expected.every((e) => aSet.has(e.toLowerCase()))
}

function arrayMissing(actual, expected) {
  if (!expected) return []
  const aSet = new Set(actual.map((s) => s.toLowerCase()))
  return expected.filter((e) => !aSet.has(e.toLowerCase()))
}

console.log("═".repeat(72))
console.log(`SUITE E2E PARSER CV — ${RESUME_CASES.length} cenarios`)
console.log("═".repeat(72))

for (const c of RESUME_CASES) {
  const result = parseResumeText(c.text)
  const errors = []

  // 1) Skills
  if (c.expectSkills !== undefined) {
    if (!arrayContainsAll(result.skills, c.expectSkills)) {
      const missing = arrayMissing(result.skills, c.expectSkills)
      errors.push(`skills missing: ${missing.join(", ")}`)
    }
  }

  // 2) Anos
  if (c.expectYearsMin !== undefined && c.expectYearsMax !== undefined) {
    const y = result.yearsTotal
    if (c.expectYearsMin === null && c.expectYearsMax === null) {
      if (y !== null) errors.push(`years should be null, got ${y}`)
    } else if (y === null) {
      errors.push(`years null, expected ${c.expectYearsMin}..${c.expectYearsMax}`)
    } else if (y < c.expectYearsMin || y > c.expectYearsMax) {
      errors.push(`years ${y} out of range ${c.expectYearsMin}..${c.expectYearsMax}`)
    }
  }

  // 3) Seniority
  if (c.expectSeniority !== undefined) {
    if (result.seniority !== c.expectSeniority) {
      errors.push(`seniority ${result.seniority} != expected ${c.expectSeniority}`)
    }
  }

  // 4) Languages
  if (c.expectLanguages !== undefined) {
    if (!arrayContainsAll(result.languages, c.expectLanguages)) {
      const missing = arrayMissing(result.languages, c.expectLanguages)
      errors.push(`languages missing: ${missing.join(", ")}`)
    }
  }

  if (errors.length === 0) {
    pass++
    console.log(`✓ ${c.name}`)
    console.log(`  → ${result.skills.length} skills, ${result.yearsTotal ?? "?"} anos, ${result.seniority ?? "?"}, idiomas: [${result.languages.join(", ")}]`)
  } else {
    fail++
    failures.push({ name: c.name, errors, result })
    console.log(`✗ ${c.name}`)
    for (const e of errors) console.log(`    ${e}`)
    console.log(`    Recebido: ${result.skills.length} skills, ${result.yearsTotal ?? "?"} anos, ${result.seniority ?? "?"}, idiomas: [${result.languages.join(", ")}]`)
  }
}

console.log("─".repeat(72))
console.log(`RESUMO: ${pass} OK · ${fail} fail · de ${RESUME_CASES.length} cenarios`)
console.log("═".repeat(72))

process.exit(fail > 0 ? 1 : 0)

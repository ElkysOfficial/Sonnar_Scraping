/**
 * Teste do parser com curriculos REAIS do projeto (5 CVs).
 *
 * Mostra: skills extraidas, anos, senioridade, idiomas por CV +
 * simulacao de match contra vagas tipicas backend, frontend, e fullstack.
 */

import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { parseResumeText } from "./resumeParser.local.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const path = join(__dirname, "fixtures", "real-resumes.json")
const resumes = JSON.parse(await readFile(path, "utf8"))

const count = Object.keys(resumes).length
console.log("═".repeat(76))
console.log(`TESTE PARSER COM ${count} CURRICULOS REAIS`)
console.log("═".repeat(76))

const allResults = {}

for (const [filename, text] of Object.entries(resumes)) {
  const result = parseResumeText(text)
  allResults[filename] = result

  const shortname = filename.replace(/\.pdf$/i, "").replace(/^CV - /, "").replace(/^CURRICULO - /, "")
  console.log(`\n📄 ${shortname}`)
  console.log("─".repeat(76))
  console.log(`  Tamanho: ${result.textLength} chars`)
  console.log(`  Anos detectados: ${result.yearsTotal ?? "N/A"}`)
  console.log(`  Senioridade: ${result.seniority ?? "N/A"}`)
  console.log(`  Idiomas: [${result.languages.join(", ") || "—"}]`)
  console.log(`  Skills (${result.skills.length}):`)
  // Quebra em linhas de ~80 chars pra leitura
  const chunks = []
  let cur = "    "
  for (const s of result.skills) {
    if ((cur + s).length > 80) { chunks.push(cur); cur = "    " }
    cur += s + ", "
  }
  if (cur.trim()) chunks.push(cur.replace(/, $/, ""))
  for (const c of chunks) console.log(c)
}

// Simulacao de match: criar vagas tipicas e ver como cada CV match
console.log("\n" + "═".repeat(76))
console.log("SIMULACAO DE MATCH — vagas tipicas vs cada CV")
console.log("═".repeat(76))

const sampleJobs = [
  { title: "Senior Backend Python", skills: ["Python", "Django", "PostgreSQL", "Docker", "AWS", "REST"] },
  { title: "Frontend Pleno React", skills: ["React", "TypeScript", "JavaScript", "CSS", "Redux", "Tailwind"] },
  { title: "Full Stack Senior", skills: ["Node.js", "React", "TypeScript", "PostgreSQL", "Docker"] },
  { title: "DevOps Lead", skills: ["AWS", "Kubernetes", "Docker", "Terraform", "Linux"] },
  { title: "Backend Java Senior", skills: ["Java", "Spring Boot", "PostgreSQL", "Docker", "Microservicos"] },
]

const norm = (s) => String(s).toLowerCase().trim()

for (const [filename, result] of Object.entries(allResults)) {
  const shortname = filename.replace(/\.pdf$/i, "").replace(/^CV - /, "").replace(/^CURRICULO - /, "")
  console.log(`\n👤 ${shortname}`)
  const cvSet = new Set(result.skills.map(norm))

  for (const job of sampleJobs) {
    const matched = job.skills.filter((s) => cvSet.has(norm(s)))
    const missing = job.skills.filter((s) => !cvSet.has(norm(s)))
    const pct = Math.round((matched.length / job.skills.length) * 100)
    const marker = pct >= 80 ? "🟢" : pct >= 50 ? "🟡" : "🔴"
    console.log(`  ${marker} ${job.title}: ${matched.length}/${job.skills.length} (${pct}%)`)
    console.log(`     ✓ ${matched.join(", ") || "—"}`)
    if (missing.length) console.log(`     ✗ ${missing.join(", ")}`)
  }
}

// Sanity checks
console.log("\n" + "═".repeat(76))
console.log("SANITY CHECKS")
console.log("═".repeat(76))

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`✓ ${name}`) }
  else { fail++; console.log(`✗ ${name}`) }
}

const totalSkills = Object.values(allResults).reduce((sum, r) => sum + r.skills.length, 0)
check(`Todos os ${count} CVs foram parseados`, Object.keys(allResults).length === count)
check(`Pelo menos 3 skills detectadas em cada CV`, Object.values(allResults).every((r) => r.skills.length >= 3))
check(`Pelo menos 1 idioma em todos os CVs`, Object.values(allResults).every((r) => r.languages.length >= 1))
check(`Total > 80 skills detectadas no agregado`, totalSkills >= 80)
check(`Pelo menos 1 CV detectou senioridade`, Object.values(allResults).some((r) => r.seniority !== null))
check(`Pelo menos 1 CV com years > 0`, Object.values(allResults).some((r) => r.yearsTotal > 0))

console.log("\n" + "─".repeat(76))
console.log(`SANITY: ${pass} OK · ${fail} fail · de ${pass + fail} checks`)
console.log("═".repeat(76))

process.exit(fail > 0 ? 1 : 0)

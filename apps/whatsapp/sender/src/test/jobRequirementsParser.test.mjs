/**
 * Sanity test do jobRequirementsParser (Plus #5).
 * Executa: node src/test/jobRequirementsParser.test.mjs
 */

import { extractJobRequirements, compareSeniority } from "../services/jobRequirementsParser.js"

const cases = [
  {
    name: "vaga senior + 5+ anos",
    job: { title: "Senior Backend Developer", description: "Buscamos pessoa com 5+ anos de experiencia em Node.js" },
    expected: { yearsRequired: 5, seniorityRequired: "senior" }
  },
  {
    name: "vaga junior + 1 ano",
    job: { title: "Desenvolvedor Junior", description: "Pelo menos 1 ano de experiencia" },
    expected: { yearsRequired: 1, seniorityRequired: "junior" }
  },
  {
    name: "vaga lead sem anos",
    job: { title: "Tech Lead Backend", description: "Lideranca tecnica de time" },
    expected: { yearsRequired: null, seniorityRequired: "lead" }
  },
  {
    name: "vaga pleno + experiencia de 3 anos",
    job: { title: "Desenvolvedor Pleno", description: "Experiencia de 3 anos com Java" },
    expected: { yearsRequired: 3, seniorityRequired: "pleno" }
  },
  {
    name: "vaga sem nivel + minimo 7 anos",
    job: { title: "Desenvolvedor Backend", description: "Necessario minimo 7 anos de experiencia" },
    expected: { yearsRequired: 7, seniorityRequired: null }
  },
]

let pass = 0, fail = 0
for (const c of cases) {
  const got = extractJobRequirements(c.job)
  const ok = got.yearsRequired === c.expected.yearsRequired && got.seniorityRequired === c.expected.seniorityRequired
  if (ok) { pass++; console.log(`✓ ${c.name}`) }
  else { fail++; console.log(`✗ ${c.name}\n   esperado ${JSON.stringify(c.expected)}\n   recebido ${JSON.stringify(got)}`) }
}

const cmps = [
  ["senior", "senior", "match"],
  ["pleno", "senior", "under"],
  ["senior", "pleno", "over"],
  ["junior", "junior", "match"],
  ["lead", "senior", "over"],
  [null, "senior", "unknown"],
]
for (const [c, r, exp] of cmps) {
  const got = compareSeniority(c, r)
  const ok = got === exp
  if (ok) { pass++; console.log(`✓ compareSeniority(${c}, ${r}) → ${exp}`) }
  else { fail++; console.log(`✗ compareSeniority(${c}, ${r}): esperado ${exp}, recebido ${got}`) }
}

console.log(`\nTotal: ${pass} OK, ${fail} fail`)
process.exit(fail > 0 ? 1 : 0)

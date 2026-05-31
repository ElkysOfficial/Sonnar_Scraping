/**
 * Testes do matchCalculator (v3.10.31).
 *
 * Cobre: score 0-100, dimensoes (hard/soft/anos/seniority/idiomas/setor),
 * geracao de listas strong[] e gaps[].
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { calculateMatch } from "../services/matchCalculator.js"

const baseJob = {
  title: "Senior Backend Engineer",
  description: "Buscamos Senior com 5+ anos. Inglês avançado. Liderança técnica. Fintech.",
  responsibilities: "Construir APIs, liderar refatoração, mentorar equipe.",
  skills: ["Node.js", "AWS", "PostgreSQL"],
}

test("calculateMatch: resume null -> score 0", () => {
  const r = calculateMatch(baseJob, null)
  assert.equal(r.score, 0)
  assert.deepEqual(r.strong, [])
  assert.deepEqual(r.gaps, [])
})

test("calculateMatch: match perfeito -> score alto", () => {
  const resume = {
    skills: ["Node.js", "AWS", "PostgreSQL"],
    yearsTotal: 7,
    seniority: "senior",
    softSkills: ["lideranca"],
    activities: ["construir", "liderar", "mentorar"],
    languages: ["ingles avancado"],
    industries: ["fintech"],
  }
  const r = calculateMatch(baseJob, resume)
  assert.ok(r.score >= 80, `score esperado >= 80, recebido ${r.score}`)
  assert.ok(r.strong.length >= 3)
})

test("calculateMatch: gap de anos entra em gaps[]", () => {
  const resume = { skills: ["Node.js"], yearsTotal: 2, seniority: "pleno" }
  const r = calculateMatch(baseJob, resume)
  assert.ok(r.gaps.some((g) => /Vaga pede 5\+ anos/.test(g)))
})

test("calculateMatch: senioridade overqualified vira ponto forte", () => {
  const job = { ...baseJob, title: "Desenvolvedor Pleno", description: "" }
  const resume = { skills: [], yearsTotal: null, seniority: "senior" }
  const r = calculateMatch(job, resume)
  assert.ok(r.strong.some((s) => /Voce e senior/.test(s)))
})

test("calculateMatch: skill faltante entra em gaps", () => {
  const job = { ...baseJob, skills: ["Node.js", "Kubernetes", "Terraform"] }
  const resume = { skills: ["Node.js"] }
  const r = calculateMatch(job, resume)
  assert.ok(r.gaps.some((g) => /Estude|Vale estudar/.test(g) && g.includes("Kubernetes")))
})

test("calculateMatch: muitas skills faltantes -> NAO mostra contagem desmotivadora", () => {
  const job = { ...baseJob, skills: ["Python", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] }
  // Resume tem 1 skill da vaga (Python) e nada das outras 10 -> missing.length = 10
  const resume = { skills: ["Python"] }
  const r = calculateMatch(job, resume)
  // v3.10.35: NAO deve dizer "Faltam 10 skills" (desmotivador)
  assert.ok(!r.gaps.some((g) => /Faltam \d+ skills/.test(g)))
  // Deve sugerir estudo das 3 primeiras
  assert.ok(r.gaps.some((g) => /Vale estudar/.test(g)))
})

test("calculateMatch: idioma exigido sem match -> gap", () => {
  const resume = { skills: [], languages: [] }
  const r = calculateMatch(baseJob, resume)
  assert.ok(r.gaps.some((g) => /Inglês/i.test(g)))
})

test("calculateMatch: setor match -> ponto forte", () => {
  const resume = { skills: [], industries: ["fintech"] }
  const r = calculateMatch(baseJob, resume)
  assert.ok(r.strong.some((s) => /FinTech/.test(s)))
})

test("calculateMatch: dimensions reflete pontuacao parcial", () => {
  const job = { skills: ["A", "B", "C", "D"] }
  const resume = { skills: ["A", "B"] }
  const r = calculateMatch(job, resume)
  assert.equal(r.dimensions.hardSkills, 50)
})

test("calculateMatch: score eh 0-100", () => {
  const r = calculateMatch(baseJob, { skills: ["Node.js"], yearsTotal: 5, seniority: "senior" })
  assert.ok(r.score >= 0 && r.score <= 100, `score fora do range: ${r.score}`)
})

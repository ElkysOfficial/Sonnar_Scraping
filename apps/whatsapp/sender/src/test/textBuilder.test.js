/**
 * Testes do textBuilder — mensagem de vaga em texto puro enviada pelo sender.
 *
 * Roda com: node --test src/test/textBuilder.test.js
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  extractJobDataFromEmbed,
  resolveEmbedPayload,
  formatJobMessage,
} from "../services/textBuilder.js"

// =====================================================
// resolveEmbedPayload — aceita varios shapes de entrada
// =====================================================

test("resolveEmbedPayload: aceita embed com fields direto", () => {
  const embed = { title: "Vaga", fields: [{ name: "Empresa", value: "Acme" }] }
  const result = resolveEmbedPayload(embed)
  assert.equal(result, embed)
})

test("resolveEmbedPayload: converte job (formato core) em embed", () => {
  const job = {
    job_title: "Backend Engineer",
    job_url: "https://linkedin.com/jobs/123",
    company: "Acme",
    location: "Sao Paulo - SP",
    work_type: "Remoto",
    salary: "R$ 15.000",
    publication_date: "28/05/2026",
    skills: ["Node.js", "AWS"]
  }
  const result = resolveEmbedPayload(job)
  assert.equal(result.title, "Backend Engineer")
  assert.equal(result.url, "https://linkedin.com/jobs/123")
  assert.ok(Array.isArray(result.fields) && result.fields.length > 0)
  assert.deepEqual(result.skills, ["Node.js", "AWS"])
})

test("resolveEmbedPayload: retorna null pra payload vazio", () => {
  assert.equal(resolveEmbedPayload(null), null)
  assert.equal(resolveEmbedPayload(undefined), null)
})

// =====================================================
// extractJobDataFromEmbed
// =====================================================

test("extractJobDataFromEmbed: extrai dados completos", () => {
  const embed = {
    title: "Senior React Developer",
    url: "https://linkedin.com/jobs/456",
    timestamp: "2026-05-28T14:30:00Z",
    skills: ["React", "TypeScript"],
    fields: [
      { name: "Empresa", value: "Acme Corp" },
      { name: "Localidade", value: "Sao Paulo - SP" },
      { name: "Modalidade", value: "Remoto" },
      { name: "Salario", value: "R$ 12.000" }
    ]
  }
  const data = extractJobDataFromEmbed(embed)
  assert.equal(data.title, "Senior React Developer")
  assert.equal(data.company, "Acme Corp")
  assert.equal(data.location, "Sao Paulo - SP")
  assert.equal(data.workType, "Remoto")
  assert.equal(data.salary, "R$ 12.000")
  assert.equal(data.source, "via LinkedIn")
  assert.deepEqual(data.skills, ["React", "TypeScript"])
})

test("extractJobDataFromEmbed: separa salaryNote de 'com base no glassdoor'", () => {
  const embed = {
    title: "Dev",
    fields: [{ name: "Salario", value: "R$ 10.000 com base no glassdoor" }]
  }
  const data = extractJobDataFromEmbed(embed)
  assert.equal(data.salary, "R$ 10.000")
  assert.match(data.salaryNote, /com base no glassdoor/i)
})

test("extractJobDataFromEmbed: fonte 'via Sonar' quando URL ausente", () => {
  const embed = { title: "X", fields: [] }
  const data = extractJobDataFromEmbed(embed)
  assert.equal(data.source, "via Sonar")
})

test("extractJobDataFromEmbed: detecta fontes conhecidas (Gupy, BNE, Indeed)", () => {
  const cases = [
    { url: "https://gupy.io/jobs/x", expected: "via Gupy" },
    { url: "https://www.bne.com.br/vaga/123", expected: "via BNE" },
    { url: "https://br.indeed.com/jobs/y", expected: "via Indeed" }
  ]
  for (const c of cases) {
    const data = extractJobDataFromEmbed({ title: "X", url: c.url, fields: [] })
    assert.equal(data.source, c.expected, `URL: ${c.url}`)
  }
})

// =====================================================
// formatJobMessage — layout final em texto WhatsApp
// =====================================================

const FIXED_JOB = {
  title: "Senior Backend Developer",
  company: "Acme Corp",
  location: "Sao Paulo - SP",
  workType: "Remoto",
  salary: "R$ 15.000",
  salaryNote: "",
  skills: ["Node.js", "AWS", "TypeScript"],
  responsibilities: "Desenvolver APIs;Code review;Mentoria",
  source: "via LinkedIn",
  date: "28/05/2026",
  time: "14:30",
  url: "https://linkedin.com/jobs/123"
}

test("formatJobMessage: contem todos os blocos esperados (vaga completa)", () => {
  const out = formatJobMessage(FIXED_JOB, "https://son.sh/v/abc")
  // Titulo em bold
  assert.match(out, /\*Senior Backend Developer\*/)
  // Empresa em italico com prefixo
  assert.match(out, /🏢 _Acme Corp_/)
  // Localidade
  assert.match(out, /📍 Sao Paulo - SP/)
  // Modalidade
  assert.match(out, /💼 Remoto/)
  // Salario destacado
  assert.match(out, /💰 \*R\$ 15\.000\*/)
  // Bloco Tecnologias
  assert.match(out, /\*🧩 Tecnologias\*/)
  assert.match(out, /Node\.js {2}• {2}AWS {2}• {2}TypeScript/)
  // Bloco Responsabilidades com bullets
  assert.match(out, /\*📋 Responsabilidades\*/)
  assert.match(out, /• Desenvolver APIs/)
  assert.match(out, /• Code review/)
  assert.match(out, /• Mentoria/)
  // Link encurtado
  assert.match(out, /🔗 \*Ver a vaga:\* https:\/\/son\.sh\/v\/abc/)
  // Rodape com fonte + data
  assert.match(out, /_via LinkedIn · 28\/05\/2026 14:30_/)
})

test("formatJobMessage: omite linha 💰 quando salario vazio", () => {
  const job = { ...FIXED_JOB, salary: "", salaryNote: "" }
  const out = formatJobMessage(job, "x")
  assert.doesNotMatch(out, /💰/)
})

test("formatJobMessage: inclui salaryNote entre parenteses", () => {
  const job = { ...FIXED_JOB, salaryNote: "com base no glassdoor" }
  const out = formatJobMessage(job, "x")
  assert.match(out, /💰 \*R\$ 15\.000\* _\(com base no glassdoor\)_/)
})

test("formatJobMessage: omite bloco Responsabilidades quando vazio", () => {
  const job = { ...FIXED_JOB, responsibilities: "" }
  const out = formatJobMessage(job, "x")
  assert.doesNotMatch(out, /📋 Responsabilidades/)
})

test("formatJobMessage: omite Tecnologias quando skills vazias", () => {
  const job = { ...FIXED_JOB, skills: [] }
  const out = formatJobMessage(job, "x")
  assert.doesNotMatch(out, /🧩 Tecnologias/)
})

test("formatJobMessage: omite 📍 quando location e 'Nao informado'", () => {
  const job = { ...FIXED_JOB, location: "Nao informado" }
  const out = formatJobMessage(job, "x")
  assert.doesNotMatch(out, /📍 Nao informado/)
})

test("formatJobMessage: omite 💼 quando workType e 'Nao informado'", () => {
  const job = { ...FIXED_JOB, workType: "Nao informado" }
  const out = formatJobMessage(job, "x")
  assert.doesNotMatch(out, /💼 Nao informado/)
})

test("formatJobMessage: omite rodape quando fonte + data + hora ausentes", () => {
  const job = { ...FIXED_JOB, source: "", date: "", time: "" }
  const out = formatJobMessage(job, "x")
  // Nao deve terminar com linha de _italico_ vazia
  assert.doesNotMatch(out, /_ · _/)
})

test("formatJobMessage: bloco Responsabilidades com texto longo unico vira paragrafo", () => {
  const longText = "Atuar no desenvolvimento de microsservicos REST em Node.js, mantendo arquitetura limpa e escrevendo testes automatizados. " +
    "Realizar code reviews dos pares e dar suporte tecnico ao time de produto."
  const job = { ...FIXED_JOB, responsibilities: longText }
  const out = formatJobMessage(job, "x")
  assert.match(out, /\*📋 Responsabilidades\*/)
  // Nao deve quebrar em bullets (so 1 linha, sem `;`)
  const respSection = out.split("*📋 Responsabilidades*")[1]
  assert.ok(!respSection.includes("• "), "Texto longo unico nao deve virar bullet")
})

test("formatJobMessage: bloco Responsabilidades com bullets de quebra de linha", () => {
  const text = "- Item 1\n- Item 2\n- Item 3"
  const job = { ...FIXED_JOB, responsibilities: text }
  const out = formatJobMessage(job, "x")
  assert.match(out, /• Item 1/)
  assert.match(out, /• Item 2/)
  assert.match(out, /• Item 3/)
})

// =====================================================
// Integracao end-to-end: payload do core -> mensagem final
// =====================================================

test("end-to-end: job do core vira mensagem completa", () => {
  const job = {
    job_title: "Full Stack Engineer",
    job_url: "https://gupy.io/jobs/789",
    company: "TechCo",
    location: "Remoto - Brasil",
    work_type: "Remoto",
    salary: "R$ 10.000 - R$ 14.000",
    publication_date: "28/05/2026",
    skills: ["React", "Node.js"],
    // 3 itens separados por ; (>=2 separadores -> vira bullets)
    responsibilities: "Desenvolver features novas;Manter codigo legado;Code reviews"
  }
  const embed = resolveEmbedPayload(job)
  assert.ok(embed)
  const data = extractJobDataFromEmbed(embed)
  const out = formatJobMessage(data, "https://son.sh/v/xyz")
  assert.match(out, /\*Full Stack Engineer\*/)
  assert.match(out, /🏢 _TechCo_/)
  assert.match(out, /💰 \*R\$ 10\.000 - R\$ 14\.000\*/)
  assert.match(out, /via Gupy/)
  assert.match(out, /• Desenvolver features novas/)
  assert.match(out, /• Manter codigo legado/)
  assert.match(out, /• Code reviews/)
})

test("formatJobMessage: 1 separador ';' nao quebra em bullets (paragrafo unico)", () => {
  // Regra herdada do formatter antigo: precisa de >=2 `;` pra virar bullets.
  // Com 1 separador, mantem como paragrafo unico — evita false-positive em
  // descricoes que usam `;` no meio do texto.
  const job = { ...FIXED_JOB, responsibilities: "Texto curto;com so um separador" }
  const out = formatJobMessage(job, "x")
  assert.match(out, /Texto curto;com so um separador/)
  const respSection = out.split("*📋 Responsabilidades*")[1]
  assert.ok(!respSection.includes("• "), "1 separador nao deve virar bullets")
})

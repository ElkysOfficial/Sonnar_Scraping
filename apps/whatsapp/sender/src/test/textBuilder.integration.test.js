/**
 * Teste de integracao do pipeline texto: roda 12 vagas reais (fixture) pelo
 * resolveEmbedPayload -> extractJobDataFromEmbed -> formatJobMessage e
 * valida que nenhuma quebra + propriedades invariantes da saida.
 *
 * Fixture: src/test/fixtures/real-jobs.json (vagas anonimizadas baseadas em
 * payloads reais que ja foram pelo pipeline).
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import {
  extractJobDataFromEmbed,
  resolveEmbedPayload,
  formatJobMessage,
} from "../services/textBuilder.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(__dirname, "fixtures", "real-jobs.json")

const fakeShortUrl = (url) => (url ? `https://son.sh/v/${url.length.toString(36)}` : "")

async function loadFixtures() {
  const raw = await readFile(FIXTURE_PATH, "utf8")
  return JSON.parse(raw)
}

test("integration: todas as 12 vagas da fixture renderizam sem erro", async () => {
  const jobs = await loadFixtures()
  assert.equal(jobs.length, 12, "fixture deve ter 12 vagas")

  for (const job of jobs) {
    const label = job._label
    const embed = resolveEmbedPayload(job)
    assert.ok(embed, `${label}: embed nulo`)
    const data = extractJobDataFromEmbed(embed)
    assert.ok(data, `${label}: data nulo`)
    assert.ok(typeof data.title === "string" && data.title.length > 0, `${label}: titulo vazio`)
    const shortUrl = fakeShortUrl(job.job_url)
    const text = formatJobMessage(data, shortUrl)
    assert.ok(typeof text === "string" && text.length > 0, `${label}: mensagem vazia`)
    // Invariantes minimos
    assert.match(text, /\*.+\*/, `${label}: nenhum bold encontrado`)
    assert.ok(text.includes(data.title), `${label}: titulo nao aparece na saida`)
  }
})

test("integration: vaga linkedin completa tem todos os blocos esperados", async () => {
  const jobs = await loadFixtures()
  const job = jobs.find((j) => j.id === "linkedin-4023718291")
  const embed = resolveEmbedPayload(job)
  const data = extractJobDataFromEmbed(embed)
  const text = formatJobMessage(data, fakeShortUrl(job.job_url))

  assert.match(text, /\*Senior Backend Engineer\*/)
  assert.match(text, /🏢 _Acme Corp_/)
  assert.match(text, /📍 Sao Paulo - SP/)
  assert.match(text, /💼 Remoto/)
  assert.match(text, /💰 \*R\$ 12\.000 a R\$ 18\.000\*/)
  // v3.10.31: bloco "Stack da vaga" categorizado em Backend/Cloud/etc
  assert.match(text, /\*Stack da vaga\*/)
  assert.match(text, /Node\.js/)
  assert.match(text, /AWS/)
  assert.match(text, /\*📋 Responsabilidades\*/)
  assert.match(text, /• Desenvolver e manter APIs em Node\.js/)
  // v3.10.31: rodape "Vaga capturada em [data]" no lugar de "via [fonte]"
  assert.match(text, /_Vaga capturada em /)
})

test("integration: gupy sem salario nao tem linha 💰", async () => {
  const jobs = await loadFixtures()
  const job = jobs.find((j) => j.id === "gupy-abc123")
  const embed = resolveEmbedPayload(job)
  const data = extractJobDataFromEmbed(embed)
  const text = formatJobMessage(data, fakeShortUrl(job.job_url))

  assert.doesNotMatch(text, /💰/)
  // v3.10.31: rodape mudou
  assert.match(text, /_Vaga capturada em /)
  // Paragrafo unico de responsibilities (sem `;`) — sem bullets
  const respSection = text.split("*📋 Responsabilidades*")[1]
  assert.ok(respSection && !respSection.includes("• "), "paragrafo unico nao deve virar bullets")
})

test("integration: bne com location 'Nao informado' omite linha 📍", async () => {
  const jobs = await loadFixtures()
  const job = jobs.find((j) => j.id === "bne-789")
  const embed = resolveEmbedPayload(job)
  const data = extractJobDataFromEmbed(embed)
  const text = formatJobMessage(data, fakeShortUrl(job.job_url))

  assert.doesNotMatch(text, /📍 Nao informado/)
  assert.doesNotMatch(text, /💼 Nao informado/)
  assert.doesNotMatch(text, /Stack da vaga/)
  assert.doesNotMatch(text, /📋 Responsabilidades/)
  assert.match(text, /💰 \*R\$ 5\.000\*/)
})

test("integration: indeed com glassdoor separa salaryNote", async () => {
  const jobs = await loadFixtures()
  const job = jobs.find((j) => j.id === "indeed-xyz")
  const embed = resolveEmbedPayload(job)
  const data = extractJobDataFromEmbed(embed)
  const text = formatJobMessage(data, fakeShortUrl(job.job_url))

  assert.match(text, /💰 \*R\$ 8\.000\* _\(com base no Glassdoor\)_/)
  // v3.10.31: "via [source]" removido — agora "Vaga capturada em"
  assert.match(text, /_Vaga capturada em /)
})

test("integration: remoteok com bullets - quebra em linhas vira • limpo", async () => {
  const jobs = await loadFixtures()
  const job = jobs.find((j) => j.id === "remoteok-555")
  const embed = resolveEmbedPayload(job)
  const data = extractJobDataFromEmbed(embed)
  const text = formatJobMessage(data, fakeShortUrl(job.job_url))

  assert.match(text, /• Manter infraestrutura AWS/)
  assert.match(text, /• Operar Kubernetes em producao/)
  assert.match(text, /• Implementar CI\/CD/)
  // Nao pode ter `-` antes do bullet (deve limpar)
  assert.doesNotMatch(text, /• -/)
})

test("integration: vaga minima (so titulo) ainda produz mensagem valida", async () => {
  const jobs = await loadFixtures()
  const job = jobs.find((j) => j.id === "minimal-1")
  const embed = resolveEmbedPayload(job)
  const data = extractJobDataFromEmbed(embed)
  const text = formatJobMessage(data, fakeShortUrl(job.job_url))

  assert.match(text, /\*Vaga Misteriosa\*/)
  // Company sempre cai no fallback "Confidencial" quando ausente -> 🏢 aparece
  assert.match(text, /🏢 _Confidencial_/)
  // Resto dos blocos opcionais nao deve aparecer
  assert.doesNotMatch(text, /💰|📍|💼|🧩|📋/)
  assert.match(text, /🔗 \*Ver a vaga:\*/)
  // v3.10.31: rodape com data de captura
  assert.match(text, /_Vaga capturada em /)
})

test("integration: titulo muito longo nao corrompe a saida", async () => {
  const jobs = await loadFixtures()
  const job = jobs.find((j) => j.id === "long-title-1")
  const embed = resolveEmbedPayload(job)
  const data = extractJobDataFromEmbed(embed)
  const text = formatJobMessage(data, fakeShortUrl(job.job_url))

  assert.match(text, /Senior Software Engineer/)
  assert.match(text, /Tech Lead/)
  assert.match(text, /Multinational FinTech/)
  // Estrutura mantida
  assert.match(text, /💰 \*R\$ 25\.000\*/)
  assert.match(text, /• Liderar tecnicamente/)
})

test("integration: caracteres especiais em company nao quebram markdown", async () => {
  const jobs = await loadFixtures()
  const job = jobs.find((j) => j.id === "special-chars")
  const embed = resolveEmbedPayload(job)
  const data = extractJobDataFromEmbed(embed)
  const text = formatJobMessage(data, fakeShortUrl(job.job_url))

  assert.match(text, /🏢 _Empresa S\/A — Filial Brasil \(LTDA\.\)_/)
})

test("integration: rodape mostra data de captura (v3.10.31)", async () => {
  const jobs = await loadFixtures()
  const job = jobs.find((j) => j.id === "unknown-source")
  const embed = resolveEmbedPayload(job)
  const data = extractJobDataFromEmbed(embed)
  const text = formatJobMessage(data, fakeShortUrl(job.job_url))

  // v3.10.31: "via [source]" foi substituido por "Vaga capturada em [data]"
  assert.match(text, /_Vaga capturada em /)
})

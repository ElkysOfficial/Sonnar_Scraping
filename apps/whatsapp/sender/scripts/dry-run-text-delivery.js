#!/usr/bin/env node
/**
 * Smoke test do pipeline de entrega em texto puro (v3.6.0).
 *
 * Modo offline (default — sem env):
 *   node scripts/dry-run-text-delivery.js
 *   -> usa as 12 vagas da fixture local e imprime cada mensagem renderizada.
 *
 * Modo online (com env do core configurado):
 *   MESSAGE_FORMATTING_CORE_URL=http://localhost:3100 \
 *     node scripts/dry-run-text-delivery.js --live
 *   -> consulta o core via coreClient.fetchPendingJobs(5) e renderiza as
 *      5 vagas pendentes mais recentes. Nao envia nada pelo Baileys.
 *
 * Saida: bloco separado por divisor por vaga, com numero de chars / linhas
 * pra avaliar limites do WhatsApp.
 */

import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import {
  extractJobDataFromEmbed,
  resolveEmbedPayload,
  formatJobMessage,
} from "../src/services/textBuilder.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(__dirname, "..", "src", "test", "fixtures", "real-jobs.json")

const DIVIDER = "═".repeat(72)
const SUB = "─".repeat(72)

function shortenStub(url) {
  if (!url) return ""
  const tail = url.length.toString(36)
  return `https://son.sh/v/${tail}`
}

function renderJob(job, idx) {
  const embed = resolveEmbedPayload(job)
  if (!embed) {
    console.log(`[${idx + 1}] ❌ resolveEmbedPayload retornou null`)
    return null
  }
  const data = extractJobDataFromEmbed(embed)
  if (!data) {
    console.log(`[${idx + 1}] ❌ extractJobDataFromEmbed retornou null`)
    return null
  }
  const shortUrl = shortenStub(data.url)
  const text = formatJobMessage(data, shortUrl)

  const lines = text.split("\n").length
  const chars = text.length

  console.log(DIVIDER)
  const label = job._label ? ` — ${job._label}` : ""
  console.log(`[${idx + 1}] ${data.title}${label}`)
  console.log(`    chars=${chars} | linhas=${lines}`)
  console.log(SUB)
  console.log(text)
  console.log("")

  if (chars > 4096) {
    console.warn(`⚠️  Mensagem ${idx + 1} excede 4096 chars (WhatsApp recomenda <=4096)`)
  }

  return { chars, lines }
}

async function runOffline() {
  console.log(`📦 Modo OFFLINE — lendo fixture ${FIXTURE_PATH}\n`)
  const raw = await readFile(FIXTURE_PATH, "utf8")
  const jobs = JSON.parse(raw)
  console.log(`Carregadas ${jobs.length} vagas.\n`)

  let ok = 0
  let totalChars = 0
  for (const [idx, job] of jobs.entries()) {
    const result = renderJob(job, idx)
    if (result) {
      ok += 1
      totalChars += result.chars
    }
  }

  console.log(DIVIDER)
  console.log(`RESUMO: ${ok}/${jobs.length} vagas renderizadas com sucesso.`)
  console.log(`Media de chars/mensagem: ${Math.round(totalChars / Math.max(ok, 1))}`)
  if (ok !== jobs.length) {
    process.exit(1)
  }
}

async function runLive(limit) {
  console.log(`🌐 Modo LIVE — consultando core em ${process.env.MESSAGE_FORMATTING_CORE_URL || "http://localhost:3100"}\n`)
  const { fetchPendingJobs } = await import("../src/services/coreClient.js")
  const jobs = await fetchPendingJobs(limit)
  if (!jobs.length) {
    console.log("⚠️  Sem vagas pendentes no core. Nada a renderizar.")
    return
  }
  console.log(`Recebidas ${jobs.length} vagas pendentes.\n`)
  for (const [idx, job] of jobs.entries()) {
    renderJob(job, idx)
  }
  console.log(DIVIDER)
  console.log(`Concluido: ${jobs.length} renderizada(s). Nenhuma enviada (dry-run).`)
}

async function main() {
  const args = process.argv.slice(2)
  const live = args.includes("--live")
  const limitIdx = args.indexOf("--limit")
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 5 : 5

  if (live) {
    await runLive(limit)
  } else {
    await runOffline()
  }
}

main().catch((err) => {
  console.error("❌ Smoke test falhou:", err.message)
  console.error(err.stack)
  process.exit(1)
})

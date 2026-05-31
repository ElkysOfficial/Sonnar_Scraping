/**
 * Testes do fluxo VIP de envio em texto puro (v3.6.0).
 *
 * Cobre as funcoes exportadas pelo vipJobSender:
 *   - buildJobTextMessage(job, { shortenUrl })
 *   - sendJobMessage(jid, jobId, payload, socket, { delay })
 *
 * Roda com: node --test src/test/vipJobSender.test.js
 *
 * NOTA: a importacao do vipJobSender carrega Supabase/dotenv. Em ambiente
 * sem .env, isso so produz warnings — nao quebra os testes.
 */

import { test, mock } from "node:test"
import assert from "node:assert/strict"
import { buildJobTextMessage, sendJobMessage } from "../services/vipJobSender.js"

const SAMPLE_JOB = {
  id: "vip-001",
  job_title: "Senior Data Engineer",
  job_url: "https://gupy.io/jobs/vip-001",
  company: "DataCo",
  location: "Sao Paulo - SP",
  work_type: "Hibrido",
  salary: "R$ 18.000",
  skills: ["Python", "Airflow"],
  publication_date: "28/05/2026",
  responsibilities: "Construir pipelines;Operar infra de dados;Apoiar analytics",
}

// ──────────────────────────────────────────────────────────────────────
// buildJobTextMessage
// ──────────────────────────────────────────────────────────────────────

test("VIP buildJobTextMessage: retorna null para payload nulo", async () => {
  const result = await buildJobTextMessage(null, {}, { shortenUrl: async () => "" })
  assert.equal(result, null)
})

test("VIP buildJobTextMessage: monta mensagem completa com dados reais", async () => {
  const shortenUrl = mock.fn(async (url) => `https://son.sh/v/${url.length}`)
  const result = await buildJobTextMessage(SAMPLE_JOB, {}, { shortenUrl })

  assert.ok(result)
  assert.ok(typeof result.text === "string" && result.text.length > 0)
  assert.match(result.text, /\*Senior Data Engineer\*/)
  assert.match(result.text, /🏢 _DataCo_/)
  // v3.10.37: VIP usa modo lite (sem salario, sem stack categorizada)
  assert.doesNotMatch(result.text, /💰/)
  assert.match(result.text, /\*🧩 Tecnologias\*/)
  assert.match(result.text, /• Construir pipelines/)
  // Sem subscriberResume: rodape com data (nao tem CTA consultoria)
  assert.match(result.text, /_Vaga capturada em /)
  assert.equal(result.jobData.id, "vip-001")
  assert.equal(shortenUrl.mock.callCount(), 1)
  assert.equal(shortenUrl.mock.calls[0].arguments[0], SAMPLE_JOB.job_url)
})

test("VIP buildJobTextMessage: retorna null quando shortener falha", async () => {
  const shortenUrl = mock.fn(async () => {
    throw new Error("shortener offline")
  })
  const result = await buildJobTextMessage(SAMPLE_JOB, {}, { shortenUrl })
  assert.equal(result, null)
})

test("VIP buildJobTextMessage: aceita job ja em forma de embed (com fields)", async () => {
  const embed = {
    title: "Embed Direto",
    url: "https://linkedin.com/jobs/x",
    fields: [
      { name: "Empresa", value: "EmbedCo" },
      { name: "Salario", value: "R$ 9.000" },
    ],
  }
  const shortenUrl = async () => "https://son.sh/v/x"
  const result = await buildJobTextMessage(embed, {}, { shortenUrl })
  assert.ok(result)
  assert.match(result.text, /\*Embed Direto\*/)
  assert.match(result.text, /🏢 _EmbedCo_/)
  // v3.10.37: VIP em modo lite nao mostra salario
  assert.doesNotMatch(result.text, /💰/)
})

// ──────────────────────────────────────────────────────────────────────
// v3.10.37: VIP modo lite com subscriberResume (Plus)
// ──────────────────────────────────────────────────────────────────────

test("VIP Plus (v3.10.37): subscriberResume traz bloco match + CTA consultoria", async () => {
  const shortenUrl = async () => "https://son.sh/v/x"
  const result = await buildJobTextMessage(
    SAMPLE_JOB,
    {
      subscriberResume: {
        skills: ["Python", "AWS"],
        yearsTotal: 6,
        seniority: "senior",
      },
    },
    { shortenUrl }
  )
  // Tecnologias em linha
  assert.match(result.text, /\*🧩 Tecnologias\*/)
  // Match block (Pontos fortes pelo menos)
  assert.match(result.text, /🟢 \*Pontos fortes\*/)
  // CTA consultoria no final
  assert.match(result.text, /📝 \*Solicite já sua consultoria/)
  assert.match(result.text, /sonnarjobs\.com\.br/)
  // Sem rodape de data (substituido pelo CTA)
  assert.doesNotMatch(result.text, /Vaga capturada em/)
})

test("VIP Plus: sem subscriberResume nao mostra match nem CTA consultoria", async () => {
  const shortenUrl = async () => "x"
  const result = await buildJobTextMessage(SAMPLE_JOB, {}, { shortenUrl })
  assert.doesNotMatch(result.text, /Pontos fortes/)
  assert.doesNotMatch(result.text, /Solicite já sua consultoria/)
})

test("VIP Plus #1: subscriberStack vazio array tambem cai no fluxo legado", async () => {
  const shortenUrl = async () => "x"
  const result = await buildJobTextMessage(SAMPLE_JOB, { subscriberStack: [] }, { shortenUrl })
  assert.doesNotMatch(result.text, /✓|✗/)
})

// ──────────────────────────────────────────────────────────────────────
// sendJobMessage
// ──────────────────────────────────────────────────────────────────────

function noDelay() {
  return Promise.resolve()
}

test("VIP sendJobMessage: retorna false quando payload sem text", async () => {
  const socket = { sendMessage: mock.fn(async () => ({})) }
  const ok = await sendJobMessage("123@s.whatsapp.net", "j1", {}, socket, { delay: noDelay })
  assert.equal(ok, false)
  assert.equal(socket.sendMessage.mock.callCount(), 0)
})

test("VIP sendJobMessage: retorna false quando payload e null", async () => {
  const socket = { sendMessage: mock.fn(async () => ({})) }
  const ok = await sendJobMessage("123@s.whatsapp.net", "j1", null, socket, { delay: noDelay })
  assert.equal(ok, false)
  assert.equal(socket.sendMessage.mock.callCount(), 0)
})

test("VIP sendJobMessage: chama socket.sendMessage com { text } e retorna true", async () => {
  const socket = {
    sendMessage: mock.fn(async (jid, payload) => ({ jid, payload })),
  }
  const ok = await sendJobMessage(
    "123@s.whatsapp.net",
    "vip-001",
    { text: "*Vaga*\n📍 SP" },
    socket,
    { delay: noDelay }
  )
  assert.equal(ok, true)
  assert.equal(socket.sendMessage.mock.callCount(), 1)
  const args = socket.sendMessage.mock.calls[0].arguments
  assert.equal(args[0], "123@s.whatsapp.net")
  assert.deepEqual(args[1], { text: "*Vaga*\n📍 SP" })
  // CRITICO: regressao de imagem — esses campos NAO podem aparecer
  assert.equal(args[1].image, undefined)
  assert.equal(args[1].caption, undefined)
  assert.equal(args[1].mimetype, undefined)
})

test("VIP sendJobMessage: retorna false quando socket.sendMessage rejeita", async () => {
  const socket = {
    sendMessage: mock.fn(async () => {
      throw new Error("WS closed")
    }),
  }
  const ok = await sendJobMessage(
    "123@s.whatsapp.net",
    "j1",
    { text: "x" },
    socket,
    { delay: noDelay }
  )
  assert.equal(ok, false)
})

test("VIP sendJobMessage: respeita o delay passado (chamado uma vez)", async () => {
  const socket = { sendMessage: mock.fn(async () => ({})) }
  const delayMock = mock.fn(async () => {})
  await sendJobMessage(
    "1@s.whatsapp.net",
    "j1",
    { text: "x" },
    socket,
    { delay: delayMock }
  )
  assert.equal(delayMock.mock.callCount(), 1)
})

// ──────────────────────────────────────────────────────────────────────
// Integracao: buildJobTextMessage -> sendJobMessage
// ──────────────────────────────────────────────────────────────────────

test("VIP integracao: build + send entrega mensagem completa pelo socket", async () => {
  const shortenUrl = async (u) => (u ? `https://son.sh/v/${u.length}` : "")
  const socket = {
    sendMessage: mock.fn(async () => ({ messageID: "ok" })),
  }

  const built = await buildJobTextMessage(SAMPLE_JOB, { shortenUrl })
  assert.ok(built)
  const ok = await sendJobMessage(
    "5511999999999@s.whatsapp.net",
    SAMPLE_JOB.id,
    built,
    socket,
    { delay: noDelay }
  )

  assert.equal(ok, true)
  assert.equal(socket.sendMessage.mock.callCount(), 1)
  const sentText = socket.sendMessage.mock.calls[0].arguments[1].text
  assert.match(sentText, /\*Senior Data Engineer\*/)
  assert.match(sentText, /🏢 _DataCo_/)
  // v3.10.37: lite mode sem salario
  assert.doesNotMatch(sentText, /💰/)
  assert.match(sentText, /\*🧩 Tecnologias\*/)
  assert.match(sentText, /• Construir pipelines/)
  assert.match(sentText, /🔗 \*Ver a vaga:\*/)
})

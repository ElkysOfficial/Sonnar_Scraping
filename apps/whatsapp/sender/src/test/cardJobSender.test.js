/**
 * Testes do fluxo de envio do cardJobSender via dependency injection.
 *
 * Estrategia: cada teste passa `deps` ao chamar buildNextJobMessage /
 * sendJobMessage / processNextCard. Cobre os 3 caminhos principais (sem
 * vagas, socket fechado, sucesso completo) sem precisar de mock.module
 * experimental.
 *
 * Roda com: node --test src/test/cardJobSender.test.js
 */

import { test, mock } from "node:test"
import assert from "node:assert/strict"
import { _internals } from "../services/cardJobSender.js"

const { buildNextJobMessage, sendJobMessage, processNextCard } = _internals

// ──────────────────────────────────────────────────────────────────────
// Factory de deps mockadas
// ──────────────────────────────────────────────────────────────────────

function makeDeps(overrides = {}) {
  const calls = {
    fetchPendingJobs: [],
    markJobStatus: [],
    shortenUrl: [],
    writeCardSenderState: [],
    sendMessage: [],
    isCurrentSocketReady: 0,
  }

  const socket = {
    sendMessage: mock.fn(async (to, payload) => {
      calls.sendMessage.push({ to, payload })
      return { messageID: "fake-id" }
    }),
  }

  const deps = {
    fetchPendingJobs: mock.fn(async (limit) => {
      calls.fetchPendingJobs.push({ limit })
      return overrides.pendingJobs ?? []
    }),
    markJobStatus: mock.fn(async (id, channel, status) => {
      calls.markJobStatus.push({ id, channel, status })
      return null
    }),
    shortenUrl: mock.fn(async (url) => {
      calls.shortenUrl.push({ url })
      return url ? `https://son.sh/v/${url.length}` : ""
    }),
    getCurrentSocket: () => socket,
    isCurrentSocketReady: mock.fn(() => {
      calls.isCurrentSocketReady += 1
      return overrides.socketReady ?? true
    }),
    writeCardSenderState: mock.fn(async (ts) => {
      calls.writeCardSenderState.push({ ts })
    }),
    jobGroupId: overrides.jobGroupId ?? "120363@g.us",
  }

  return { deps, calls, socket }
}

const SAMPLE_JOB = {
  id: "job-123",
  job_title: "Backend Dev",
  job_url: "https://linkedin.com/jobs/123",
  company: "Acme",
  location: "Sao Paulo - SP",
  work_type: "Remoto",
  salary: "R$ 12.000",
  skills: ["Node.js"],
  publication_date: "28/05/2026",
}

// ──────────────────────────────────────────────────────────────────────
// buildNextJobMessage
// ──────────────────────────────────────────────────────────────────────

test("buildNextJobMessage: retorna null quando nao ha vagas pendentes", async () => {
  const { deps, calls } = makeDeps({ pendingJobs: [] })
  const result = await buildNextJobMessage(deps)
  assert.equal(result, null)
  assert.equal(calls.fetchPendingJobs.length, 1)
  assert.equal(calls.fetchPendingJobs[0].limit, 1)
})

test("buildNextJobMessage: monta mensagem lite (grupo Pro v3.10.36)", async () => {
  const { deps, calls } = makeDeps({ pendingJobs: [SAMPLE_JOB] })
  const result = await buildNextJobMessage(deps)
  assert.ok(result)
  assert.equal(result.jobId, "job-123")
  assert.match(result.text, /\*Backend Dev\*/)
  // v3.10.36: grupo Pro usa modo lite - sem salario
  assert.doesNotMatch(result.text, /💰/)
  assert.match(result.text, /\*🧩 Tecnologias\*/)
  assert.match(result.text, /🔗 \*Ver a vaga:\* https:\/\/son\.sh\/v\/\d+/)
  assert.match(result.text, /_Vaga capturada em /)
  assert.equal(calls.shortenUrl.length, 1)
  assert.equal(calls.shortenUrl[0].url, SAMPLE_JOB.job_url)
})

test("buildNextJobMessage: retorna null + nao chama shortener quando shortener falha", async () => {
  const { deps } = makeDeps({ pendingJobs: [SAMPLE_JOB] })
  deps.shortenUrl = mock.fn(async () => {
    throw new Error("network down")
  })
  const result = await buildNextJobMessage(deps)
  assert.equal(result, null)
})

// ──────────────────────────────────────────────────────────────────────
// sendJobMessage
// ──────────────────────────────────────────────────────────────────────

test("sendJobMessage: retorna false e nao chama Baileys quando socket fechado", async () => {
  const { deps, socket } = makeDeps({ socketReady: false })
  const ok = await sendJobMessage({ text: "qualquer" }, deps)
  assert.equal(ok, false)
  assert.equal(socket.sendMessage.mock.callCount(), 0)
})

test("sendJobMessage: chama socket.sendMessage com { text } quando socket OK", async () => {
  const { deps, socket } = makeDeps()
  const ok = await sendJobMessage({ text: "*Vaga*\n📍 SP" }, deps)
  assert.equal(ok, true)
  assert.equal(socket.sendMessage.mock.callCount(), 1)
  const args = socket.sendMessage.mock.calls[0].arguments
  assert.equal(args[0], "120363@g.us")
  assert.deepEqual(args[1], { text: "*Vaga*\n📍 SP" })
  // CRITICO: nao pode mandar image/caption/mimetype (regressao do PR de imagem)
  assert.equal(args[1].image, undefined)
  assert.equal(args[1].caption, undefined)
  assert.equal(args[1].mimetype, undefined)
})

test("sendJobMessage: retorna false quando socket.sendMessage rejeita", async () => {
  const { deps, socket } = makeDeps()
  socket.sendMessage = mock.fn(async () => {
    throw new Error("Connection lost")
  })
  const ok = await sendJobMessage({ text: "x" }, deps)
  assert.equal(ok, false)
})

// ──────────────────────────────────────────────────────────────────────
// processNextCard (orquestrador)
// ──────────────────────────────────────────────────────────────────────

test("processNextCard: nao envia nem marca quando socket fechado", async () => {
  const { deps, socket, calls } = makeDeps({ socketReady: false })
  await processNextCard(deps)
  assert.equal(socket.sendMessage.mock.callCount(), 0)
  assert.equal(calls.markJobStatus.length, 0)
})

test("processNextCard: nao envia nem marca quando sem vagas pendentes", async () => {
  const { deps, socket, calls } = makeDeps({ pendingJobs: [] })
  await processNextCard(deps)
  assert.equal(socket.sendMessage.mock.callCount(), 0)
  assert.equal(calls.markJobStatus.length, 0)
  assert.equal(calls.writeCardSenderState.length, 0)
})

test("processNextCard: sucesso completo marca status e atualiza state", async () => {
  const { deps, socket, calls } = makeDeps({ pendingJobs: [SAMPLE_JOB] })
  await processNextCard(deps)

  assert.equal(socket.sendMessage.mock.callCount(), 1)
  const sentPayload = socket.sendMessage.mock.calls[0].arguments[1]
  assert.ok(typeof sentPayload.text === "string")
  assert.match(sentPayload.text, /\*Backend Dev\*/)

  assert.equal(calls.markJobStatus.length, 1)
  assert.deepEqual(calls.markJobStatus[0], {
    id: "job-123",
    channel: "whatsapp",
    status: true,
  })

  assert.equal(calls.writeCardSenderState.length, 1)
  assert.ok(typeof calls.writeCardSenderState[0].ts === "number")
})

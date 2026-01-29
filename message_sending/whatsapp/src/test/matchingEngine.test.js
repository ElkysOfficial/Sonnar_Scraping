import test from "node:test"
import assert from "node:assert/strict"
import {
  matchStacksWithScore,
  matchLocationForMode,
  detectWorkMode
} from "../utils/matchingEngine.js"

test("Java vs JavaScript should not cross-match", () => {
  const result = matchStacksWithScore(["java"], "Vaga JavaScript Developer", 30)
  assert.equal(result.matched, false)
  assert.equal(result.failReason, "stack_conflict")
})

test("JavaScript vs Java should not cross-match", () => {
  const result = matchStacksWithScore(["javascript"], "Senior Java Engineer", 30)
  assert.equal(result.matched, false)
  assert.equal(result.failReason, "stack_conflict")
})

test("Presencial BH/MG should accept Contagem/MG (UF match)", () => {
  const result = matchLocationForMode({
    requestedLocations: ["Belo Horizonte/MG"],
    jobLocation: "Contagem/MG",
    jobWorkMode: "onsite",
    userAcceptsRemote: false
  })
  assert.equal(result.matched, true)
})

test("Presencial BH/MG should reject Sao Paulo/SP", () => {
  const result = matchLocationForMode({
    requestedLocations: ["Belo Horizonte/MG"],
    jobLocation: "São Paulo/SP",
    jobWorkMode: "onsite",
    userAcceptsRemote: false
  })
  assert.equal(result.matched, false)
  assert.equal(result.reason, "locations_required_not_found")
})

test("Remote Brasil should accept Remote Worldwide", () => {
  const detected = detectWorkMode("Remote - Worldwide", "Remote - Worldwide")
  const result = matchLocationForMode({
    requestedLocations: ["Brasil"],
    jobLocation: "Remote - Worldwide",
    jobWorkMode: detected,
    userAcceptsRemote: true
  })
  assert.equal(result.matched, true)
  assert.equal(result.reason, "remote_bypass")
})

test("Hybrid BH with missing location should fail", () => {
  const result = matchLocationForMode({
    requestedLocations: ["Belo Horizonte"],
    jobLocation: "",
    jobWorkMode: "hybrid",
    userAcceptsRemote: false
  })
  assert.equal(result.matched, false)
  assert.equal(result.reason, "location_missing_for_onsite")
})

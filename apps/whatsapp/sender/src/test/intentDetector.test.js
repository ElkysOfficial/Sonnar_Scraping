/**
 * Testes do detector deterministico de intent (v3.10.30).
 *
 * Cobertura: 50+ casos de texto livre, numero direto, saudacoes,
 * yes/no, closing_check, pagamento, rating.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  normalize,
  detectIntent,
  detectYesNo,
  detectPaymentChoice,
  detectClosingChoice,
  detectRating,
  isGreeting,
  isBackCommand,
} from "../services/handover/intentDetector.js"

// ──────────────────────────────────────────────────────────────────────
// normalize
// ──────────────────────────────────────────────────────────────────────

test("normalize: lowercase + acentos + pontuacao", () => {
  assert.equal(normalize("Orçamento!!"), "orcamento")
  assert.equal(normalize("Bom Dia,  amigo."), "bom dia amigo")
  assert.equal(normalize("AÇÚCAR"), "acucar")
})

test("normalize: vazio e nulo", () => {
  assert.equal(normalize(""), "")
  assert.equal(normalize(null), "")
  assert.equal(normalize(undefined), "")
})

// ──────────────────────────────────────────────────────────────────────
// detectIntent — numerico
// ──────────────────────────────────────────────────────────────────────

test("detectIntent: '1' eh orcamento", () => {
  assert.equal(detectIntent("1"), "orcamento")
})
test("detectIntent: '2' eh reuniao", () => {
  assert.equal(detectIntent("2"), "reuniao")
})
test("detectIntent: '3' eh pagamento", () => {
  assert.equal(detectIntent("3"), "pagamento")
})
test("detectIntent: '4' eh parceria", () => {
  assert.equal(detectIntent("4"), "parceria")
})
test("detectIntent: '5' eh sonnar", () => {
  assert.equal(detectIntent("5"), "sonnar")
})
test("detectIntent: '6' eh atendente", () => {
  assert.equal(detectIntent("6"), "atendente")
})
test("detectIntent: '0' eh voltar", () => {
  assert.equal(detectIntent("0"), "voltar")
})

test("detectIntent: '7' ou maior nao retorna nada", () => {
  assert.equal(detectIntent("7"), null)
  assert.equal(detectIntent("99"), null)
})

test("detectIntent: '1234' nao confunde com '1'", () => {
  assert.equal(detectIntent("1234"), null)
})

test("detectIntent: '1.' ou '1)' ainda eh orcamento", () => {
  assert.equal(detectIntent("1."), "orcamento")
  assert.equal(detectIntent("1)"), "orcamento")
  assert.equal(detectIntent("01"), "orcamento")
})

test("detectIntent: '1 segundo' nao eh orcamento", () => {
  assert.equal(detectIntent("1 segundo"), null)
})

test("detectIntent: '1 por favor' aceita como orcamento", () => {
  assert.equal(detectIntent("1 por favor"), "orcamento")
})

// ──────────────────────────────────────────────────────────────────────
// detectIntent — texto livre
// ──────────────────────────────────────────────────────────────────────

test("detectIntent: 'orçamento' isolado", () => {
  assert.equal(detectIntent("orçamento"), "orcamento")
  assert.equal(detectIntent("Orcamento"), "orcamento")
})

test("detectIntent: 'quero um orcamento'", () => {
  assert.equal(detectIntent("quero um orcamento"), "orcamento")
})

test("detectIntent: 'qual o preço'", () => {
  assert.equal(detectIntent("qual o preço"), "orcamento")
})

test("detectIntent: 'agendar reuniao'", () => {
  assert.equal(detectIntent("agendar reuniao"), "reuniao")
  assert.equal(detectIntent("marcar reunião"), "reuniao")
})

test("detectIntent: 'pagar boleto'", () => {
  assert.equal(detectIntent("pagar boleto"), "pagamento")
  assert.equal(detectIntent("preciso pagar o boleto"), "pagamento")
})

test("detectIntent: 'pix'", () => {
  assert.equal(detectIntent("pix"), "pagamento")
  assert.equal(detectIntent("qual o pix"), "pagamento")
})

test("detectIntent: 'ser parceiro'", () => {
  assert.equal(detectIntent("ser parceiro"), "parceria")
  assert.equal(detectIntent("programa de parceria"), "parceria")
})

test("detectIntent: 'vagas de tecnologia'", () => {
  assert.equal(detectIntent("vagas de tecnologia"), "sonnar")
  assert.equal(detectIntent("Sonnar"), "sonnar")
  assert.equal(detectIntent("procurando vaga"), "sonnar")
})

test("detectIntent: 'falar com humano'", () => {
  assert.equal(detectIntent("falar com humano"), "atendente")
  assert.equal(detectIntent("preciso de ajuda"), "atendente")
})

test("detectIntent: 'atendente' isolado", () => {
  assert.equal(detectIntent("atendente"), "atendente")
})

test("detectIntent: 'oi' (saudacao) NAO eh intent (eh greeting)", () => {
  assert.equal(detectIntent("oi"), null)
})

test("detectIntent: texto curto sem intent retorna null", () => {
  assert.equal(detectIntent("?"), null)
  assert.equal(detectIntent("xyz"), null)
})

test("detectIntent: ambiguo (proposta isolada) — verifica nao casa errado", () => {
  // "proposta" eh weak de orcamento (apenas), nao tem outras intents
  // entao deve retornar orcamento, mas com score baixo (2) - precisa >=3
  assert.equal(detectIntent("proposta"), null)
})

// ──────────────────────────────────────────────────────────────────────
// detectYesNo
// ──────────────────────────────────────────────────────────────────────

test("detectYesNo: 'sim'", () => {
  assert.equal(detectYesNo("sim"), "yes")
  assert.equal(detectYesNo("Sim"), "yes")
  assert.equal(detectYesNo("S"), "yes")
  assert.equal(detectYesNo("ok"), "yes")
  assert.equal(detectYesNo("claro"), "yes")
  assert.equal(detectYesNo("sim por favor"), "yes")
})

test("detectYesNo: 'não'", () => {
  assert.equal(detectYesNo("nao"), "no")
  assert.equal(detectYesNo("Não"), "no")
  assert.equal(detectYesNo("n"), "no")
  assert.equal(detectYesNo("agora nao"), "no")
})

test("detectYesNo: texto neutro", () => {
  assert.equal(detectYesNo("talvez"), null)
  assert.equal(detectYesNo("???"), null)
})

// ──────────────────────────────────────────────────────────────────────
// detectPaymentChoice
// ──────────────────────────────────────────────────────────────────────

test("detectPaymentChoice: '1' -> pix, '2' -> boleto", () => {
  assert.equal(detectPaymentChoice("1"), "pix")
  assert.equal(detectPaymentChoice("2"), "boleto")
})

test("detectPaymentChoice: texto livre", () => {
  assert.equal(detectPaymentChoice("pix"), "pix")
  assert.equal(detectPaymentChoice("Pix por favor"), "pix")
  assert.equal(detectPaymentChoice("boleto"), "boleto")
})

// ──────────────────────────────────────────────────────────────────────
// detectClosingChoice
// ──────────────────────────────────────────────────────────────────────

test("detectClosingChoice: '1' / 'atendente' -> atendente", () => {
  assert.equal(detectClosingChoice("1"), "atendente")
  assert.equal(detectClosingChoice("quero falar com atendente"), "atendente")
})

test("detectClosingChoice: '2' / 'aguardar' -> ok", () => {
  assert.equal(detectClosingChoice("2"), "ok")
  assert.equal(detectClosingChoice("nao"), "ok")
})

// ──────────────────────────────────────────────────────────────────────
// detectRating
// ──────────────────────────────────────────────────────────────────────

test("detectRating: numero 1-5", () => {
  assert.equal(detectRating("1"), 1)
  assert.equal(detectRating("5"), 5)
})

test("detectRating: palavras", () => {
  assert.equal(detectRating("cinco"), 5)
  assert.equal(detectRating("excelente"), 5)
  assert.equal(detectRating("otimo"), 5)
  assert.equal(detectRating("razoavel"), 3)
})

test("detectRating: 'pular'", () => {
  assert.equal(detectRating("pular"), "skip")
})

test("detectRating: invalid", () => {
  assert.equal(detectRating("xyz"), null)
  assert.equal(detectRating(""), null)
})

// ──────────────────────────────────────────────────────────────────────
// Saudacoes
// ──────────────────────────────────────────────────────────────────────

test("isGreeting: variacoes", () => {
  assert.equal(isGreeting("oi"), true)
  assert.equal(isGreeting("Olá"), true)
  assert.equal(isGreeting("bom dia"), true)
  assert.equal(isGreeting("eai"), true)
  assert.equal(isGreeting("hello"), true)
  assert.equal(isGreeting("tudo bem"), true)
})

test("isGreeting: NAO eh saudacao", () => {
  assert.equal(isGreeting("orcamento"), false)
  assert.equal(isGreeting("oi e tchau"), false)
})

// ──────────────────────────────────────────────────────────────────────
// Back commands
// ──────────────────────────────────────────────────────────────────────

test("isBackCommand: variacoes", () => {
  assert.equal(isBackCommand("menu"), true)
  assert.equal(isBackCommand("voltar"), true)
  assert.equal(isBackCommand("0"), true)
  assert.equal(isBackCommand("sair"), true)
})

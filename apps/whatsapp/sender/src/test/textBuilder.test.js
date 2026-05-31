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
  // Bloco Stack (v3.10.31: categorizada)
  assert.match(out, /\*Stack da vaga\*/)
  assert.match(out, /Backend.*Node\.js/)
  assert.match(out, /Cloud.*AWS/)
  // Bloco Responsabilidades com bullets
  assert.match(out, /\*📋 Responsabilidades\*/)
  assert.match(out, /• Desenvolver APIs/)
  assert.match(out, /• Code review/)
  assert.match(out, /• Mentoria/)
  // Link encurtado
  assert.match(out, /🔗 \*Ver a vaga:\* https:\/\/son\.sh\/v\/abc/)
  // Rodape v3.10.31: "Vaga capturada em [data]"
  assert.match(out, /_Vaga capturada em 28\/05\/2026_/)
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

test("formatJobMessage: omite Stack quando skills vazias", () => {
  const job = { ...FIXED_JOB, skills: [] }
  const out = formatJobMessage(job, "x")
  assert.doesNotMatch(out, /Stack da vaga/)
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
// Plus #1 (v3.7.0): subscriberStack -> ✓/❌ por skill + match %
// =====================================================

test("Plus #1: subscriberStack marca skill compativel com ✅ e incompativel com ❌", () => {
  const job = { ...FIXED_JOB, skills: ["Node.js", "AWS", "TypeScript"] }
  const out = formatJobMessage(job, "https://son.sh/v/x", {
    subscriberStack: ["node.js", "aws"]
  })
  // v3.10.31: skills agora agrupadas por categoria (Backend, Cloud, Frontend, ...)
  assert.match(out, /✅ Node\.js/)
  assert.match(out, /✅ AWS/)
  assert.match(out, /❌ TypeScript/)
})

test("Plus #1: linha de sumario *Match: X de Y skills* NAO aparece (removida na v3.9.0)", () => {
  const job = { ...FIXED_JOB, skills: ["React", "Vue", "Svelte"] }
  const out = formatJobMessage(job, "x", { subscriberStack: ["react"] })
  // v3.9.0: linha "Match: X de Y skills (Z%)" foi removida. Os ✅/❌ por skill ja comunicam.
  assert.doesNotMatch(out, /📊 \*Match:/)
  // Mas as skills marcadas ainda aparecem
  assert.match(out, /✅ React/)
  assert.match(out, /❌ Vue/)
  assert.match(out, /❌ Svelte/)
})

test("Plus #1: 100% quando todas batem", () => {
  const job = { ...FIXED_JOB, skills: ["A", "B"] }
  const out = formatJobMessage(job, "x", { subscriberStack: ["a", "b", "c"] })
  assert.match(out, /✅ A.+✅ B/s)
  // v3.9.0: linha Match removida — emojis ✅ por skill ja comunicam
})

test("Plus #1: 0% quando nada bate", () => {
  const job = { ...FIXED_JOB, skills: ["X", "Y"] }
  const out = formatJobMessage(job, "x", { subscriberStack: ["q", "z"] })
  assert.match(out, /❌ X/)
  assert.match(out, /❌ Y/)
  // v3.9.0: linha Match removida
})

test("Plus #1: comparacao case-insensitive (TypeScript vs typescript)", () => {
  const job = { ...FIXED_JOB, skills: ["TypeScript", "JavaScript"] }
  const out = formatJobMessage(job, "x", { subscriberStack: ["TYPESCRIPT", "JavaScript"] })
  assert.match(out, /✅ TypeScript/)
  assert.match(out, /✅ JavaScript/)
})

test("Plus #1: sem subscriberStack -> bloco categorizado sem ✅/❌", () => {
  const job = { ...FIXED_JOB, skills: ["A", "B"] }
  const out = formatJobMessage(job, "x")
  assert.doesNotMatch(out, /✓|✗|📊/)
  // v3.10.31: skills sem categoria conhecida caem em "Outras"
  assert.match(out, /A · B|Outras.+A.+B/)
})

test("Plus #1: subscriberStack vazio -> fluxo legado", () => {
  const job = { ...FIXED_JOB, skills: ["A"] }
  const out = formatJobMessage(job, "x", { subscriberStack: [] })
  assert.doesNotMatch(out, /✓|✗|📊/)
})

test("Plus #1: skills vazio + subscriberStack -> omite bloco Stack", () => {
  const job = { ...FIXED_JOB, skills: [] }
  const out = formatJobMessage(job, "x", { subscriberStack: ["react"] })
  assert.doesNotMatch(out, /Stack da vaga/)
  assert.doesNotMatch(out, /📊/)
})

// =====================================================
// Plus #5 (v3.8.x): subscriberResume -> bloco "🎯 Comparado com seu curriculo"
// =====================================================

test("Plus #5 (v3.10.31): bloco Match aparece quando subscriberResume e passado", () => {
  const job = {
    ...FIXED_JOB,
    title: "Senior Backend Developer",
    description: "Procuramos pessoa com 5+ anos de experiencia em Node.js",
    skills: ["Node.js", "AWS"],
  }
  const out = formatJobMessage(job, "x", {
    subscriberResume: {
      skills: ["Node.js", "TypeScript"],
      yearsTotal: 6,
      seniority: "senior",
    },
  })
  assert.match(out, /\*🎯 Match com seu perfil\*/)
  assert.match(out, /🟢 \*Pontos fortes\*/)
})

test("Plus #5: skills do curriculo batem -> aparece em Pontos fortes", () => {
  const job = {
    ...FIXED_JOB,
    skills: ["Node.js", "Go", "AWS"],
  }
  const out = formatJobMessage(job, "x", {
    subscriberResume: {
      skills: ["Node.js", "AWS", "Python"],
      yearsTotal: null,
      seniority: null,
    },
  })
  assert.match(out, /✅ 2 de 3 skills batem/)
})

test("Plus #5: skills faltantes aparecem em Para destacar", () => {
  const job = { ...FIXED_JOB, skills: ["Go", "Rust"] }
  const out = formatJobMessage(job, "x", {
    subscriberResume: {
      skills: ["Node.js"],
      yearsTotal: null,
      seniority: null,
    },
  })
  assert.match(out, /🟡 \*Para destacar\*/)
  assert.match(out, /⚠️ Faltam: Go, Rust/)
})

test("Plus #5: anos do curriculo >= exigido -> entra em Pontos fortes", () => {
  const job = {
    ...FIXED_JOB,
    description: "Buscamos pessoa com 3+ anos de experiencia em backend",
  }
  const out = formatJobMessage(job, "x", {
    subscriberResume: { skills: [], yearsTotal: 5, seniority: null },
  })
  assert.match(out, /✅ 5 anos de experiência \(vaga pede 3\+\)/)
})

test("Plus #5: anos do curriculo < exigido -> gap em Para destacar", () => {
  const job = {
    ...FIXED_JOB,
    description: "Necessario minimo 5 anos de experiencia",
  }
  const out = formatJobMessage(job, "x", {
    subscriberResume: { skills: [], yearsTotal: 2, seniority: null },
  })
  assert.match(out, /⚠️ Vaga pede 5\+ anos — você tem ~2 \(gap de 3\)/)
})

test("Plus #5: senioridade bate -> Pontos fortes", () => {
  const job = { ...FIXED_JOB, title: "Senior Backend Engineer", description: "" }
  const out = formatJobMessage(job, "x", {
    subscriberResume: { skills: [], yearsTotal: null, seniority: "senior" },
  })
  assert.match(out, /✅ Senioridade senior bate com a vaga/)
})

test("Plus #5: candidato pleno em vaga senior -> gap", () => {
  const job = { ...FIXED_JOB, title: "Senior Developer", description: "" }
  const out = formatJobMessage(job, "x", {
    subscriberResume: { skills: [], yearsTotal: null, seniority: "pleno" },
  })
  assert.match(out, /⚠️ Vaga é senior — seu nível indica pleno/)
})

test("Plus #5: candidato senior em vaga pleno -> overqualified", () => {
  const job = { ...FIXED_JOB, title: "Desenvolvedor Pleno", description: "" }
  const out = formatJobMessage(job, "x", {
    subscriberResume: { skills: [], yearsTotal: null, seniority: "senior" },
  })
  assert.match(out, /✅ Você é senior — vaga pede pleno/)
})

test("Plus #5: score numerico NUNCA aparece no texto WhatsApp", () => {
  const job = {
    ...FIXED_JOB,
    title: "Senior Backend Developer",
    description: "5+ anos Node.js",
    skills: ["Node.js"],
  }
  const out = formatJobMessage(job, "x", {
    subscriberResume: {
      skills: ["Node.js"],
      yearsTotal: 6,
      seniority: "senior",
    },
  })
  // v3.10.31: score 0-100 fica apenas no dashboard. WhatsApp nunca exibe.
  assert.doesNotMatch(out, /\b\d{1,3}\/100\b/)
  assert.doesNotMatch(out, /Score:/i)
})

test("Plus #5: sem subscriberResume -> bloco nao aparece", () => {
  const job = { ...FIXED_JOB, title: "Senior Dev", description: "5+ anos" }
  const out = formatJobMessage(job, "x")
  assert.doesNotMatch(out, /🎯 Match com seu perfil/)
})

test("Plus #5: resume sem dados relevantes -> bloco nao aparece", () => {
  const job = {
    ...FIXED_JOB,
    title: "Dev Junior",
    description: "Vaga aberta",
    skills: [],
    responsibilities: "",
  }
  const out = formatJobMessage(job, "x", {
    subscriberResume: { skills: [], yearsTotal: null, seniority: null },
  })
  assert.doesNotMatch(out, /🎯 Match com seu perfil/)
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
  // v3.10.31: "via Gupy" foi substituido por "Vaga capturada em [data]"
  assert.match(out, /_Vaga capturada em/)
  assert.match(out, /• Desenvolver features novas/)
  assert.match(out, /• Manter codigo legado/)
  assert.match(out, /• Code reviews/)
})

// =====================================================
// v3.10.31: modo compact (caption de imagem) + stack categorizada
// =====================================================

test("v3.10.31: modo compact omite titulo, empresa, salario e stack (vai na imagem)", () => {
  const out = formatJobMessage(FIXED_JOB, "https://son.sh/v/abc", { compact: true })
  // Header completo NAO aparece (esta na imagem)
  assert.doesNotMatch(out, /\*Desenvolvedor Pleno\*/)
  assert.doesNotMatch(out, /🏢 _Acme Corp_/)
  assert.doesNotMatch(out, /💰/)
  assert.doesNotMatch(out, /Stack da vaga/)
  // Responsabilidades + link continuam (info que NAO cabe na imagem)
  assert.match(out, /\*📋 Responsabilidades\*/)
  assert.match(out, /🔗 \*Ver a vaga:\* https:\/\/son\.sh\/v\/abc/)
  assert.match(out, /_Vaga capturada em 28\/05\/2026_/)
})

test("v3.10.31: stack categorizada agrupa por Backend/Frontend/Cloud", () => {
  const job = { ...FIXED_JOB, skills: ["Node.js", "Django", "React", "Vue", "AWS", "Docker"] }
  const out = formatJobMessage(job, "x")
  assert.match(out, /⚙️ \*Backend\*.*Node\.js.*Django/)
  assert.match(out, /🖥️ \*Frontend\*.*React.*Vue/)
  assert.match(out, /☁️ \*Cloud & DevOps\*.*AWS.*Docker/)
})

test("v3.10.31: skills sem categoria conhecida vao em 'Outras'", () => {
  const job = { ...FIXED_JOB, skills: ["XPTO", "FooBar"] }
  const out = formatJobMessage(job, "x")
  assert.match(out, /🔧 \*Outras\*.*XPTO.*FooBar/)
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

/**
 * Constroi a legenda (texto WhatsApp) da vaga e extrai os dados normalizados
 * que sao usados tanto na legenda quanto no payload enviado pro card-renderer
 * (Vercel Edge).
 *
 * Este modulo migrou de `apps/whatsapp/formatter/src/server.js` quando o
 * processo `sonnar-wa-formatter` foi removido da VPS (geracao de imagem foi
 * pra Vercel via @vercel/og). Caption e string concat puro — custo zero —
 * entao roda direto no sender, junto ao loop VIP.
 *
 * Logica preservada 1:1; so houve troca de import de codigo (era usado
 * dentro do mesmo arquivo Express, agora e funcao pura).
 */

// =====================================================
// Normalizacao de dados da vaga
// =====================================================

function normalizeAccents(value) {
  if (!value) return ""
  return value.toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
}

function separateSalaryNote(rawSalary) {
  const salaryText = rawSalary ? rawSalary.toString().trim() : ""
  if (!salaryText) {
    return { salary: salaryText, salaryNote: "" }
  }

  const match = salaryText.match(/(com base no glassdoor[\s:–—-]*)/i)
  if (match) {
    const note = match[0].trim()
    const remainder = salaryText.replace(match[0], "").trim()
    return {
      salary: remainder || salaryText,
      salaryNote: note
    }
  }

  return { salary: salaryText, salaryNote: "" }
}

function extractSourceFromUrl(url) {
  if (!url) return "via Sonar"

  const urlLower = url.toLowerCase()
  const sourceMap = {
    "linkedin.com": "LinkedIn",
    "indeed.com": "Indeed",
    "indeed.com.br": "Indeed",
    "glassdoor.com": "Glassdoor",
    "glassdoor.com.br": "Glassdoor",
    "bne.com.br": "BNE",
    "vagas.com.br": "Vagas.com",
    "catho.com.br": "Catho",
    "infojobs.com.br": "InfoJobs",
    "trampos.co": "Trampos",
    "programathor.com.br": "ProgramaThor",
    "gupy.io": "Gupy",
    "workana.com": "Workana",
    "remotar.com.br": "Remotar",
    "remoteok.com": "RemoteOK",
    "wellfound.com": "Wellfound",
    "99jobs.com": "99Jobs",
    "netvagas.com.br": "NetVagas",
    "solides.jobs": "Solides",
    "lever.co": "Lever",
    "greenhouse.io": "Greenhouse"
  }

  for (const [domain, name] of Object.entries(sourceMap)) {
    if (urlLower.includes(domain)) return `via ${name}`
  }

  try {
    const hostname = new URL(url).hostname.replace("www.", "")
    const name = hostname.split(".")[0]
    return `via ${name.charAt(0).toUpperCase() + name.slice(1)}`
  } catch {
    return "via Sonar"
  }
}

function extractJobDataFromEmbed(embed) {
  const fields = embed.fields || []

  const getFieldValue = (keys) => {
    for (const field of fields) {
      const fieldName = normalizeAccents(field?.name)
      if (!fieldName) continue
      for (const key of keys) {
        if (fieldName.includes(key)) return field?.value || null
      }
    }
    return null
  }

  const locationRaw = getFieldValue(["localidade", "localizacao", "local"]) || "Nao informado"
  const workType = getFieldValue(["modalidade", "tipo"]) || "Nao informado"
  const rawSalary = getFieldValue(["salario", "remuneracao"]) || "Nao informado"
  const { salary, salaryNote } = separateSalaryNote(rawSalary)
  const company = getFieldValue(["empresa", "company"]) || embed.author?.name || "Confidencial"

  // Limpa "Cidade - UF - Nome do Estado" -> "Cidade - UF" (sem redundancia).
  const location =
    locationRaw === "Nao informado"
      ? locationRaw
      : (locationRaw.match(/^(.+?\s-\s[A-Za-z]{2})\s-\s.+$/)?.[1] || locationRaw).trim()

  // Extrai a UF (2 letras) do fim da localizacao ja limpa.
  const ufMatch = location.match(/-\s*([A-Za-z]{2})\s*$/)
  const uf = ufMatch ? ufMatch[1].toUpperCase() : ""

  let mode = "PRESENCIAL"
  const workTypeLower = workType.toLowerCase()
  if (workTypeLower.includes("remoto")) mode = "REMOTO"
  else if (workTypeLower.includes("hibrido") || workTypeLower.includes("híbrido")) mode = "HIBRIDO"

  const title = embed.title || "Vaga"

  // Skills: prioridade pro array da API; fallback heuristico por regex no titulo.
  let skills = []
  if (Array.isArray(embed.skills) && embed.skills.length > 0) {
    skills = embed.skills
      .map((s) => (s == null ? "" : s.toString().trim()))
      .filter((s) => s.length > 0)
  } else {
    const techTags = [
      "React", "Vue", "Angular", "Node.js", "Python", "Java", "TypeScript",
      "JavaScript", "AWS", "Docker", "Kubernetes", "DevOps", "Frontend",
      "Backend", "Full Stack", "Mobile", "iOS", "Android", "Flutter",
      "PHP", "Laravel", "Django", "Spring", "Go", "Rust", "C#", ".NET",
      "SQL", "MongoDB", "PostgreSQL", "Redis", "GraphQL", "REST"
    ]
    skills = techTags.filter((tag) => title.toLowerCase().includes(tag.toLowerCase()))
    const titleLower = title.toLowerCase()
    if (skills.length < 4) {
      if (titleLower.includes("senior") || titleLower.includes("sênior") || titleLower.includes(" sr")) {
        skills.push("Senior")
      } else if (titleLower.includes("pleno")) {
        skills.push("Pleno")
      } else if (titleLower.includes("junior") || titleLower.includes("júnior") || titleLower.includes(" jr")) {
        skills.push("Junior")
      }
    }
  }

  // Card desenha no maximo 5 chips; legenda usa a lista completa.
  const tags = skills.slice(0, 5)

  const timestamp = embed.timestamp ? new Date(embed.timestamp) : new Date()
  const date = timestamp.toLocaleDateString("pt-BR")
  const time = timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

  const source = extractSourceFromUrl(embed.url)

  return {
    mode,
    uf,
    title,
    company,
    tags,
    location,
    salary,
    salaryNote,
    source,
    date,
    time,
    url: embed.url || "",
    id: embed.id || "",
    workType,
    skills,
    description: embed.description || "",
    responsibilities: embed.responsibilities || ""
  }
}

// =====================================================
// Helpers do payload enviado pelo sender (job -> embed)
// =====================================================

function parseDate(dateStr) {
  if (!dateStr) return null
  if (dateStr.includes("/")) {
    const [day, month, year] = dateStr.split("/")
    const parsed = new Date(`${year}-${month}-${day}`)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(dateStr)
  return isNaN(parsed.getTime()) ? null : parsed
}

function jobDataToEmbed(job) {
  const fields = []
  if (job.company) fields.push({ name: "Empresa", value: job.company, inline: true })
  if (job.location) fields.push({ name: "Localidade", value: job.location, inline: true })
  if (job.hiring_regime) fields.push({ name: "Regime", value: job.hiring_regime, inline: true })
  if (job.work_type) fields.push({ name: "Modalidade de Trabalho", value: job.work_type, inline: true })
  if (job.salary) fields.push({ name: "Salário", value: job.salary, inline: true })
  if (job.publication_date) fields.push({ name: "Data de Publicação", value: job.publication_date, inline: true })

  const timestamp = parseDate(job.publication_date) || new Date()

  return {
    title: job.job_title || job.title || "",
    url: job.job_url || job.url || "",
    fields,
    timestamp: timestamp.toISOString(),
    id: job.id || job.job_url || "",
    skills: Array.isArray(job.skills) ? job.skills : [],
    description: job.description || "",
    responsibilities: job.responsibilities || ""
  }
}

/**
 * Aceita varios shapes de input (embed bruto do Discord, job do core, payload
 * solto) e devolve sempre um embed com .fields — formato que extractJobDataFromEmbed
 * consome.
 */
function resolveEmbedPayload(payload) {
  const candidate = payload?.embed || payload?.job || payload
  if (!candidate) return null
  if (candidate.fields) return candidate
  return jobDataToEmbed(candidate)
}

// =====================================================
// Extracao das RESPONSABILIDADES da descricao da vaga
// =====================================================

const RESP_START = [
  "responsabilidades e atribuicoes", "responsabilidades e requisitos",
  "principais responsabilidades", "principais atividades", "suas atividades",
  "suas responsabilidades", "o que voce vai fazer", "o que voce ira fazer",
  "o seu papel no time", "seu papel", "responsabilidades", "atribuicoes",
  "atividades", "o que voce fara", "principais entregas", "principais desafios",
  "o desafio"
]
const RESP_END = [
  "requisitos", "pre-requisitos", "pre requisitos", "diferenciais", "desejavel",
  "desejaveis", "o que esperamos", "o que buscamos", "o que voce precisa",
  "o que oferecemos", "oferecemos", "beneficios", "hard skills", "soft skills",
  "qualificacoes", "salario", "remuneracao", "regime", "contratacao",
  "sobre a empresa", "sobre nos", "quem somos", "o que procuramos", "formacao"
]
const REQ_START = [
  "requisitos e qualificacoes", "requisitos obrigatorios", "requisitos tecnicos",
  "requisitos", "pre-requisitos", "pre requisitos", "qualificacoes",
  "o que buscamos", "o que esperamos", "o que esperamos de voce",
  "o que voce precisa", "o que procuramos", "hard skills", "perfil desejado",
  "o que e necessario", "o que precisamos"
]
const REQ_END = [
  "diferenciais", "desejavel", "desejaveis", "beneficios", "o que oferecemos",
  "oferecemos", "soft skills", "salario", "remuneracao", "regime",
  "contratacao", "sobre a empresa", "sobre nos"
]
const MAX_BULLETS = 10
const MAX_BULLET_LEN = 220

function normHeader(line) {
  return (line || "")
    .toString()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/^[^a-z0-9]+/, "")
    .replace(/:+\s*$/, "").trim()
}

function isRespHeader(line, headers) {
  const n = normHeader(line)
  if (!n || n.length > 70) return false
  return headers.some((h) => n === h || n.startsWith(`${h} `) || n.startsWith(`${h}:`))
}

function splitRespItems(chunkLines) {
  let items = []
  const semicolons = (chunkLines[0]?.match(/;/g) || []).length
  if (chunkLines.length === 1 && chunkLines[0].includes(",") && semicolons <= 1) {
    items = chunkLines[0].split(/[;,]/)
  } else {
    for (const c of chunkLines) {
      items.push(...(c.includes(";") ? c.split(";") : [c]))
    }
  }
  return items
    .map((x) => x.replace(/^[\-•*\s]+/, "").replace(/[\s;.]+$/, "").trim())
    .filter((x) => x.length >= 4 && x.length <= MAX_BULLET_LEN)
}

function sliceSection(lines, startHeaders, endHeaders) {
  const startIdx = lines.findIndex((l) => isRespHeader(l, startHeaders))
  if (startIdx === -1) return null
  const chunk = []
  for (const l of lines.slice(startIdx + 1)) {
    if (isRespHeader(l, endHeaders) || isRespHeader(l, startHeaders)) break
    chunk.push(l)
  }
  return chunk.length ? chunk : null
}

/**
 * Mantida pra compatibilidade com vagas legado (sem responsibilities pre-extraido
 * no banco). Pipeline novo do scraper ja preenche, mas durante o periodo de
 * transicao algumas engines podem ainda emitir vazio. Quando todas estiverem
 * em prod com responsibilities, podemos remover.
 *
 * @returns {{ kind: "resp"|"req", bullets: string[] } | { kind: "text", text: string } | null}
 */
// eslint-disable-next-line no-unused-vars
function extractResponsibilitiesFromDescription(raw) {
  const lines = (raw || "")
    .toString().replace(/\r/g, "").split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  if (!lines.length) return null

  let chunk = sliceSection(lines, RESP_START, RESP_END)
  if (chunk) {
    const items = splitRespItems(chunk)
    if (items.length) return { kind: "resp", bullets: items.slice(0, MAX_BULLETS) }
  }

  chunk = sliceSection(lines, REQ_START, REQ_END)
  if (chunk) {
    const items = splitRespItems(chunk)
    if (items.length) return { kind: "req", bullets: items.slice(0, MAX_BULLETS) }
  }

  let best = []
  let cur = []
  for (const l of lines) {
    if (l.endsWith(";")) {
      cur.push(l)
    } else {
      if (cur.length > best.length) best = cur
      cur = []
    }
  }
  if (cur.length > best.length) best = cur
  if (best.length >= 3) {
    const items = splitRespItems(best)
    if (items.length) return { kind: "resp", bullets: items.slice(0, MAX_BULLETS) }
  }

  const intro = lines.join(" ")
  if (!intro) return null
  const MAX_SUMMARY_LEN = 320
  if (intro.length <= MAX_SUMMARY_LEN) return { kind: "text", text: intro }
  return { kind: "text", text: `${intro.slice(0, MAX_SUMMARY_LEN).replace(/\s+\S*$/, "")}…` }
}

/**
 * Formata texto de responsibilities pre-extraido pra exibicao na legenda.
 */
function appendResponsibilitiesBlock(out, text) {
  if (!text) return
  let lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2 && (text.match(/;/g) || []).length >= 2) {
    lines = text.split(";").map((l) => l.trim()).filter(Boolean)
  }
  const MAX = 8
  lines = lines.slice(0, MAX)
  if (lines.length > 1) {
    for (const line of lines) {
      const clean = line.replace(/^[-•*●▪]\s*/, "")
      out.push(`• ${clean}`)
    }
  } else {
    const text1 = lines[0] || text
    out.push(text1.length > 400 ? text1.slice(0, 400).replace(/\s+\S*$/, "") + "…" : text1)
  }
}

/**
 * Monta a legenda enviada junto da imagem.
 * Ordem: titulo, empresa, localizacao, modalidade, skills e responsabilidades.
 * Salario e regime ficam apenas no card (imagem).
 */
function formatCaption(jobData, shortUrl) {
  const out = []

  out.push(`*${jobData.title}*`)
  if (jobData.company) out.push(`🏢 _${jobData.company}_`)
  if (jobData.location && jobData.location !== "Nao informado") {
    out.push(`📍 ${jobData.location}`)
  }
  if (jobData.workType && jobData.workType !== "Nao informado") {
    out.push(`💼 ${jobData.workType}`)
  }

  const skills = Array.isArray(jobData.skills) ? jobData.skills : []
  if (skills.length) {
    out.push("")
    out.push("*🧩 Tecnologias*")
    out.push(skills.join("  •  "))
  }

  // v3.0.0: usa responsibilities pre-extraido no banco. Se nao vier preenchido,
  // NAO mostra bloco — politica de produto: melhor card sem corpo que com info
  // errada.
  const preExtracted = (jobData.responsibilities || "").toString().trim()
  if (preExtracted) {
    out.push("")
    out.push("*📋 Responsabilidades*")
    appendResponsibilitiesBlock(out, preExtracted)
  }

  out.push("")
  out.push(`🔗 *Ver a vaga:* ${shortUrl}`)

  return out.join("\n")
}

export {
  extractJobDataFromEmbed,
  resolveEmbedPayload,
  formatCaption,
}

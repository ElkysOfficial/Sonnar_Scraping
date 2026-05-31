/**
 * Monta a mensagem de texto puro enviada como vaga no WhatsApp.
 *
 * Substituiu o pipeline antigo de imagem (`sonnar-wa-formatter` rodando
 * @napi-rs/canvas) na v3.6.0 — a entrega virou texto-only para zerar custo
 * de CPU/RAM da rasterizacao (ADR-006). Toda informacao que antes vivia
 * no card 1080x1080 (salario, fonte, data, modalidade, location) agora
 * aparece no proprio texto.
 *
 * Logica portada de `apps/whatsapp/formatter/src/services/cardGenerator.js`
 * (extracao de dados) + `apps/whatsapp/formatter/src/server.js` (caption +
 * extracao de responsabilidades) sem mudanca de comportamento.
 */

// =====================================================
// Normalizacao de dados
// =====================================================

function normalizeAccents(value) {
  if (!value) return ""
  return value.toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
}

function separateSalaryNote(rawSalary) {
  const salaryText = rawSalary ? rawSalary.toString().trim() : ""
  if (!salaryText) return { salary: "", salaryNote: "" }

  const match = salaryText.match(/(com base no glassdoor[\s:–—-]*)/i)
  if (match) {
    const note = match[0].trim()
    const remainder = salaryText.replace(match[0], "").trim()
    return { salary: remainder || salaryText, salaryNote: note }
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
  if (job.company) fields.push({ name: "Empresa", value: job.company })
  if (job.location) fields.push({ name: "Localidade", value: job.location })
  if (job.hiring_regime) fields.push({ name: "Regime", value: job.hiring_regime })
  if (job.work_type) fields.push({ name: "Modalidade de Trabalho", value: job.work_type })
  if (job.salary) fields.push({ name: "Salário", value: job.salary })
  if (job.publication_date) fields.push({ name: "Data de Publicação", value: job.publication_date })

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

function resolveEmbedPayload(payload) {
  const candidate = payload?.embed || payload?.job || payload
  if (!candidate) return null
  if (candidate.fields) return candidate
  return jobDataToEmbed(candidate)
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
  const rawSalary = getFieldValue(["salario", "remuneracao"]) || ""
  const { salary, salaryNote } = separateSalaryNote(rawSalary)
  const company = getFieldValue(["empresa", "company"]) || embed.author?.name || "Confidencial"

  const location =
    locationRaw === "Nao informado"
      ? locationRaw
      : (locationRaw.match(/^(.+?\s-\s[A-Za-z]{2})\s-\s.+$/)?.[1] || locationRaw).trim()

  const title = embed.title || "Vaga"

  let skills = []
  if (Array.isArray(embed.skills) && embed.skills.length > 0) {
    skills = embed.skills
      .map((s) => (s == null ? "" : s.toString().trim()))
      .filter((s) => s.length > 0)
  }

  const timestamp = embed.timestamp ? new Date(embed.timestamp) : new Date()
  const date = timestamp.toLocaleDateString("pt-BR")
  const time = timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

  return {
    title,
    company,
    location,
    workType,
    salary,
    salaryNote,
    skills,
    source: extractSourceFromUrl(embed.url),
    date,
    time,
    url: embed.url || "",
    id: embed.id || "",
    description: embed.description || "",
    responsibilities: embed.responsibilities || ""
  }
}

// =====================================================
// Plus #5 (v3.8.x): bloco de breakdown comparativo (curriculo vs vaga).
// Sem LLM. Usa subscriberResume + jobRequirementsParser.
// =====================================================

import {
  extractJobRequirements,
  compareSeniority,
  categorizeSkills,
} from "./jobRequirementsParser.js"
import { calculateMatch } from "./matchCalculator.js"

function appendResumeBreakdown(out, jobData, resume) {
  if (!resume) return

  const match = calculateMatch(jobData, resume)
  const { strong, gaps } = match

  if (strong.length === 0 && gaps.length === 0) return

  const SEP = "━━━━━━━━━━━━━━━━━━━━"
  out.push("")
  out.push(SEP)
  out.push("*🎯 Match com seu perfil*")

  if (strong.length > 0) {
    out.push("")
    out.push("🟢 *Pontos fortes*")
    for (const s of strong) out.push(`✅ ${s}`)
  }

  if (gaps.length > 0) {
    out.push("")
    out.push("🟡 *Para destacar*")
    for (const g of gaps) out.push(`⚠️ ${g}`)
  }
}

/**
 * Bloco de stack categorizada (Backend / Frontend / Cloud / etc).
 * Quando subscriberStack e passado, anota ✅/❌ em cada skill.
 */
function appendCategorizedStack(out, skills, subscriberStack) {
  if (!Array.isArray(skills) || skills.length === 0) return
  const SEP = "━━━━━━━━━━━━━━━━━━━━"
  const categories = categorizeSkills(skills)
  if (categories.length === 0) return

  out.push("")
  out.push(SEP)
  out.push("*Stack da vaga*")
  out.push("")

  const stackSet = Array.isArray(subscriberStack) && subscriberStack.length > 0
    ? new Set(subscriberStack.map((s) => String(s).toLowerCase().trim()).filter(Boolean))
    : null

  const norm = (s) => String(s).toLowerCase().trim()

  for (const cat of categories) {
    const items = stackSet
      ? cat.items.map((s) => `${stackSet.has(norm(s)) ? "✅" : "❌"} ${s}`)
      : cat.items
    out.push(`${cat.emoji} *${cat.label}*  ${items.join(" · ")}`)
  }
}

// =====================================================
// Bloco de responsabilidades (texto pre-extraido)
// =====================================================

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

// =====================================================
// Render principal: vaga -> mensagem WhatsApp (texto puro)
// =====================================================

/**
 * Monta o corpo de texto da vaga (sem imagem). Layout:
 *
 *   *Titulo*
 *   🏢 _Empresa_
 *   📍 Cidade - UF
 *   💼 Modalidade
 *   💰 Salario (se houver)
 *
 *   *🧩 Tecnologias*
 *   Skill 1  •  Skill 2  •  ...
 *
 *   *📋 Responsabilidades*
 *   • bullet 1
 *   • bullet 2
 *
 *   🔗 *Ver a vaga:* <link encurtado>
 *   _via LinkedIn · 28/05/2026 14:30_
 *
 * v3.7.0 (Plus #1): quando `options.subscriberStack` e passado, cada skill
 * da vaga e marcada com ✅ (esta no stack) ou ❌ (nao esta).
 *
 * v3.8.x (Plus #5): quando `options.subscriberResume` e passado, adiciona
 * o bloco "🎯 Comparado com seu curriculo".
 *
 * v3.9.0 (redesign visual): emojis ✅/❌/⚠️ unificados, separadores horizontais
 * pra organizar blocos, hierarquia de typography mais clara, linha "Match: X
 * de Y skills (Z%)" REMOVIDA (informacao redundante — cada skill marcada
 * individualmente ja comunica isso visualmente).
 *
 * @param {object} jobData - dados normalizados da vaga
 * @param {string} shortUrl - link encurtado da vaga
 * @param {object} [options]
 * @param {string[]} [options.subscriberStack]
 * @param {object} [options.subscriberResume]
 */
function formatJobMessage(jobData, shortUrl, options = {}) {
  const out = []
  const SEP = "━━━━━━━━━━━━━━━━━━━━"
  const compact = options.compact === true

  // ─── CABECALHO (omitido em compact — vai na imagem) ───
  if (!compact) {
    out.push(`*${jobData.title}*`)
    if (jobData.company) out.push(`🏢 _${jobData.company}_`)
    if (jobData.location && jobData.location !== "Nao informado") {
      out.push(`📍 ${jobData.location}`)
    }
    if (jobData.workType && jobData.workType !== "Nao informado") {
      out.push(`💼 ${jobData.workType}`)
    }
    if (jobData.salary) {
      const salaryLine = jobData.salaryNote
        ? `💰 *${jobData.salary}* _(${jobData.salaryNote})_`
        : `💰 *${jobData.salary}*`
      out.push(salaryLine)
    }
  }

  // ─── BLOCO: STACK CATEGORIZADA (omitido em compact — vai na imagem) ───
  const skills = Array.isArray(jobData.skills) ? jobData.skills : []
  if (!compact && skills.length) {
    appendCategorizedStack(out, skills, options.subscriberStack)
  }

  // ─── BLOCO: RESPONSABILIDADES (SEMPRE — info nao cabe na imagem) ───
  const preExtracted = (jobData.responsibilities || "").toString().trim()
  if (preExtracted) {
    if (compact) {
      out.push("*📋 Responsabilidades*")
    } else {
      out.push("")
      out.push(SEP)
      out.push("*📋 Responsabilidades*")
    }
    out.push("")
    appendResponsibilitiesBlock(out, preExtracted)
  }

  // ─── BLOCO: COMPARACAO COM CURRICULO (apenas privado/Plus) ───
  if (options.subscriberResume) {
    appendResumeBreakdown(out, jobData, options.subscriberResume)
  }

  // ─── RODAPE: link + data de captura ───
  out.push("")
  out.push(SEP)
  out.push("")
  out.push(`🔗 *Ver a vaga:* ${shortUrl}`)

  if (jobData.date) {
    out.push(`_Vaga capturada em ${jobData.date}_`)
  }

  return out.join("\n")
}

export {
  extractJobDataFromEmbed,
  resolveEmbedPayload,
  formatJobMessage,
}

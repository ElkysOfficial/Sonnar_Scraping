import { renderJobCard } from "./renderJobCard.js"

const SHORTENER_ENDPOINT = "https://cleanuri.com/api/v1/shorten"
const shortUrlCache = new Map()

const normalizeKeyName = (value) => {
  if (!value) {
    return ""
  }
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

const getFieldValue = (fields, keywords) => {
  if (!fields) {
    return null
  }
  for (const field of fields) {
    const name = normalizeKeyName(field?.name)
    if (!name) {
      continue
    }
    for (const key of keywords) {
      if (name.includes(key)) {
        return field?.value?.toString().trim() || null
      }
    }
  }
  return null
}

const parseTags = (value) => {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value.map((item) => item?.toString().trim()).filter(Boolean)
  }
  return value
    .toString()
    .split(/[·•,|;]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

const formatTimeLabel = (input) => {
  if (!input) {
    return ""
  }
  const date = new Date(input)
  if (Number.isNaN(date)) {
    return ""
  }
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo"
  })
}

const formatDateLabel = (input) => {
  if (!input) {
    return ""
  }
  const date = new Date(input)
  if (Number.isNaN(date)) {
    return ""
  }
  return date.toLocaleDateString("pt-BR")
}

const extractRegion = (location) => {
  if (!location) {
    return ""
  }
  const parts = location.split("-").map((part) => part.trim()).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || ""
}

const getSourceName = (job) => {
  if (job.source?.name) return job.source.name
  if (job.footer?.text) return job.footer.text
  if (job.author?.name) return job.author.name
  const url = job.url || job.job_url || job.link
  if (url) {
    try {
      const hostname = new URL(url).hostname
      return hostname.replace(/^www\\./, "")
    } catch {
      // ignore parse errors
    }
  }
  return "Sonnar"
}

const buildCaption = (info, shortLink) => {
  const lines = []
  if (info.mode && info.uf) lines.push(`${info.mode} · ${info.uf}`)
  else if (info.mode) lines.push(info.mode)
  if (info.title) lines.push(info.title)
  if (info.company) lines.push(info.company)
  if (info.tags && info.tags.length) lines.push(info.tags.join(" · "))
  if (info.location && info.salary) lines.push(`${info.location} · ${info.salary}`)
  const link = shortLink || info.jobUrl
  if (link) lines.push(`Ver vaga completa: ${link}`)
  const footerParts = []
  if (info.sourceName) footerParts.push(info.sourceName)
  if (info.time) footerParts.push(info.time)
  if (footerParts.length) lines.push(`via ${footerParts.join(" · ")}`)
  return lines.filter(Boolean).join("\n")
}

const shortenUrl = async (url) => {
  if (!url) return ""
  if (shortUrlCache.has(url)) return shortUrlCache.get(url)
  try {
    const response = await fetch(SHORTENER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ url })
    })
    if (!response.ok) throw new Error(`Status ${response.status}`)
    const data = await response.json()
    const short = data.result_url || data.shortenedUrl
    if (short) {
      shortUrlCache.set(url, short)
      return short
    }
  } catch (err) {
    console.error("[CARD API] Shortener error", err)
  }
  shortUrlCache.set(url, url)
  return url
}

const buildJobInfo = (job) => {
  const fields = job.fields || []
  const title = job.title || job.job_title || "Vaga"
  const company =
    getFieldValue(fields, ["empresa", "company", "contratante"]) ||
    job.company ||
    job.author?.name ||
    "Sonnar"
  const locationRaw =
    getFieldValue(fields, ["localidade", "localizacao", "local", "cidade"]) ||
    job.location ||
    "Local não informado"
  const region = extractRegion(locationRaw) || job.uf || "BR"
  const mode =
    (getFieldValue(fields, ["modalidade", "tipo", "jornada", "regime"]) ||
      job.mode ||
      job.work_type ||
      "Presencial").toUpperCase()
  const salary =
    getFieldValue(fields, ["salario", "remuneracao", "faixa salarial", "valor"]) ||
    job.salary ||
    "A combinar"
  const tagsValue =
    getFieldValue(fields, ["tecnologia", "tecnologias", "stack", "skills", "habilidades"]) ||
    job.tags ||
    job.stack ||
    ""
  const tags = parseTags(tagsValue)
  const time = formatTimeLabel(job.timestamp || job.time || job.updated_at)
  const date = formatDateLabel(job.timestamp || job.date || job.publication_date)

  return {
    mode,
    uf: region,
    title,
    company,
    tags,
    location: locationRaw,
    salary,
    sourceName: getSourceName(job),
    time,
    date,
    jobUrl: job.url || job.job_url || job.link || job.jobUrl || ""
  }
}

export async function buildWhatsAppPayload(job) {
  const info = buildJobInfo(job)
  let shortLink = job.shortUrl || ""
  if (!shortLink && info.jobUrl) {
    shortLink = await shortenUrl(info.jobUrl)
  }
  const buffer = await renderJobCard({
    mode: info.mode,
    uf: info.uf,
    title: info.title,
    company: info.company,
    tags: info.tags,
    location: info.location,
    salary: info.salary,
    source: info.sourceName,
    date: info.date,
    time: info.time
  })
  return {
    caption: buildCaption(info, shortLink),
    buffer,
    shortLink: shortLink || info.jobUrl,
    info
  }
}

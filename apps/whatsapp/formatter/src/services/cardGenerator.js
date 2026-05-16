/**
 * Sonar Job Card Generator — 1080x1080 Premium
 * Clean, professional job cards with adaptive typography
 *
 * Design principles:
 * - Title never cuts with "..." - auto-resize or wrap to 2 lines
 * - Consistent spacing grid (8/16/24/32)
 * - Premium gradient background with subtle vignette
 * - High contrast, SaaS aesthetic
 * - No neon, minimal shadows
 *
 * @napi-rs/canvas based
 */

import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ASSETS_DIR = path.resolve(__dirname, "..", "..", "assets")
const FONTS_DIR = path.resolve(ASSETS_DIR, "fonts")
const PIN_ICON_PATH = path.resolve(ASSETS_DIR, "icons", "pin.png")

// Register fonts
try {
  const fonts = ["Inter-Regular.ttf", "Inter-Medium.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf"]
  for (const font of fonts) {
    const fontPath = path.join(FONTS_DIR, font)
    if (fs.existsSync(fontPath)) {
      GlobalFonts.registerFromPath(fontPath, "Inter")
    }
  }
} catch (err) {
  console.warn("Inter fonts not found. Using system fallback.", err.message)
}

// Canvas dimensions
const W = 1080
const H = 1080

// Spacing grid (8px base)
const GRID = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
  xxl: 64,
}

// Layout
const PAD_X = 72
const PAD_TOP = 56
const PAD_BOTTOM = 48
const CONTENT_WIDTH = W - PAD_X * 2

// Colors (premium palette)
const COLORS = {
  // Background gradient
  bgDark: "#061520",
  bgMid: "#0A2540",
  bgLight: "#0D4880",

  // Text
  white: "#FFFFFF",
  textPrimary: "rgba(255,255,255,0.95)",
  textSecondary: "rgba(255,255,255,0.75)",
  textMuted: "rgba(255,255,255,0.55)",

  // UI elements
  accent: "#60A5FA",
  accentSoft: "rgba(96,165,250,0.15)",
  border: "rgba(255,255,255,0.08)",
  chipBg: "rgba(255,255,255,0.04)",
  chipBorder: "rgba(255,255,255,0.08)",
}

// ============ Typography Helpers ============

function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
}

function measureText(ctx, text, weight, size) {
  setFont(ctx, weight, size)
  return ctx.measureText(text).width
}

/**
 * Calculate optimal font size for title to fit in maxWidth
 * Returns { fontSize, lines } where lines is array of strings
 */
function calculateTitleLayout(ctx, text, maxWidth, maxFontSize = 72, minFontSize = 42) {
  // Try single line with decreasing font sizes
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 2) {
    setFont(ctx, "600", fontSize)
    const width = ctx.measureText(text).width
    if (width <= maxWidth) {
      return { fontSize, lines: [text], lineHeight: fontSize * 1.1 }
    }
  }

  // If single line doesn't work, try 2 lines with optimal font size
  for (let fontSize = maxFontSize - 8; fontSize >= minFontSize; fontSize -= 2) {
    setFont(ctx, "600", fontSize)
    const words = text.split(" ")
    const lines = []
    let currentLine = ""

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const width = ctx.measureText(testLine).width

      if (width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)

    // Accept if we have 2 lines or less
    if (lines.length <= 2) {
      // Verify all lines fit
      const allFit = lines.every(line => ctx.measureText(line).width <= maxWidth)
      if (allFit) {
        return { fontSize, lines, lineHeight: fontSize * 1.12 }
      }
    }
  }

  // Fallback: force 2 lines at minimum size
  setFont(ctx, "600", minFontSize)
  const words = text.split(" ")
  const midPoint = Math.ceil(words.length / 2)
  const line1 = words.slice(0, midPoint).join(" ")
  const line2 = words.slice(midPoint).join(" ")

  return {
    fontSize: minFontSize,
    lines: [line1, line2].filter(l => l),
    lineHeight: minFontSize * 1.12
  }
}

function drawTextWithTracking(ctx, text, x, y, tracking = 0) {
  if (tracking === 0) {
    ctx.fillText(text, x, y)
    return ctx.measureText(text).width
  }

  let cx = x
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + tracking
  }
  return cx - x
}

// ============ Background ============

function drawBackground(ctx) {
  // Main gradient (dark to lighter blue)
  const mainGradient = ctx.createLinearGradient(0, 0, W * 0.3, H)
  mainGradient.addColorStop(0, COLORS.bgDark)
  mainGradient.addColorStop(0.5, COLORS.bgMid)
  mainGradient.addColorStop(1, COLORS.bgLight)
  ctx.fillStyle = mainGradient
  ctx.fillRect(0, 0, W, H)

  // Subtle radial highlight (top-left)
  const highlight = ctx.createRadialGradient(W * 0.15, H * 0.1, 0, W * 0.15, H * 0.1, W * 0.8)
  highlight.addColorStop(0, "rgba(96,165,250,0.12)")
  highlight.addColorStop(1, "rgba(96,165,250,0)")
  ctx.fillStyle = highlight
  ctx.fillRect(0, 0, W, H)

  // Vignette (edges darker)
  const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.85)
  vignette.addColorStop(0, "rgba(0,0,0,0)")
  vignette.addColorStop(1, "rgba(0,0,0,0.35)")
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)

  // Very subtle diagonal pattern
  ctx.save()
  ctx.globalAlpha = 0.008
  ctx.strokeStyle = "rgba(255,255,255,0.5)"
  ctx.lineWidth = 1
  for (let i = -H; i < W + H; i += 48) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + H, H)
    ctx.stroke()
  }
  ctx.restore()

  // Minimal grain texture
  ctx.save()
  ctx.globalAlpha = 0.025
  for (let i = 0; i < 8000; i++) {
    const x = (Math.random() * W) | 0
    const y = (Math.random() * H) | 0
    const v = 128 + ((Math.random() * 127) | 0)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.restore()
}

// ============ UI Components ============

function drawBrandLogo(ctx, x, y) {
  const radius = 14

  // Glow effect
  const glow = ctx.createRadialGradient(x + radius, y + radius, 0, x + radius, y + radius, radius * 3)
  glow.addColorStop(0, "rgba(96,165,250,0.2)")
  glow.addColorStop(1, "rgba(96,165,250,0)")
  ctx.fillStyle = glow
  ctx.fillRect(x - 30, y - 30, 100, 100)

  // Circle
  const gradient = ctx.createLinearGradient(x, y, x + radius * 2, y + radius * 2)
  gradient.addColorStop(0, "#FFFFFF")
  gradient.addColorStop(1, "#C5E1FF")
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2)
  ctx.fill()

  // "S" letter
  setFont(ctx, "700", 14)
  ctx.fillStyle = COLORS.bgDark
  const s = "S"
  const sw = ctx.measureText(s).width
  ctx.fillText(s, x + radius - sw / 2, y + radius - 7)

  // "SONNAR" text
  setFont(ctx, "700", 22)
  ctx.fillStyle = COLORS.white
  drawTextWithTracking(ctx, "SONNAR", x + radius * 2 + 12, y + 2, 1)
}

function drawModeLabel(ctx, mode, uf, xRight, y) {
  const text = uf ? `${mode} · ${uf}` : mode
  setFont(ctx, "600", 16)
  const textWidth = ctx.measureText(text).width

  const padX = 14
  const padY = 10
  const height = 36
  const radius = 10
  const boxX = xRight - textWidth - padX * 2

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.2)"
  ctx.beginPath()
  ctx.roundRect(boxX, y, textWidth + padX * 2, height, radius)
  ctx.fill()

  // Border
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 1
  ctx.stroke()

  // Text
  ctx.fillStyle = COLORS.accent
  ctx.fillText(text, boxX + padX, y + padY + 1)
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return []

  const words = text.split(/\s+/)
  const lines = []
  let current = ""

  for (const word of words) {
    const testLine = current ? `${current} ${word}` : word
    const width = ctx.measureText(testLine).width
    if (width <= maxWidth || !current) {
      current = testLine
    } else {
      lines.push(current)
      current = word
    }
  }

  if (current) lines.push(current)
  return lines
}

function drawSalaryBlock(ctx, salary, xRight, y, note = "") {
  const salaryText = salary ? salary.trim() : ""
  const noteText = note ? note.trim() : ""
  if (!salaryText && !noteText) return 0

  const label = "Faixa salarial"
  const padX = 18
  const padY = 14
  const gap = 8
  const noteFontSize = noteText ? 16 : 0
  const noteLineHeight = noteText ? noteFontSize * 1.2 : 0
  const noteMaxWidth = CONTENT_WIDTH * 0.45

  setFont(ctx, "500", 16)
  const labelWidth = ctx.measureText(label).width

  setFont(ctx, "700", 28)
  const valueWidth = salaryText ? ctx.measureText(salaryText).width : 0

  setFont(ctx, "400", noteFontSize)
  const noteLines = noteText ? wrapText(ctx, noteText, noteMaxWidth) : []
  const noteLineWidths = noteLines.map((line) => ctx.measureText(line).width)
  const longestNoteLine = noteLineWidths.length ? Math.max(...noteLineWidths) : 0

  const innerWidth = Math.max(labelWidth, valueWidth, longestNoteLine)
  const blockWidth = innerWidth + padX * 2
  const valueHeight = salaryText ? 28 : 0
  const noteHeight = noteLines.length ? noteLines.length * noteLineHeight + GRID.xs : 0
  const blockHeight =
    padY * 2 +
    16 +
    (salaryText ? gap + valueHeight : 0) +
    (noteLines.length ? noteHeight : 0)
  const boxX = xRight - blockWidth

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.18)"
  ctx.beginPath()
  ctx.roundRect(boxX, y, blockWidth, blockHeight, 14)
  ctx.fill()

  // Border
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 1
  ctx.stroke()

  // Label
  setFont(ctx, "500", 16)
  ctx.fillStyle = COLORS.textSecondary
  ctx.fillText(label, boxX + padX, y + padY)

  // Value
  if (salaryText) {
    setFont(ctx, "700", 28)
    ctx.fillStyle = COLORS.white
    ctx.fillText(salaryText, boxX + padX, y + padY + 16 + gap)
  }

  if (noteLines.length) {
    setFont(ctx, "400", noteFontSize)
    ctx.fillStyle = COLORS.textSecondary
    let noteY = y + padY + 16 + gap + 28 + GRID.xs
    for (const line of noteLines) {
      ctx.fillText(line, boxX + padX, noteY)
      noteY += noteLineHeight
    }
  }

  return blockHeight
}

function drawChips(ctx, tags, x, y, maxWidth) {
  if (!tags || tags.length === 0) return y

  const fontSize = 17
  const padX = 14
  const padY = 9
  const height = fontSize + padY * 2
  const gapX = 10
  const radius = 10

  let cx = x
  let rowY = y

  for (const tag of tags.slice(0, 5)) {
    setFont(ctx, "500", fontSize)
    const textWidth = ctx.measureText(tag).width
    const chipWidth = textWidth + padX * 2

    // Wrap to next row if needed
    if (cx + chipWidth > x + maxWidth && cx > x) {
      cx = x
      rowY += height + 10
    }

    // Background
    ctx.fillStyle = COLORS.chipBg
    ctx.beginPath()
    ctx.roundRect(cx, rowY, chipWidth, height, radius)
    ctx.fill()

    // Border
    ctx.strokeStyle = COLORS.chipBorder
    ctx.lineWidth = 1
    ctx.stroke()

    // Text
    ctx.fillStyle = COLORS.textSecondary
    ctx.fillText(tag, cx + padX, rowY + padY)

    cx += chipWidth + gapX
  }

  return rowY + height
}

async function loadPinIcon() {
  try {
    if (!fs.existsSync(PIN_ICON_PATH)) return null
    return await loadImage(PIN_ICON_PATH)
  } catch {
    return null
  }
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

// ============ Data Extraction ============

export function extractJobDataFromEmbed(embed) {
  const fields = embed.fields || []

  const normalize = (value) => {
    if (!value) return ""
    return value.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
  }

  const getFieldValue = (keys) => {
    for (const field of fields) {
      const fieldName = normalize(field?.name)
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

  // Extract UF
  const ufMatch = locationRaw.match(/\s*-\s*([A-Z]{2})\s*$/i)
  const uf = ufMatch ? ufMatch[1].toUpperCase() : ""

  // Determine work mode
  let mode = "PRESENCIAL"
  const workTypeLower = workType.toLowerCase()
  if (workTypeLower.includes("remoto")) mode = "REMOTO"
  else if (workTypeLower.includes("hibrido") || workTypeLower.includes("híbrido")) mode = "HIBRIDO"

  // Extract tags
  const title = embed.title || "Vaga"

  // Preferência 1: skills vindo da API (array de strings, autoritativo)
  // Fallback: heurística por regex no título (comportamento legado)
  let tags = []
  if (Array.isArray(embed.skills) && embed.skills.length > 0) {
    tags = embed.skills
      .map((s) => (s == null ? "" : s.toString().trim()))
      .filter((s) => s.length > 0)
      .slice(0, 5)
  } else {
    const techTags = [
      "React", "Vue", "Angular", "Node.js", "Python", "Java", "TypeScript",
      "JavaScript", "AWS", "Docker", "Kubernetes", "DevOps", "Frontend",
      "Backend", "Full Stack", "Mobile", "iOS", "Android", "Flutter",
      "PHP", "Laravel", "Django", "Spring", "Go", "Rust", "C#", ".NET",
      "SQL", "MongoDB", "PostgreSQL", "Redis", "GraphQL", "REST"
    ]

    tags = techTags.filter(tag =>
      title.toLowerCase().includes(tag.toLowerCase())
    ).slice(0, 4)

    // Add seniority tag if found
    const titleLower = title.toLowerCase()
    if (tags.length < 4) {
      if (titleLower.includes("senior") || titleLower.includes("sênior") || titleLower.includes(" sr")) {
        tags.push("Senior")
      } else if (titleLower.includes("pleno")) {
        tags.push("Pleno")
      } else if (titleLower.includes("junior") || titleLower.includes("júnior") || titleLower.includes(" jr")) {
        tags.push("Junior")
      }
    }
  }

  // Timestamp
  const timestamp = embed.timestamp ? new Date(embed.timestamp) : new Date()
  const date = timestamp.toLocaleDateString("pt-BR")
  const time = timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

  // Source from URL
  const source = extractSourceFromUrl(embed.url)

  return {
    mode,
    uf,
    title,
    company,
    tags,
    location: locationRaw.trim() || locationRaw,
    salary,
    salaryNote,
    source,
    date,
    time,
    url: embed.url || "",
    id: embed.id || "",
    // Propagados para a legenda (caption). workType eh o valor cru ("Remoto",
    // "Hibrido"...); fica "Nao informado" quando a vaga nao trouxe o dado.
    workType,
    description: embed.description || ""
  }
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

// ============ Main Card Generator ============

export async function createJobCard(data) {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d", { alpha: false })
  ctx.textBaseline = "top"

  // Draw background
  drawBackground(ctx)

  let y = PAD_TOP

  // ===== TOP ROW: Brand + Mode Label =====
  drawBrandLogo(ctx, PAD_X, y)
  drawModeLabel(ctx, data.mode, data.uf, PAD_X + CONTENT_WIDTH, y)

  y += 44 + GRID.lg

  // ===== SALARY BLOCK (right aligned) =====
  const salaryHeight = drawSalaryBlock(ctx, data.salary, PAD_X + CONTENT_WIDTH, y - GRID.sm, data.salaryNote)
  const salarySpacing = salaryHeight ? salaryHeight + GRID.md : GRID.md
  y += salarySpacing

  // ===== TITLE (adaptive sizing, never cuts) =====
  const titleMaxWidth = data.salary && data.salary !== "Nao informado"
    ? CONTENT_WIDTH * 0.65
    : CONTENT_WIDTH * 0.85

  const titleLayout = calculateTitleLayout(ctx, data.title, titleMaxWidth, 68, 40)

  setFont(ctx, "600", titleLayout.fontSize)
  ctx.fillStyle = COLORS.white

  for (let i = 0; i < titleLayout.lines.length; i++) {
    ctx.fillText(titleLayout.lines[i], PAD_X, y + i * titleLayout.lineHeight)
  }

  y += titleLayout.lines.length * titleLayout.lineHeight + GRID.md

  // ===== COMPANY =====
  setFont(ctx, "400", 32)
  ctx.fillStyle = COLORS.textSecondary

  // Truncate company if too long
  let companyText = data.company
  const maxCompanyWidth = CONTENT_WIDTH * 0.75
  while (ctx.measureText(companyText).width > maxCompanyWidth && companyText.length > 10) {
    companyText = companyText.slice(0, -1)
  }
  if (companyText !== data.company) companyText += "..."

  ctx.fillText(companyText, PAD_X, y)

  y += 32 + GRID.lg

  // ===== CHIPS (tags) =====
  if (data.tags && data.tags.length > 0) {
    y = drawChips(ctx, data.tags, PAD_X, y, CONTENT_WIDTH * 0.8)
    y += GRID.lg
  }

  // ===== SEPARATOR LINE =====
  y += GRID.sm
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD_X, y)
  ctx.lineTo(PAD_X + CONTENT_WIDTH, y)
  ctx.stroke()

  y += GRID.md

  // ===== LOCATION ROW =====
  const pinIcon = await loadPinIcon()
  const iconSize = 22

  if (pinIcon) {
    ctx.save()
    ctx.globalAlpha = 0.9
    ctx.drawImage(pinIcon, PAD_X, y + 4, iconSize, iconSize)
    ctx.restore()
  }

  setFont(ctx, "600", 28)
  ctx.fillStyle = COLORS.textPrimary

  let locationText = data.location
  const maxLocationWidth = CONTENT_WIDTH * 0.7
  while (ctx.measureText(locationText).width > maxLocationWidth && locationText.length > 10) {
    locationText = locationText.slice(0, -1)
  }
  if (locationText !== data.location) locationText += "..."

  const locationX = PAD_X + (pinIcon ? iconSize + 10 : 0)
  ctx.fillText(locationText, locationX, y)

  // ===== FOOTER =====
  const footerY = H - PAD_BOTTOM - 20
  setFont(ctx, "500", 16)
  ctx.fillStyle = COLORS.textMuted

  // Left: source
  drawTextWithTracking(ctx, data.source.toLowerCase(), PAD_X, footerY, 0.8)

  // Right: date/time
  const dateTimeText = `${data.date} · ${data.time}`
  const dateTimeWidth = ctx.measureText(dateTimeText).width
  drawTextWithTracking(ctx, dateTimeText, PAD_X + CONTENT_WIDTH - dateTimeWidth, footerY, 0.8)

  return canvas.toBuffer("image/jpeg", { quality: 92 })
}

export default { createJobCard, extractJobDataFromEmbed }

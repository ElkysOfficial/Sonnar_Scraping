/**
 * Professional Logger for WhatsApp Card Generator
 * Colored terminal output with timestamps
 */

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",

  // Text colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Background colors
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
}

function getTimestamp() {
  // Data + hora no formato brasileiro (DD/MM/AAAA HH:MM:SS). new Date() segue
  // o fuso do servidor — defina America/Sao_Paulo na VPS para o horario de BR.
  const now = new Date()
  const date = now.toLocaleDateString("pt-BR")
  const time = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })
  return `${date} ${time}`
}

function formatLog(level, icon, color, message) {
  const timestamp = `${COLORS.dim}[${getTimestamp()}]${COLORS.reset}`
  const levelTag = `${color}${COLORS.bright}${icon} ${level}${COLORS.reset}`
  console.log(`${timestamp} ${levelTag} ${message}`)
}

export function infoLog(message) {
  formatLog("INFO", "ℹ", COLORS.blue, message)
}

export function successLog(message) {
  formatLog("SUCCESS", "✓", COLORS.green, message)
}

export function warningLog(message) {
  formatLog("WARN", "⚠", COLORS.yellow, message)
}

export function errorLog(message) {
  formatLog("ERROR", "✗", COLORS.red, message)
}

export function requestLog(method, path, status, duration) {
  const methodColors = {
    GET: COLORS.cyan,
    POST: COLORS.green,
    PUT: COLORS.yellow,
    DELETE: COLORS.red,
  }

  const statusColor = status >= 400 ? COLORS.red : status >= 300 ? COLORS.yellow : COLORS.green
  const methodColor = methodColors[method] || COLORS.white

  const timestamp = `${COLORS.dim}[${getTimestamp()}]${COLORS.reset}`
  const methodTag = `${methodColor}${COLORS.bright}${method.padEnd(6)}${COLORS.reset}`
  const statusTag = `${statusColor}${status}${COLORS.reset}`
  const durationTag = `${COLORS.dim}${duration}ms${COLORS.reset}`

  console.log(`${timestamp} ${methodTag} ${path} ${statusTag} ${durationTag}`)
}

export function divider(char = "═", length = 50) {
  console.log(`${COLORS.dim}${char.repeat(length)}${COLORS.reset}`)
}

export function banner(title) {
  const line = "═".repeat(50)
  console.log("")
  console.log(`${COLORS.cyan}${COLORS.bright}${line}${COLORS.reset}`)
  console.log(`${COLORS.cyan}${COLORS.bright}       ${title}${COLORS.reset}`)
  console.log(`${COLORS.cyan}${COLORS.bright}${line}${COLORS.reset}`)
  console.log("")
}

export function cardLog(jobTitle, source, action) {
  const timestamp = `${COLORS.dim}[${getTimestamp()}]${COLORS.reset}`
  const cardIcon = `${COLORS.magenta}${COLORS.bright}🎴 CARD${COLORS.reset}`
  const title = `${COLORS.white}${COLORS.bright}${jobTitle}${COLORS.reset}`
  const src = `${COLORS.cyan}${source}${COLORS.reset}`
  const act = `${COLORS.green}${action}${COLORS.reset}`

  console.log(`${timestamp} ${cardIcon} ${title} | ${src} | ${act}`)
}

export function statsLog(total, pending, sent) {
  const timestamp = `${COLORS.dim}[${getTimestamp()}]${COLORS.reset}`
  const statsIcon = `${COLORS.blue}${COLORS.bright}📊 STATS${COLORS.reset}`
  const totalTag = `${COLORS.white}Total: ${total}${COLORS.reset}`
  const pendingTag = `${COLORS.yellow}Pending: ${pending}${COLORS.reset}`
  const sentTag = `${COLORS.green}Sent: ${sent}${COLORS.reset}`

  console.log(`${timestamp} ${statsIcon} ${totalTag} | ${pendingTag} | ${sentTag}`)
}

export default {
  infoLog,
  successLog,
  warningLog,
  errorLog,
  requestLog,
  divider,
  banner,
  cardLog,
  statsLog,
}

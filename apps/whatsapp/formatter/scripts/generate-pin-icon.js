/**
 * Generate a simple location pin icon PNG
 */

import { createCanvas } from "@napi-rs/canvas"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ICONS_DIR = path.resolve(__dirname, "..", "assets", "icons")
const PIN_PATH = path.join(ICONS_DIR, "pin.png")

// Ensure directory exists
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true })
}

// Create 48x48 pin icon (will be scaled down when used)
const SIZE = 48
const canvas = createCanvas(SIZE, SIZE)
const ctx = canvas.getContext("2d")

// Clear background (transparent)
ctx.clearRect(0, 0, SIZE, SIZE)

// Draw pin shape
const cx = SIZE / 2
const cy = SIZE * 0.38

// Main pin body (tear drop shape)
ctx.fillStyle = "#60A5FA" // Blue accent color

// Draw circle top
ctx.beginPath()
ctx.arc(cx, cy, SIZE * 0.32, 0, Math.PI * 2)
ctx.fill()

// Draw triangle bottom (pointer)
ctx.beginPath()
ctx.moveTo(cx - SIZE * 0.22, cy + SIZE * 0.12)
ctx.lineTo(cx, SIZE * 0.88)
ctx.lineTo(cx + SIZE * 0.22, cy + SIZE * 0.12)
ctx.fill()

// Inner white circle
ctx.fillStyle = "#FFFFFF"
ctx.beginPath()
ctx.arc(cx, cy, SIZE * 0.14, 0, Math.PI * 2)
ctx.fill()

// Save as PNG
const buffer = canvas.toBuffer("image/png")
fs.writeFileSync(PIN_PATH, buffer)

console.log(`Pin icon generated at: ${PIN_PATH}`)

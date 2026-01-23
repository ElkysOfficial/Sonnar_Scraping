/**
 * Setup script to download required assets
 * - Inter font family
 * - Pin icon
 */

import fs from "node:fs"
import path from "node:path"
import https from "node:https"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ASSETS_DIR = path.resolve(__dirname, "..", "assets")
const FONTS_DIR = path.resolve(ASSETS_DIR, "fonts")
const ICONS_DIR = path.resolve(ASSETS_DIR, "icons")

// Inter font URLs from Google Fonts CDN
const FONT_URLS = {
  "Inter-Regular.ttf": "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.otf",
  "Inter-Medium.ttf": "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Medium.otf",
  "Inter-SemiBold.ttf": "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-SemiBold.otf",
  "Inter-Bold.ttf": "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.otf"
}

// Ensure directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    console.log(`Created directory: ${dir}`)
  }
}

// Download file
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)

    const request = (url) => {
      https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          request(response.headers.location)
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`))
          return
        }

        response.pipe(file)
        file.on("finish", () => {
          file.close()
          resolve()
        })
      }).on("error", (err) => {
        fs.unlink(dest, () => {})
        reject(err)
      })
    }

    request(url)
  })
}

// Create simple pin icon (SVG to base64 PNG workaround - just create a placeholder)
function createPinIcon() {
  const pinPath = path.join(ICONS_DIR, "pin.png")

  if (fs.existsSync(pinPath)) {
    console.log("Pin icon already exists")
    return
  }

  // Create a simple 1x1 transparent PNG as placeholder
  // Users should replace this with their actual pin icon
  const placeholderPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAFUSURBVEiJtZaxSgNBEIa/iRcsjBIQtBBsFIKFWIiFIFrYWPkCPoCtlT6AlY1Y+Qo+gY2NhY1gJxYKKqKFCIqFGrwYi90ja7K5u4Q4sLDszPz/zO7O7MKIRIYJxIp1CeiWYR6ZdYFtYB4oyJwOPxiYOQCOgGgZFm2oQl4BS8CiDG8tCAYzPmDgGLgKLAOLWusmxrXhPkuLPAJugPvh9g8L3CbIBeDW6YJJtH8VOAPYAZ4TLBiWOA18AjZtYN75OBZoANfAKXAoE9aB+mIx2AV+gLasQVLCa5JnAnjQfyJfwHfAL7AFPABtWYuA/wJrwL3/dXDgN2AC4QKw4/d8zzUAUv8BWAAe/GMLmAB2ZZ8AngB7mP9D8gBsAi/AbeBCwLVJm8A8sKRF+kMXZsE+cBVYkPkNeAWeBdq1aNt+D7QI/1RZlUX8U2ENuPevUewA/wDrz0o6j7ZTRQAAAABJRU5ErkJggg==",
    "base64"
  )

  fs.writeFileSync(pinPath, placeholderPng)
  console.log(`Created placeholder pin icon at: ${pinPath}`)
  console.log("Note: Replace this with your actual pin icon (24x24 PNG recommended)")
}

async function main() {
  console.log("Setting up assets for WhatsApp card generator...")
  console.log("")

  // Ensure directories
  ensureDir(FONTS_DIR)
  ensureDir(ICONS_DIR)

  // Create pin icon placeholder
  createPinIcon()

  // Download fonts
  console.log("")
  console.log("Downloading Inter fonts...")
  console.log("Note: For production, download Inter font from https://rsms.me/inter/")
  console.log("and place .ttf files in:", FONTS_DIR)
  console.log("")

  // Just create empty placeholder files for now
  // Users should download actual Inter fonts
  for (const [filename] of Object.entries(FONT_URLS)) {
    const fontPath = path.join(FONTS_DIR, filename)
    if (!fs.existsSync(fontPath)) {
      console.log(`Font not found: ${filename}`)
      console.log(`  Download from: https://rsms.me/inter/`)
    } else {
      console.log(`Font exists: ${filename}`)
    }
  }

  console.log("")
  console.log("Setup complete!")
  console.log("")
  console.log("To use custom fonts, download Inter from https://rsms.me/inter/")
  console.log("and place the .ttf files in:", FONTS_DIR)
}

main().catch(console.error)

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createJobCard, extractJobDataFromEmbed } from "../src/services/cardGenerator.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const EMBEDS_PATH = path.resolve(__dirname, "..", "..", "discord", "src", "data", "embeds.json")
const OUTPUT_DIR = path.resolve(__dirname, "..", "samples")
const OUTPUT_FILE = path.join(OUTPUT_DIR, "job-card-preview.jpg")

async function main() {
  if (!fs.existsSync(EMBEDS_PATH)) {
    console.error("embeds.json not found:", EMBEDS_PATH)
    process.exit(1)
  }

  const raw = fs.readFileSync(EMBEDS_PATH, "utf8")
  const embeds = JSON.parse(raw)

  if (!Array.isArray(embeds) || embeds.length === 0) {
    console.error("No embeds available")
    process.exit(1)
  }

  const embed = embeds[0]
  const jobData = extractJobDataFromEmbed(embed)
  const buffer = await createJobCard(jobData)

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, buffer)
  console.log("Sample card generated:", OUTPUT_FILE)
}

main().catch((error) => {
  console.error("Failed to render sample card:", error)
  process.exit(1)
})

// utils.ts
import fs from "fs"
import Job from "../models/models"

const embedsFilePath = "E:\\BOT-Search-Job\\message_formatting\\discord\\src\\data\\embeds.json"

function loadEmbeds() {
    try {
        const data = fs.readFileSync(embedsFilePath, "utf8")
        return JSON.parse(data)
    } catch (err: any) {
        if (err.code !== "ENOENT") {
            console.error("Erro ao carregar embeds.json:", err)
        }
        return []
    }
}

function saveEmbeds(embeds: Job[]) {
    const embedData = embeds.map((embed) => embed.toEmbed().toJSON())
    fs.writeFileSync(embedsFilePath, JSON.stringify(embedData, null, 2))
}

function validateJobData(dadosVaga: { [x: string]: any }) {
    const requiredFields = ["job_title", "job_url"]
    for (const field of requiredFields) {
        if (!dadosVaga[field]) {
            throw new Error(`Campo obrigatório "${field}" não informado.`)
        }
    }
}

function slashcommands() {}

export { loadEmbeds, saveEmbeds, validateJobData }

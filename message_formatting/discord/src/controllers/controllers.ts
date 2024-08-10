// controllers.ts
import { Request, Response } from "express"
import Job from "../models/models"
import { loadEmbeds, saveEmbeds, validateJobData } from "../utils/utils"

let embeds: Job[] = loadEmbeds()

function createJob(req: Request, res: Response) {
    const dadosVaga = req.body

    try {
        validateJobData(dadosVaga)

        const job = new Job(dadosVaga)

        embeds.push(job)
        saveEmbeds(embeds)
        res.json({ success: true })
    } catch (error: any) {
        // Usar tipo any para o erro
        console.error("Erro ao criar o Job:", error)
        res.status(500).json({ error: error.message })
    }
}

function getEmbeds(req: Request, res: Response) {
    res.json(embeds.slice())
}

export { createJob, getEmbeds }

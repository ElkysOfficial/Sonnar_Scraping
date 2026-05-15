import { Request, Response } from "express"
import { fetchJobData, createJobData, updateJobStatus } from "../services/jobDataClient"
import { jobDataToEmbed } from "../utils/jobFormatter"

async function postEmbeds(req: Request, res: Response) {
  try {
    const payload = req.body || {}
    const result = await createJobData(payload)
    return res.status(201).json(result)
  } catch (error: any) {
    console.error("Erro ao criar o job:", error)
    return res.status(500).json({ error: error.message || "Falha ao criar o job" })
  }
}

async function getEmbeds(req: Request, res: Response) {
  try {
    const jobs = await fetchJobData()
    const embeds = jobs.map(jobDataToEmbed)
    return res.json(embeds)
  } catch (error: any) {
    console.error("Erro ao listar os embeds:", error)
    return res.status(500).json({ error: error.message || "Falha ao listar os embeds" })
  }
}

async function putEmbeds(req: Request, res: Response) {
  try {
    const { id, sending } = req.body || {}
    if (!id) {
      return res.status(400).json({ error: "ID é obrigatório" })
    }
    const status = sending === "true" || sending === true
    await updateJobStatus(id, "discord", status)
    return res.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao atualizar o embed:", error)
    return res.status(500).json({ error: error.message || "Falha ao atualizar o embed" })
  }
}

export { postEmbeds, getEmbeds, putEmbeds }

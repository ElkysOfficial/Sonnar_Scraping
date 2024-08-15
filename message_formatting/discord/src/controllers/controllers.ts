import { Request, Response } from "express"
import Job from "../models/models"
import { loadEmbeds, saveEmbeds, validateJobData, convertAPIEmbedToEmbedData, updateEmbedInFile, generateUniqueId, watchEmbedsFile } from "../utils/embedUtils"
import { EmbedData } from "discord.js"

// Carrega os Embeds existentes do armazenamento
let embeds: ExtendedEmbedData[] = loadEmbeds()

// Interface que define a estrutura dos dados da vaga
interface JobData {
    job_title: string
    job_url: string
    company?: string
    location?: string
    hiring_regime?: string
    work_type?: string
    salary?: string
    publication_date?: string
}

// Interface que estende EmbedData para incluir 'id' e 'sending'
interface ExtendedEmbedData extends EmbedData {
    id?: string
    sending?: boolean | string
}

// Cria um novo Job (vaga) e o adiciona à lista de embeds
function postEmbeds(req: Request, res: Response) {
    const dadosVaga: JobData = req.body

    try {
        // Valida os dados da vaga
        validateJobData(dadosVaga)

        // Cria um novo objeto Job
        const job = new Job(dadosVaga)

        // Converte o Job para o formato de Embed e adiciona um ID único
        const newEmbed: ExtendedEmbedData = convertAPIEmbedToEmbedData(job.toEmbed().toJSON())
        newEmbed.id = generateUniqueId()

        // Adiciona o novo embed à lista e salva no arquivo
        embeds.push(newEmbed)
        saveEmbeds(embeds)

        res.json({ success: true })
    } catch (error: any) {
        console.error("Erro ao criar o Job:", error)
        res.status(500).json({ error: error.message })
    }
}

// Retorna todos os embeds
function getEmbeds(req: Request, res: Response) {
    res.json(embeds.slice()) // Retorna uma cópia para evitar modificações acidentais
}

// Atualiza o status de envio de um embed específico
function putEmbeds(req: Request, res: Response) {
    const { id, sending } = req.body

    try {
        // Encontra o embed a ser atualizado
        const embedToUpdate = embeds.find((embed) => embed.id === id)

        if (!embedToUpdate) {
            return res.status(404).json({ error: "Embed não encontrado" })
        }

        // Atualiza o campo 'sending'
        embedToUpdate.sending = sending

        // Atualiza o arquivo embeds.json
        updateEmbedInFile(embedToUpdate)

        res.json({ message: "Embed atualizado com sucesso" })
    } catch (error: any) {
        console.error("Erro ao atualizar o embed:", error)
        res.status(500).json({ error: error.message })
    }
}

// Monitora o arquivo embeds.json e recarrega os dados quando houver alterações
watchEmbedsFile(() => {
    embeds = loadEmbeds()
})

export { postEmbeds, getEmbeds, putEmbeds }

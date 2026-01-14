import fs from "fs" // Importa o módulo 'fs' para manipulação de arquivos
import { APIEmbed, EmbedData } from "discord.js"
import { v4 as uuidv4 } from "uuid"
import chokidar from "chokidar"
// Define o caminho do arquivo onde os embeds serão armazenados
const embedsFilePath = "D:\\Pessoal\\Sonar\\message_formatting\\discord\\src\\data\\embeds.json"

// Define a interface para os dados de uma vaga de emprego
interface JobData {
    job_title: string
    job_url: string
    [key: string]: any // Permite campos adicionais flexíveis
}

// Interface estendida para incluir as propriedades 'id' e 'sending'
interface ExtendedEmbedData extends EmbedData {
    id?: string
    sending?: boolean | string
}

// Carrega os embeds do arquivo JSON
function loadEmbeds(): ExtendedEmbedData[] {
    try {
        const data = fs.readFileSync(embedsFilePath, "utf8")
        return JSON.parse(data) as ExtendedEmbedData[]
    } catch (err: any) {
        if (err.code === "ENOENT") {
            console.warn("Arquivo embeds.json não encontrado. Criando um novo arquivo vazio.")
            saveEmbeds([]) // Cria um novo arquivo vazio se não existir
            return []
        } else if (err instanceof SyntaxError) {
            console.error("Erro de sintaxe em embeds.json. Verifique o arquivo e corrija os erros de JSON.")
            return []
        } else {
            console.error("Erro inesperado ao carregar embeds.json:", err)
            return []
        }
    }
}

// Salva os embeds no arquivo JSON
function saveEmbeds(embeds: ExtendedEmbedData[]) {
    fs.writeFileSync(embedsFilePath, JSON.stringify(embeds, null, 2)) // Escreve os embeds no arquivo com formatação
}

// Valida os dados de uma vaga de emprego
function validateJobData(dadosVaga: JobData) {
    const requiredFields = ["job_title", "job_url"] // Campos obrigatórios
    for (const field of requiredFields) {
        if (!dadosVaga[field]) {
            // Verifica se o campo existe e não está vazio
            throw new Error(`Campo obrigatório "${field}" não informado.`) // Lança um erro se o campo estiver faltando
        }
    }
}

// Converte um APIEmbed em um EmbedData
function convertAPIEmbedToEmbedData(apiEmbed: APIEmbed): ExtendedEmbedData {
    const { video, ...rest } = apiEmbed // Extrai o campo 'video' e o restante dos campos
    return {
        ...rest, // Copia o restante dos campos
        video: video ? { url: video.url! } : undefined // Converte o campo 'video' se existir
    } as ExtendedEmbedData // Garante que o resultado seja do tipo ExtendedEmbedData
}

// Atualiza um embed no arquivo JSON
function updateEmbedInFile(updatedEmbed: ExtendedEmbedData) {
    try {
        const embeds = loadEmbeds()
        const index = embeds.findIndex((embed) => embed.id === updatedEmbed.id)

        if (index === -1) {
            throw new Error("Embed não encontrado para atualização.")
        }

        embeds[index] = updatedEmbed
        saveEmbeds(embeds)
    } catch (error: any) {
        console.error("Erro ao atualizar embed no arquivo:", error)
    }
}

// Gera um ID único (UUID v4)
function generateUniqueId() {
    return uuidv4()
}

// Monitora o arquivo embeds.json para alterações e recarrega os dados
function watchEmbedsFile(callback: () => void) {
    let previousEmbedsData = loadEmbeds() // Carrega os embeds antes da alteração
    let previousEmbedCount = previousEmbedsData.length // Conta o número de embeds antes da alteração

    chokidar.watch(embedsFilePath).on("all", (event, path) => {
        if (event === "change") {
            const currentEmbedsData = loadEmbeds() // Carrega os embeds após a alteração
            const currentEmbedCount = currentEmbedsData.length // Conta o número de embeds após a alteração

            if (currentEmbedCount > previousEmbedCount) {
                console.log("Novas vagas foram adicionadas, recarregando o arquivo...")
            } else {
                // Verifica se algum embed teve o campo 'sending' adicionado
                const anySendingAdded = currentEmbedsData.some((currEmbed) =>
                    previousEmbedsData.some((prevEmbed) => currEmbed.id === prevEmbed.id && !prevEmbed.sending && currEmbed.sending === "true")
                )
                if (anySendingAdded) {
                    console.log("Embeds enviado para o discord com sucesso !")
                } else {
                    console.log("Embeds modificados ou excluido")
                }
            }

            previousEmbedsData = currentEmbedsData
            previousEmbedCount = currentEmbedCount
        }

        callback()
    })
}

// Exporta as funções para serem usadas em outros módulos
export { loadEmbeds, saveEmbeds, validateJobData, convertAPIEmbedToEmbedData, updateEmbedInFile, generateUniqueId, watchEmbedsFile }

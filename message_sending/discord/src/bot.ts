import { Client, GatewayIntentBits } from "discord.js"
import dotenv from "dotenv"

import fetch from "node-fetch-commonjs"

dotenv.config() // Carrega as variáveis de ambiente do arquivo .env

// Obtém o token do bot e o ID do canal de destino das variáveis de ambiente
const token = process.env.DISCORD_TOKEN
const channelId = process.env.DISCORD_CHANNEL_ID || ""

// Cria um novo cliente Discord com as intents necessárias
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
})

// Função principal para buscar e enviar os embeds
async function fetchAndSendEmbeds() {
    try {
        // Busca os embeds da API
        const response = await fetch("http://localhost:3000/embeds")
        if (!response.ok) {
            // Verifica se a requisição foi bem-sucedida
            throw new Error(`Erro ao buscar embeds: ${response.status} ${response.statusText}`)
        }
        const embeds: any[] = (await response.json()) as any[] // Alterado para any[] para evitar erros de compilação

        // Obtém o canal de destino a partir do ID
        const channel = client.channels.cache.get(channelId)
        if (!channel || !channel.isTextBased()) {
            // Verifica se o canal existe e é um canal de texto
            console.error(`Canal não encontrado com o ID: ${channelId}`)
            return
        }

        let allEmbedsSent = true // Flag para controlar se todas as vagas foram enviadas

        // Itera sobre os embeds
        for (const embedData of embeds) {
            // Pula o embed se ele já foi enviado
            if (embedData.sending === "true") {
                console.log(`Pulando embed ${embedData.id}, já enviado.`)
                continue
            }

            allEmbedsSent = false // Pelo menos uma vaga ainda não foi enviada

            // Envia o embed para o canal do Discord
            await channel.send({ embeds: [embedData] })

            // Atualiza o status da vaga na API para indicar que foi enviada
            await fetch(`http://localhost:3000/embeds`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ id: embedData.id, sending: "true" })
            })

            // Aguarda 1 minuto antes de enviar o próximo embed
            await new Promise((resolve) => setTimeout(resolve, 60000))
        }

        // Reinicia o processo se todas as vagas foram enviadas
        if (allEmbedsSent) {
            console.log("Todas as vagas foram enviadas. Reiniciando o processo.")
        }
    } catch (error) {
        console.error("Erro ao buscar ou enviar embeds:", error)
    }
}

// Evento disparado quando o bot está pronto
client.on("ready", async () => {
    console.log(`Logado como ${client.user?.tag}!`)

    // Loop infinito para buscar e enviar embeds continuamente
    while (true) {
        await fetchAndSendEmbeds()
    }
})
client.login(token)

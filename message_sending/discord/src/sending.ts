import { Client, GatewayIntentBits } from "discord.js"
import dotenv from "dotenv"

import fetch from "node-fetch-commonjs"

dotenv.config()

const token = process.env.DISCORD_TOKEN
const channelId = process.env.DISCORD_CHANNEL_ID || ""

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
})

async function fetchAndSendEmbeds() {
    try {
        const response = await fetch("http://localhost:3000/embeds")
        if (!response.ok) {
            throw new Error(`Erro ao buscar embeds: ${response.status} ${response.statusText}`)
        }
        const embeds: any[] = (await response.json()) as any[]

        const channel = client.channels.cache.get(channelId)
        if (!channel || !channel.isTextBased()) {
            console.error(`Canal não encontrado com o ID: ${channelId}`)
            return
        }

        for (const embedData of embeds) {
            await channel.send({ embeds: [embedData] })
            await new Promise((resolve) => setTimeout(resolve, 60000))
        }
    } catch (error) {
        console.error("Erro ao buscar ou enviar embeds:", error)
    }
}

client.on("ready", async () => {
    console.log(`Logado como ${client.user?.tag}!`)

    while (true) {
        await fetchAndSendEmbeds()
    }
})

client.login(token)

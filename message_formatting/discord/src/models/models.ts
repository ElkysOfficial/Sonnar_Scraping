import { EmbedBuilder } from "discord.js"
import dayjs from "dayjs"

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

class Job {
    constructor(public data: JobData) {}

    toEmbed() {
        const fields = []

        fields.push({ name: "Empresa", value: String(this.data.company), inline: true })

        if (this.data.location) fields.push({ name: "Localidade", value: String(this.data.location), inline: true })
        if (this.data.hiring_regime) fields.push({ name: "Regime", value: String(this.data.hiring_regime), inline: true })
        if (this.data.work_type) fields.push({ name: "Modalidade de Trabalho", value: String(this.data.work_type), inline: true })
        if (this.data.salary) fields.push({ name: "Salário", value: String(this.data.salary), inline: true })
        if (this.data.publication_date) {
            const formattedDate = dayjs(this.data.publication_date).format("DD/MM/YYYY")
            fields.push({ name: "Data de Publicação", value: formattedDate, inline: true })
        }

        return new EmbedBuilder()
            .setTitle(this.data.job_title)
            .setURL(this.data.job_url)
            .addFields(...fields)
            .setImage("https://i.imgur.com/bMrOQ0z.jpeg")
            .setThumbnail("https://i.imgur.com/2EgFmoc.png")
            .setColor("#472680")
            .setFooter({ text: "Bot Vagas", iconURL: "https://i.imgur.com/LImgttj.jpeg" })
            .setTimestamp()
    }
}

export default Job

import { EmbedBuilder, EmbedData, EmbedField } from "discord.js"
import dayjs from "dayjs" // Importa a biblioteca dayjs para formatação de datas

// Interface que define a estrutura dos dados da vaga de emprego
interface JobConstructorParams {
    job_title: string
    job_url: string
    company?: string
    location?: string
    hiring_regime?: string
    work_type?: string
    salary?: string
    publication_date?: string
}

// Classe que representa uma vaga de emprego
class Job {
    // Construtor que recebe os dados da vaga e os armazena em uma propriedade privada e imutável
    constructor(private readonly data: JobConstructorParams) {}

    // Adiciona um campo ao Embed se o valor for uma string não vazia
    private addFieldIfNotEmpty(fields: EmbedField[], name: string, value?: string) {
        if (typeof value === "string" && value.trim() !== "") {
            fields.push({ name, value, inline: true })
        }
    }

    // Converte os dados da vaga em um Embed do Discord
    toEmbed(): EmbedBuilder {
        const fields: EmbedField[] = []

        // Adiciona campos opcionais ao Embed se existirem
        this.addFieldIfNotEmpty(fields, "Empresa", this.data.company)
        this.addFieldIfNotEmpty(fields, "Localidade", this.data.location)
        this.addFieldIfNotEmpty(fields, "Regime", this.data.hiring_regime)
        this.addFieldIfNotEmpty(fields, "Modalidade de Trabalho", this.data.work_type)
        this.addFieldIfNotEmpty(fields, "Salário", this.data.salary)

        // Formata e adiciona a data de publicação
        if (this.data.publication_date) {
            const formattedDate = dayjs(this.data.publication_date).format("DD/MM/YYYY")
            fields.push({ name: "Data de Publicação", value: formattedDate, inline: true })
        }

        // Cria e configura o Embed com os dados da vaga
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

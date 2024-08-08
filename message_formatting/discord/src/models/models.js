// Importar bibliotecas
const { EmbedBuilder } = require('discord.js');
const dayjs = require('dayjs');

class Job {
    constructor(job_title, job_url, company, location, hiring_regime, work_type, salary, publication_date) {
        this.job_title = job_title;
        this.job_url = job_url;
        this.company = company || undefined; 
        this.location = location || undefined;
        this.hiring_regime = hiring_regime || undefined;
        this.work_type = work_type || undefined;
        this.salary = salary || undefined;
        this.publication_date = publication_date || undefined; 
        // Use undefined para omitir campos
    }

    toEmbed() {
        const fields = [];
        
        fields.push({ name: "Empresa", value: String(this.company), inline: true }); 
        
        if (this.location) fields.push({ name: "Localidade", value: String(this.location), inline: true }); 
        if (this.hiring_regime) fields.push({ name: "Regime", value: String(this.hiring_regime), inline: true });
        if (this.work_type) fields.push({ name: "Modalidade de Trabalho", value: String(this.work_type), inline: true });
        if (this.salary) fields.push({ name: "Salário", value: String(this.salary), inline: true });
        if (this.publication_date) {
            const formattedDate = dayjs(this.publication_date).format('DD/MM/YYYY');
            fields.push({ name: "Data de Publicação", value: formattedDate, inline: true });
        }
        
        return new EmbedBuilder()
            .setTitle(this.job_title)
            .setURL(this.job_url)
            .addFields(...fields) 
            .setImage("https://i.imgur.com/bMrOQ0z.jpeg")
            .setThumbnail("https://i.imgur.com/2EgFmoc.png")
            .setColor("#472680")
            .setFooter({ text: "Bot Vagas", iconURL: "https://i.imgur.com/LImgttj.jpeg" })
            .setTimestamp();
    }
}

module.exports = Job;

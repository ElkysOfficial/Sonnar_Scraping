const express = require('express');
const app = express();
const port = 3000;
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');

app.use(express.json());

// Armazenamento em arquivo JSON (melhor para persistência)
const embedsFilePath = './src/data/embeds.json';
let embeds = [];

// Carregar embeds existentes do arquivo ao iniciar o servidor
try {
  const data = fs.readFileSync(embedsFilePath, 'utf8');
  embeds = JSON.parse(data);
} catch (err) {
  if (err.code !== 'ENOENT') { // Ignorar erro se o arquivo não existir
    console.error('Erro ao carregar embeds.json:', err);
  }
}

// Endpoint para receber dados do main.py
app.post('/jobs', (req, res) => {
  const dadosVaga = req.body;

  if (!dadosVaga.job_title || !dadosVaga.job_url) {
    return res.status(400).json({ error: "Missing job_title or job_url" });
  }

  // Criar o embed (mantendo sua formatação)
  const embed = new EmbedBuilder()
    .setTitle(dadosVaga.job_title)
    .setURL(dadosVaga.job_url)
    .addFields(
      { name: "Empresa", value: dadosVaga.company || "não informado", inline: true },
      { name: "Localidade", value: dadosVaga.location || "não informado", inline: true },
      { name: "Regime", value: dadosVaga.hiring_regime || "não informado", inline: true }, 
      { name: "Modalidade de Trabalho", value: dadosVaga.work_type || "não informado", inline: true },
      { name: "Salário", value: dadosVaga.salary || "não informado", inline: true },
      { name: "Data de Publicação", value: dadosVaga.publication_date || "não informado", inline: true }
    )
    .setImage("https://i.imgur.com/bMrOQ0z.jpeg") 
    .setThumbnail("https://i.imgur.com/2EgFmoc.png") 
    .setColor("#472680")
    .setFooter({
      text: "Bot Vagas",
      iconURL: "https://i.imgur.com/LImgttj.jpeg"
    })
    .setTimestamp();

  // Adicionar o embed à lista e salvar no arquivo
  embeds.push(embed.toJSON());
  fs.writeFileSync(embedsFilePath, JSON.stringify(embeds, null, 2)); // Formatação para melhor legibilidade

  res.json({ success: true });
});

// Endpoint para fornecer embeds ao main.js
app.get('/embeds', (req, res) => {
  // Retornar uma cópia dos embeds para evitar modificações acidentais
  res.json(embeds.slice()); 
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
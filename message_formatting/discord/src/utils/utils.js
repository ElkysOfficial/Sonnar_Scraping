const fs = require('fs');
const embedsFilePath = 'E:\\BOT_Search_Job\\message_formatting\\discord\\src\\data\\embeds.json'; // Caminho do arquivo de embeds

// Carrega os embeds existentes do arquivo
function loadEmbeds() {
  try {
    const data = fs.readFileSync(embedsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Erro ao carregar embeds.json:', err);
    }
    return [];
  }
}

// Salva os embeds no arquivo
function saveEmbeds(embeds) {
  fs.writeFileSync(embedsFilePath, JSON.stringify(embeds, null, 2));
}

// Valida os dados da vaga
function validateJobData(dadosVaga) {
  const requiredFields = ['job_title', 'job_url'];
  for (const field of requiredFields) {
    if (!dadosVaga[field]) {
      throw new Error(`Campo obrigatório "${field}" não informado.`);
    }
  }
  // Adicione outras validações específicas para o seu projeto, se necessário
}

module.exports = { loadEmbeds, saveEmbeds, validateJobData };

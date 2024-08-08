const Job = require('../models/models');
const { loadEmbeds, saveEmbeds, validateJobData} = require('../utils/utils');

let embeds = loadEmbeds(); // Carrega os embeds existentes ao iniciar

function createJob(req, res) {
  const dadosVaga = req.body;

  try {
    validateJobData(dadosVaga); // Valida os dados da vaga
    
    const job = new Job(
      dadosVaga.job_title,
      dadosVaga.job_url,
      dadosVaga.company,
      dadosVaga.location,
      dadosVaga.hiring_regime,
      dadosVaga.work_type,
      dadosVaga.salary,
      dadosVaga.publication_date
    );

    embeds.push(job.toEmbed().toJSON());
    saveEmbeds(embeds);
    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao criar o Job:", error);
    res.status(500).json({ error: error.message }); // Retorna a mensagem de erro específica
  }
}

function getEmbeds(req, res) {
  res.json(embeds.slice()); 
}

module.exports = { createJob, getEmbeds };

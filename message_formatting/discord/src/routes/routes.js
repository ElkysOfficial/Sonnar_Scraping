const express = require('express');
const router = express.Router();
const controller = require('../controllers/controllers');

router.post('/jobs', controller.createJob); // Rota para criar um novo job
router.get('/embeds', controller.getEmbeds); // Rota para obter os embeds

module.exports = router;

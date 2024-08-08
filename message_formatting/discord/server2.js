const express = require('express');
const app = express();
const port = 3000;
const routes = require('./src/routes/routes'); // Importa as rotas

app.use(express.json());
app.use('/', routes); // Usa as rotas definidas em routes.js

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

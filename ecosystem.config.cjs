// =====================================================
// PM2 ecosystem - sobe todos os serviços do Sonnar com um comando.
//
//   pm2 start ecosystem.config.cjs        (sobe tudo)
//   pm2 stop ecosystem.config.cjs         (para tudo)
//   pm2 logs / pm2 restart all
//   pm2 save && pm2 startup               (persistir no boot da VPS)
//
// Todos os 4 processos sao de longa duracao (rodam ate alguem parar).
// Ordem do array = ordem de subida.
//
// MEMORIA: a maquina tem 4GB. `max_memory_restart` reinicia o processo se
// ele passar do teto, evitando que a maquina inteira estoure (OOM).
// Orcamento: ~2.4GB pros apps + ~1GB SO = ~0.6GB de folga. Ver OPERACAO.md.
// =====================================================

// Interpretador Python: `python` no Windows, `python3` no Linux (VPS).
// Se usar virtualenv, aponte SCRAPER_PYTHON para o python da venv.
const PYTHON =
  process.env.SCRAPER_PYTHON ||
  (process.platform === "win32" ? "python" : "python3");

module.exports = {
  apps: [
    {
      name: "sonnar-core",
      cwd: "./packages/message-formatting-core",
      script: "src/server.js",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      // O core faz JSON.parse do jobs.json inteiro (~18k vagas) a cada
      // request. 250M era apertado e o PM2 reiniciava a cada ciclo VIP.
      max_memory_restart: "512M",
      time: true,
    },
    {
      name: "sonnar-wa-formatter",
      cwd: "./apps/whatsapp/formatter",
      script: "src/server.js",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "400M",
      time: true,
    },
    {
      name: "sonnar-wa-sender",
      cwd: "./apps/whatsapp/sender",
      script: "src/index.js",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: "500M",
      time: true,
    },
    {
      name: "sonnar-scraper",
      cwd: "./apps/scraper",
      script: "scrapy.py",
      interpreter: PYTHON,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 15000,
      max_memory_restart: "1024M",
      time: true,
    },
  ],
};

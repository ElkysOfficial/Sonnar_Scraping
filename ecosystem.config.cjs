// =====================================================
// PM2 ecosystem - sobe todos os serviços do Sonnar com um comando.
//
//   pm2 start ecosystem.config.cjs        (sobe tudo)
//   pm2 stop ecosystem.config.cjs         (para tudo)
//   pm2 logs / pm2 restart all
//   pm2 save && pm2 startup               (persistir no boot da VPS)
//
// Todos os 3 processos sao de longa duracao (rodam ate alguem parar).
// Ordem do array = ordem de subida.
//
// MEMORIA: a maquina tem 8GB. `max_memory_restart` reinicia o processo se
// ele passar do teto, evitando que a maquina inteira estoure (OOM).
// Orcamento: ~3GB pros apps + ~1GB SO = bastante folga. Ver OPERACAO.md.
//
// NOTA: o processo `sonnar-wa-formatter` foi removido na v3.6.0 — a
// geracao de imagem dos cards foi descontinuada. O sender agora envia
// vagas em texto puro (textBuilder.js).
//
// CRON DE RESTART DO SCRAPER (v3.6.0): adicionar dois horarios no crontab
// da VPS pra defrag mais frequente da heap CPython (Argos + Stanza acumulam
// fragmentacao ao longo do dia):
//
//   0 4  * * * pm2 restart sonnar-scraper >> ~/cron.log 2>&1
//   0 16 * * * pm2 restart sonnar-scraper >> ~/cron.log 2>&1
//
// O segundo restart (16h UTC = 13h horario de Brasilia) corta o pico
// secundario de carga sustentado.
// =====================================================

// Interpretador Python do scraper. Ordem de prioridade:
//   1. SCRAPER_PYTHON   - override explicito (env var)
//   2. apps/scraper/.venv - virtualenv local, criada pelo setup-vps.sh
//   3. python do sistema - `python` no Windows, `python3` no Linux
//
// O passo 2 e essencial: sem ele, um `pm2 start ecosystem.config.cjs` sem
// SCRAPER_PYTHON exportado cairia no python do sistema (sem as deps da
// requirements.txt) e o scraper quebraria com `ModuleNotFoundError`.
const fs = require("fs");
const path = require("path");

function resolveScraperPython() {
  if (process.env.SCRAPER_PYTHON) return process.env.SCRAPER_PYTHON;
  const isWin = process.platform === "win32";
  const venvPython = path.join(
    __dirname,
    "apps/scraper/.venv",
    isWin ? "Scripts/python.exe" : "bin/python"
  );
  if (fs.existsSync(venvPython)) return venvPython;
  return isWin ? "python" : "python3";
}

const PYTHON = resolveScraperPython();

module.exports = {
  apps: [
    {
      name: "sonnar-core",
      cwd: "./packages/message-formatting-core",
      script: "src/server.js",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      // v3.1.0: o core migrou de jobs.json para SQLite (better-sqlite3).
      // Cada POST /jobs/batch agora vira INSERT/UPDATE pontual dentro de
      // uma transacao, sem re-serializar o dict inteiro. Footprint real
      // observado em testes: ~80-150MB de heap (vs ~700MB-1.4GB do JSON).
      // 512M da folga > 3x acima do pico, evita falsos restarts.
      // Em produçao, monitorar /health (campo "jobs") e elevar se passar
      // de ~300MB sustentado.
      max_memory_restart: "512M",
      // v3.6.0: NODE_ENV=production explicito (express/etc otimizam).
      env: { NODE_ENV: "production" },
      time: true,
    },
    {
      name: "sonnar-wa-sender",
      cwd: "./apps/whatsapp/sender",
      script: "src/index.js",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // v3.6.0: teto 500M -> 400M. Sem geracao de imagem (buffer base64
      // de 80-200KB por delivery), o sender opera tipicamente em ~150-200MB.
      // 400M = 2x acima do pico observado, ainda conservador.
      max_memory_restart: "400M",
      // v3.6.0: --max-old-space-size=384 forca V8 a fazer GC antes do
      // teto do PM2, evitando picos de heap inteiro virar pressao no SO.
      // Sinergiza com max_memory_restart=400M.
      node_args: "--max-old-space-size=384",
      env: { NODE_ENV: "production" },
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
      // O scraper precisa de tempo entre o SIGINT e o SIGKILL para encerrar
      // o ciclo, terminar um POST /jobs/batch em andamento e fechar o browser
      // (evita Chromium orfao). O padrao do PM2 (1.6s) era curto demais.
      kill_timeout: 10000,
      // 2048M (era 1024M, teto da epoca da VPS de 4GB): a engine careerjet
      // carrega modelos de traducao (Argos) na RAM. A VPS hoje tem 8GB —
      // ha folga de sobra para o teto maior, e o de 1GB causava restart
      // em loop assim que a traducao era inicializada.
      max_memory_restart: "2048M",
      time: true,
    },
    // v3.6.0: backfill removido completamente.
    // Toda engine ja chama `enrich_canonical` antes de gravar a vaga, e o
    // core (POST /jobs/batch) rejeita payloads sem `description_lang` — nao
    // existe mais o conceito de "vaga legado sem enrichment".
  ],
};

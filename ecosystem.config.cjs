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
// MEMORIA: a maquina tem 8GB. `max_memory_restart` reinicia o processo se
// ele passar do teto, evitando que a maquina inteira estoure (OOM).
// Orcamento: ~3.5GB pros apps + ~1GB SO = bastante folga. Ver OPERACAO.md.
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
      // O core le+parseia o jobs.json (~50MB, 52k vagas) e re-serializa o
      // dict inteiro (~80MB) a cada POST /jobs/batch do scraper. Em rajadas
      // de batch + GETs concorrentes a heap V8 passou de 1024M (observado
      // ~1.25-1.45GB) e o PM2 reciclava o core a cada ~30-60s, derrubando
      // o pipeline: scraper acumulava "Server disconnected" e reenfileirava
      // lotes em loop. 2048M cobre o pico real com folga. Fix arquitetural
      // (parar de re-serializar 80MB por batch — migrar jobs.json p/ SQLite
      // ou usar escrita incremental) fica como follow-up (issue v3.1.x).
      max_memory_restart: "2048M",
      time: true,
    },
    {
      name: "sonnar-wa-formatter",
      cwd: "./apps/whatsapp/formatter",
      script: "src/server.js",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      // 600M (era 400M): o Canvas (geracao de imagem) acumula buffers e
      // batia o teto a cada ~30min, gerando ~12-15 restarts/dia sem erro
      // fatal nos logs (PM2 SIGTERM antes do crash). 600M dobra o intervalo
      // para ~1h, reduzindo para ~6-8 restarts/dia. Ainda dentro do
      // orcamento de 8GB da VPS (~3.7GB total apps).
      max_memory_restart: "600M",
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
    // NOTA: o servico `sonnar-backfill` foi removido do VPS.
    // O backfill so existe para tratar vagas LEGADO (anteriores ao v3.0.0)
    // que entraram no banco sem `description_lang`/`responsibilities`.
    // Vagas novas ja saem das engines com esses campos preenchidos via
    // `enrich_canonical` em `src/utils/job_enrichment.py`, entao nao ha
    // motivo para manter o daemon rodando 24/7 na VPS competindo por
    // CPU/RAM com o scraper e o core (Argos e CPU-bound e custou caro:
    // ~67% de CPU sustentado, alem de ter gerado processo orfao quando
    // PM2 nao conseguiu reciclar).
    //
    // Para processar o legado, rodar localmente (uma maquina mais
    // potente que a VPS):
    //   cd apps/scraper
    //   python scripts/backfill_enrichment.py --all --chunk-size 50
    // (sem --daemon: termina quando a fila esvazia).
  ],
};

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
      // O core faz JSON.parse do jobs.json inteiro a cada request. 250M era
      // apertado; 512M passou a estourar (~624M) depois que a careerjet
      // voltou a coletar e o jobs.json cresceu. 1024M da folga — a VPS tem
      // 8GB e o orcamento total fica em ~3.95GB.
      max_memory_restart: "1024M",
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
    {
      // Backfill automatico do epico v3.0.0:
      //   1) Le do banco vagas com description_lang OU responsibilities NULL
      //   2) Detecta idioma, traduz description pra PT (se != pt), extrai
      //      responsibilities, UPDATE no banco.
      //   3) Modo --daemon: roda 24/7. Quando fila esvazia, dorme 10min e
      //      re-checa - vagas novas que entrarem ficam tratadas.
      // Pode consumir CPU em rajadas (Argos e CPU-bound). 1G de teto da
      // folga pros modelos de traducao.
      name: "sonnar-backfill",
      cwd: "./apps/scraper",
      script: "scripts/backfill_enrichment.py",
      // chunk-size 50 (era 100): reduz quanto Argos/Stanza acumulam
      // entre passes do GC manual. Junto com gc.collect() apos cada
      // chunk no codigo, mantem RAM estavel <1.5GB.
      args: "--all --daemon --idle-sleep 600 --chunk-size 50",
      interpreter: PYTHON,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 30000,
      // 2048M (era 1536M): mesmo com gc.collect() + chunk-size 50, em
      // vagas estrangeiras (en/ja/zh) o footprint do Argos sobe pra
      // ~1.2-1.4GB. 2GB da folga real e evita restart loop. VPS tem
      // 8GB - orcamento total fica em ~5GB (sobra ~3GB).
      max_memory_restart: "2048M",
      // Aumenta kill_timeout: ao reiniciar, Argos pode estar no meio
      // de uma traducao que demora alguns segundos. 1.6s default era
      // curto demais e gerava 'failed to kill' em loop.
      kill_timeout: 8000,
      time: true,
    },
  ],
};

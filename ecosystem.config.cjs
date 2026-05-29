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
// NOTA: o processo `sonnar-wa-formatter` foi removido (geracao de imagem
// migrou pra Vercel Edge Function via @vercel/og — projeto card-renderer).
// Ver docs/vault/12-decisions/ADR-006-vps-load-reduction-target.md.
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

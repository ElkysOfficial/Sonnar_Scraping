#!/usr/bin/env bash
# =====================================================
# Bootstrap da VPS — instala dependencias dos 4 apps e sobe tudo via PM2.
#
# Uso na VPS (dentro da raiz do repo):
#   bash setup-vps.sh            # instala deps + pm2 start
#   bash setup-vps.sh --deps     # so instala as dependencias
#   bash setup-vps.sh --start    # so sobe os processos (pula instalacao)
#
# Idempotente: pode rodar de novo a cada deploy/git pull.
# =====================================================
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

# Apps Node: dir -> instala com npm install
NODE_APPS=(
  "packages/message-formatting-core"
  "apps/whatsapp/formatter"
  "apps/whatsapp/sender"
)

# Python da venv do scraper (mesma logica do ecosystem.config.cjs)
SCRAPER_DIR="apps/scraper"
VENV_DIR="$SCRAPER_DIR/.venv"

install_deps() {
  echo "==> Instalando dependencias Node..."
  for app in "${NODE_APPS[@]}"; do
    echo "    - $app"
    ( cd "$ROOT/$app" && npm install --omit=dev --no-audit --no-fund )
  done

  echo "==> Instalando dependencias Python (scraper)..."
  if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
  fi
  "$VENV_DIR/bin/pip" install --upgrade pip
  "$VENV_DIR/bin/pip" install -r "$SCRAPER_DIR/requirements.txt"
  # Necessario apenas para a engine simplyhired (bypass Cloudflare).
  "$VENV_DIR/bin/playwright" install --with-deps chromium || \
    echo "    (playwright chromium opcional — ignorado)"

  echo "==> Dependencias instaladas."
}

start_pm2() {
  echo "==> Subindo processos com PM2..."
  command -v pm2 >/dev/null 2>&1 || npm install -g pm2
  # Aponta o scraper para o python da venv criada acima.
  export SCRAPER_PYTHON="$ROOT/$VENV_DIR/bin/python"
  pm2 start ecosystem.config.cjs
  pm2 save
  echo "==> Pronto. 'pm2 logs' para acompanhar, 'pm2 startup' para persistir no boot."
}

case "${1:-}" in
  --deps)  install_deps ;;
  --start) start_pm2 ;;
  *)       install_deps && start_pm2 ;;
esac

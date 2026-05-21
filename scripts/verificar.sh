#!/usr/bin/env bash
# =====================================================
# verificar.sh - checagem rapida pos-deploy do Sonnar.
# Roda no servidor depois de `git pull && pm2 restart all`.
# Confirma que os 4 servicos subiram e o fluxo critico responde.
#   bash scripts/verificar.sh
# =====================================================
set -u

CORE_URL="http://localhost:3100"
FORMATTER_URL="http://localhost:3001"
falhas=0

linha() { printf '%s\n' "------------------------------------------------------------"; }
ok()    { printf '  [OK]   %s\n' "$1"; }
erro()  { printf '  [ERRO] %s\n' "$1"; falhas=$((falhas + 1)); }

linha
echo "1) Status do PM2"
linha
pm2 status
echo
echo "  -> confira a coluna restarts. Rode de novo em ~5 min:"
echo "     se os numeros subirem, o processo esta crashando."
echo

linha
echo "2) Erros recentes nos logs (core + scraper)"
linha
erros_core=$(pm2 logs sonnar-core --err --lines 40 --nostream 2>/dev/null \
  | grep -Ei 'error|enoent|falha ao gravar|cannot convert' || true)
if [ -z "$erros_core" ]; then
  ok "sonnar-core sem erros nos ultimos 40 logs"
else
  erro "sonnar-core tem erros:"; echo "$erros_core" | sed 's/^/         /'
fi

erros_scraper=$(pm2 logs sonnar-scraper --err --lines 40 --nostream 2>/dev/null \
  | grep -E 'Traceback|Error' | grep -v 'KeyboardInterrupt' || true)
if [ -z "$erros_scraper" ]; then
  ok "sonnar-scraper sem tracebacks inesperados"
else
  erro "sonnar-scraper tem tracebacks:"; echo "$erros_scraper" | sed 's/^/         /'
fi
echo

linha
echo "3) Health check do core (porta 3100)"
linha
health=$(curl -s -m 5 "$CORE_URL/health" || true)
if echo "$health" | grep -q '"status":"ok"'; then
  ok "core respondeu: $health"
  echo "$health" | grep -q '"jobsExists":true' \
    && ok "jobs.json encontrado pelo core" \
    || erro "jobsExists:false - core nao acha o jobs.json"
else
  erro "core nao respondeu em $CORE_URL/health"
fi
echo

linha
echo "4) Middleware de erro JSON (correcao da 2.3.2)"
linha
cod=$(curl -s -m 5 -o /dev/null -w '%{http_code}' \
  -X POST "$CORE_URL/jobs" -H 'Content-Type: application/json' -d '{lixo' || true)
corpo=$(curl -s -m 5 -X POST "$CORE_URL/jobs" \
  -H 'Content-Type: application/json' -d '{lixo' || true)
if [ "$cod" = "400" ] && echo "$corpo" | grep -q '"success":false'; then
  ok "JSON malformado -> HTTP 400 JSON limpo: $corpo"
else
  erro "esperado HTTP 400 JSON, veio HTTP $cod corpo: $corpo"
fi
echo

linha
echo "5) Stats do core (vagas no jobs.json)"
linha
stats=$(curl -s -m 5 "$CORE_URL/stats" || true)
if [ -n "$stats" ]; then
  ok "stats: $stats"
  echo "  -> rode o script de novo apos um ciclo de coleta;"
  echo "     o total deve subir (prova o POST /jobs/batch gravando)."
else
  erro "core nao respondeu em $CORE_URL/stats"
fi
echo

linha
echo "6) Testes unitarios do scraper"
linha
if command -v python3 >/dev/null 2>&1; then
  ( cd "$(dirname "$0")/../apps/scraper" \
    && python3 -m pytest tests/ -q 2>&1 | tail -8 )
else
  erro "python3 nao encontrado"
fi
echo

linha
if [ "$falhas" -eq 0 ]; then
  echo "RESULTADO: tudo verde. Reveja so a coluna de restarts em ~5 min."
else
  echo "RESULTADO: $falhas verificacao(oes) falharam - veja os [ERRO] acima."
fi
linha
exit "$falhas"

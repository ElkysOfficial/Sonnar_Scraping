"""
Logging estruturado JSON-line + rotação de arquivos.

Logger principal: ``scraper`` (e descendentes ``scraper.metrics``,
``scraper.engine.linkedin``, etc.).

Cada record é emitido como uma linha JSON com campos canônicos:
    ts, level, logger, msg, domain, url, jobId, statusCode, durationMs,
    retryCount, parserVersion, errorType, errorMessage, action

Use ``logger.info("detail_fetch", extra={"domain": "...", "statusCode": 200, ...})``.
"""
from __future__ import annotations

import json
import logging
import logging.handlers
import os
import sys
from datetime import datetime, timezone


_RESERVED = {
    "args", "asctime", "created", "exc_info", "exc_text", "filename",
    "funcName", "levelname", "levelno", "lineno", "message", "module",
    "msecs", "msg", "name", "pathname", "process", "processName",
    "relativeCreated", "stack_info", "thread", "threadName", "taskName",
}


_LEVEL_COLORS = {
    "DEBUG":    "\x1b[37m",   # cinza
    "INFO":     "\x1b[36m",   # ciano
    "WARNING":  "\x1b[33m",   # amarelo
    "ERROR":    "\x1b[31m",   # vermelho
    "CRITICAL": "\x1b[41;97m" # fundo vermelho
}
_RESET = "\x1b[0m"
_DIM = "\x1b[2m"


# Tradutor de event_names tecnicos para mensagens em PT-BR humanas.
# Cada handler recebe o dict de extras do LogRecord e devolve uma string.
# Mantemos apenas para o stdout (PrettyFormatter); o JSON do arquivo
# preserva os event_names originais para parsing.

def _fmt_minutes(seconds) -> str:
    try:
        m = int(seconds) // 60
    except Exception:
        return f"{seconds}s"
    if m < 60:
        return f"{m} min"
    h = m // 60
    return f"{h}h {m % 60}min" if m % 60 else f"{h}h"


def _by_engine_summary(d) -> str:
    if not isinstance(d, dict) or not d:
        return ""
    parts = [f"{k} {v}" for k, v in d.items()]
    return " (" + ", ".join(parts) + ")"


# Domains -> nome amigavel do site (sem subdomain "br.").
def _site_label(domain) -> str:
    if not domain:
        return "site"
    d = str(domain).lower()
    if d.startswith("br."):
        d = d[3:]
    if d.startswith("www."):
        d = d[4:]
    # nome do site = primeira parte antes do TLD (ex: linkedin.com -> linkedin)
    parts = d.split(".")
    return parts[0] if parts and parts[0] else d


# Causas tecnicas -> motivo em PT-BR. Usado pelo handler de "retry".
def _retry_reason(status, err) -> str:
    if status == 429:
        return "limite de requisicoes atingido"
    if status in (502, 503, 504):
        return "servidor sobrecarregado"
    if isinstance(status, int) and 500 <= status < 600:
        return f"erro do servidor (HTTP {status})"
    if err in ("ReadTimeout", "ConnectTimeout", "TimeoutException", "PoolTimeout"):
        return "demorou demais para responder"
    if err in ("ConnectError", "RemoteProtocolError", "NetworkError"):
        return "falha de conexao"
    if err:
        return f"erro de rede ({err})"
    if status:
        return f"resposta inesperada (HTTP {status})"
    return "falha desconhecida"


_HUMAN_MESSAGES = {
    # Startup
    "tracker_loaded":
        lambda e: f"Carregadas {e.get('completed', '?')} vagas que ja foram coletadas em ciclos anteriores",
    "scraper_init":
        lambda e: f"Inicializado: {e.get('local_known','?')} vagas no disco, {e.get('tracker_known','?')} registradas no banco",
    "auto_reenrich":
        lambda e: f"Releitura automatica ({e.get('engine','?')}): {e.get('requeued','?')} vagas voltam a fila por melhoria do parser",
    "reenrich_requeued":
        lambda e: f"Reagendadas {e.get('count','?')} vagas do {e.get('engine','?')} para nova coleta",
    "requeue_stale_running":
        lambda e: f"Recuperadas {e.get('count','?')} vagas que travaram durante a coleta (sem resposta ha mais de {e.get('stale_minutes','?')} min){_by_engine_summary(e.get('by_engine'))}",
    # Batch
    "batch_start":
        lambda e: f"Iniciando lote {e.get('batch_idx','?')}/{e.get('batch_total','?')} - categoria \"{e.get('category','?')}\" - stacks: {', '.join(e.get('stacks') or [])}",
    "batch_sleep":
        lambda e: f"Lote concluido. Pausando {_fmt_minutes(e.get('seconds',0))} antes do proximo",
    "batch_error":
        lambda e: f"Erro no lote da categoria {e.get('category','?')}: {e.get('errorMessage','?')}",
    # Engine
    "engine_start":
        lambda e: f"Coletando vagas do site {e.get('engine','?')}",
    "engine_error":
        lambda e: f"Falha ao coletar do site {e.get('engine','?')}",
    "reenrich_pass_start":
        lambda e: f"Reprocessando {e.get('count','?')} vagas pendentes do {e.get('engine','?')}",
    # Persist
    "persist_failed":
        lambda e: f"Falha ao salvar vaga do {e.get('engine','?')}: {e.get('errorMessage','?')[:80]}",
    "salary_failed":
        lambda e: f"Nao consegui interpretar o salario da vaga ({e.get('engine','?')})",
    # Tracker / DB
    "tracker_load_failed":
        lambda e: f"Falha ao carregar lista de vagas processadas: {e.get('errorMessage','?')[:80]}",
    "detail_parser_error":
        lambda e: f"Erro ao interpretar pagina de vaga: {e.get('errorMessage','?')[:80]}",
    # Rede / rate-limit
    "retry":
        lambda e: (
            f"Tentativa {e.get('attempt','?')} no site {_site_label(e.get('domain'))} "
            f"falhou ({_retry_reason(e.get('status'), e.get('err'))}). "
            f"Vai esperar {e.get('delay','?')}s e tentar de novo."
        ),
    "circuit_open":
        lambda e: (
            f"Site {_site_label(e.get('domain'))} com muitas falhas seguidas - "
            f"pausando requisicoes por {e.get('wait','?')}s para o site se recuperar."
        ),
}


# Logger names tecnicos -> rotulos curtos amigaveis
_LOGGER_LABELS = {
    "scraper":             "scraper",
    "scraper.controller":  "scraper",
    "scraper.tracker":     "scraper",
    "scraper.http":        "rede",
    "scraper.metrics":     "metricas",
}


def _human_message(record: logging.LogRecord) -> str | None:
    handler = _HUMAN_MESSAGES.get(record.msg)
    if handler is None:
        return None
    extras = {
        k: v for k, v in record.__dict__.items()
        if k not in _RESERVED and not k.startswith("_")
    }
    try:
        return handler(extras)
    except Exception:
        return None


def _short_logger_name(name: str) -> str:
    # mapping direto, ou pega o ultimo segmento (ex: "scraper.engine.linkedin" -> "linkedin")
    if name in _LOGGER_LABELS:
        return _LOGGER_LABELS[name]
    if "." in name:
        return name.rsplit(".", 1)[-1]
    return name


class PrettyFormatter(logging.Formatter):
    """Formato humano para stdout: HH:MM:SS  LEVEL  area  mensagem-em-portugues.

    Para event_names mapeados em ``_HUMAN_MESSAGES``, traduz a mensagem
    completa para PT-BR sem termos tecnicos. Eventos nao mapeados caem no
    formato padrao (msg + extras k=v) para nao perder informacao.
    """

    def __init__(self, *, color: bool = True):
        super().__init__()
        self.color = color

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created).strftime("%H:%M:%S")
        level = record.levelname.ljust(7)
        if self.color:
            level = f"{_LEVEL_COLORS.get(record.levelname,'')}{level}{_RESET}"
        logger_name = _short_logger_name(record.name)

        human = _human_message(record)
        if human is not None:
            msg = human
            extras_str = ""
        else:
            msg = record.getMessage()
            extras = []
            for k, v in record.__dict__.items():
                if k in _RESERVED or k.startswith("_"):
                    continue
                try:
                    json.dumps(v)
                except (TypeError, ValueError):
                    v = repr(v)
                if isinstance(v, str) and len(v) > 200:
                    v = v[:197] + "…"
                extras.append(f"{k}={v}")
            extras_str = (" " + " ".join(extras)) if extras else ""

        if self.color:
            extras_str = f"{_DIM}{extras_str}{_RESET}" if extras_str else ""
            logger_name = f"{_DIM}{logger_name}{_RESET}"

        line = f"{ts} {level} {logger_name}  {msg}{extras_str}"
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for k, v in record.__dict__.items():
            if k in _RESERVED or k.startswith("_"):
                continue
            try:
                json.dumps(v)
                payload[k] = v
            except (TypeError, ValueError):
                payload[k] = repr(v)
        if record.exc_info:
            payload["errorType"] = record.exc_info[0].__name__ if record.exc_info[0] else None
            payload["errorMessage"] = str(record.exc_info[1]) if record.exc_info[1] else None
        return json.dumps(payload, ensure_ascii=False)


_CONFIGURED = False


def setup_logging(*, log_path: str = "scraper.log", level: int = logging.INFO) -> None:
    """Idempotente. Configura ``scraper`` logger.

    Padrão:
      - arquivo  -> JSON (rotação 10 MB × 5)
      - stdout   -> pretty (texto humano, com cor se TTY)

    Override via ``SCRAPER_LOG_FORMAT=json|pretty`` (afeta o stdout).
    """
    global _CONFIGURED
    if _CONFIGURED:
        return
    logger = logging.getLogger("scraper")
    logger.setLevel(level)
    logger.propagate = False

    json_fmt = JsonFormatter()

    file_handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(json_fmt)
    logger.addHandler(file_handler)

    if os.getenv("SCRAPER_LOG_STDOUT", "1") == "1":
        fmt_choice = os.getenv("SCRAPER_LOG_FORMAT", "pretty").lower()
        stream = logging.StreamHandler(sys.stdout)
        if fmt_choice == "json":
            stream.setFormatter(json_fmt)
        else:
            stream.setFormatter(PrettyFormatter(color=sys.stdout.isatty()))
        logger.addHandler(stream)

    _CONFIGURED = True

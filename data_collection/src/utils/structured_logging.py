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


class PrettyFormatter(logging.Formatter):
    """Formato humano para stdout em dev: HH:MM:SS  LEVEL  logger  msg  k=v..."""

    def __init__(self, *, color: bool = True):
        super().__init__()
        self.color = color

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created).strftime("%H:%M:%S")
        level = record.levelname.ljust(7)
        if self.color:
            level = f"{_LEVEL_COLORS.get(record.levelname,'')}{level}{_RESET}"
        logger_name = record.name
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

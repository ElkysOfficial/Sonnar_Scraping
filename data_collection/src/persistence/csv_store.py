"""
Persistência append-only em CSV (UTF-8) para vagas extraídas.

Diferente do JSON (`LocalJobStore`), o CSV é um histórico **imutável** —
cada vaga é gravada uma vez e não é atualizada. Útil para analytics
offline (Excel, Pandas, BI) sem depender do banco.

Formato (cabeçalho gerado na criação do arquivo):
    job_url, job_title, company, location_raw, state_code, country_code,
    work_type, hiring_regime, salary_raw, salary_min, salary_max,
    salary_currency, publication_date, source, scraped_at

A escrita é thread-safe (lock) e cada linha é "flushada" imediatamente,
de modo que uma queda do processo não perca registros já gravados.
"""
from __future__ import annotations

import csv
import logging
import os
import threading
from typing import Optional


logger = logging.getLogger(__name__)


# Ordem das colunas do CSV — corresponde 1:1 ao schema da tabela jobs no Supabase
CSV_COLUMNS = [
    "job_url",
    "job_title",
    "company",
    "location_raw",
    "state_code",
    "country_code",
    "work_type",
    "hiring_regime",
    "salary_raw",
    "salary_min",
    "salary_max",
    "salary_currency",
    "publication_date",
    "source",
    "scraped_at",
]


class CSVJobStore:
    """
    Sink CSV append-only. Cria o arquivo com cabeçalho na primeira escrita.

    Args:
        path: caminho do arquivo CSV. Default: ``src/data/job.csv``.
    """

    def __init__(self, path: Optional[str] = None):
        self.path = path or os.path.join("src", "data", "job.csv")
        self._lock = threading.Lock()
        self._ensure_header()

    def _ensure_header(self) -> None:
        """Cria o arquivo + cabeçalho caso não exista (idempotente)."""
        if os.path.exists(self.path) and os.path.getsize(self.path) > 0:
            return
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        try:
            with open(self.path, "w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(CSV_COLUMNS)
        except OSError as exc:
            logger.error("Falha ao criar job.csv: %s", exc)

    def append(self, payload: dict) -> bool:
        """
        Escreve uma linha. ``payload`` deve usar as chaves de ``CSV_COLUMNS``;
        chaves faltantes viram célula vazia.

        Returns:
            True em caso de sucesso, False se falhou.
        """
        if not payload.get("job_url"):
            return False

        row = [_serialize(payload.get(col)) for col in CSV_COLUMNS]

        with self._lock:
            try:
                with open(self.path, "a", encoding="utf-8", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow(row)
                return True
            except OSError as exc:
                logger.error("Falha ao escrever no job.csv: %s", exc)
                return False


def _serialize(value) -> str:
    """Converte o valor para string segura no CSV (None → vazio)."""
    if value is None:
        return ""
    return str(value)

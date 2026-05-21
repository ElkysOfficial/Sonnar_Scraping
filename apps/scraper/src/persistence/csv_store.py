"""
Persistência append-only em CSV (UTF-8) para vagas extraídas.

Diferente do JSON (`LocalJobStore`), o CSV é um histórico **imutável** -
cada vaga é gravada uma vez e não é atualizada. Útil para analytics
offline (Excel, Pandas, BI) sem depender do banco.

Dedup: na inicialização, todas as ``job_url``s já presentes no arquivo
são carregadas em memória; ``append`` retorna False (sem gravar) se a URL
já estiver no conjunto. Garante que cada URL aparece **uma única vez** no
arquivo, mesmo entre runs.

Formato (cabeçalho gerado na criação do arquivo):
    job_url, job_title, company, location_raw, state_code, country_code,
    work_type, hiring_regime, salary_raw, salary_min, salary_max,
    salary_currency, publication_date, source, skills, description, scraped_at

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


# Caminho default ANCORADO no diretório do app, não no CWD do processo —
# mesmo motivo do LocalJobStore: evita ENOENT na escrita se o CWD mudar.
_SRC_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV_PATH = os.path.join(_SRC_DIR, "data", "job.csv")


# Ordem das colunas do CSV - corresponde 1:1 ao schema da tabela jobs no Supabase
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
    "skills",
    "description",
    "scraped_at",
]


class CSVJobStore:
    """
    Sink CSV append-only. Cria o arquivo com cabeçalho na primeira escrita.

    Args:
        path: caminho do arquivo CSV. Default: ``src/data/job.csv``.
    """

    def __init__(self, path: Optional[str] = None):
        self.path = path or DEFAULT_CSV_PATH
        self._lock = threading.Lock()
        self._seen_urls: set = set()
        self._ensure_header()
        self._load_seen_urls()

    def _load_seen_urls(self) -> None:
        """Pré-carrega todas as ``job_url``s já gravadas (para dedup append)."""
        if not os.path.exists(self.path):
            return
        try:
            with open(self.path, "r", encoding="utf-8", newline="") as f:
                reader = csv.reader(f)
                header = next(reader, [])
                if header != CSV_COLUMNS:
                    return  # header divergente já tratado por _ensure_header
                idx = 0  # job_url é a 1ª coluna
                for row in reader:
                    if row and row[idx]:
                        self._seen_urls.add(row[idx])
        except OSError as exc:
            logger.error("Falha ao pré-carregar URLs do job.csv: %s", exc)

    def has(self, job_url: str) -> bool:
        with self._lock:
            return job_url in self._seen_urls

    def _ensure_header(self) -> None:
        """Cria o arquivo + cabeçalho caso não exista (idempotente).

        Se o arquivo existe mas o cabeçalho diverge de ``CSV_COLUMNS`` (ex.:
        após adicionar novas colunas como ``skills``/``description``), rota o
        arquivo antigo para ``<path>.old-<n>`` e cria um novo. Evita escrever
        linhas com número de colunas diferente do header original.
        """
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        if os.path.exists(self.path) and os.path.getsize(self.path) > 0:
            try:
                with open(self.path, "r", encoding="utf-8", newline="") as f:
                    reader = csv.reader(f)
                    existing = next(reader, [])
                if existing == CSV_COLUMNS:
                    return
            except OSError as exc:
                logger.error("Falha ao ler header de job.csv: %s", exc)
                return
            # Header divergente → rotaciona para preservar histórico
            n = 1
            while os.path.exists(f"{self.path}.old-{n}"):
                n += 1
            try:
                os.rename(self.path, f"{self.path}.old-{n}")
                logger.warning("CSV header divergente; arquivo antigo movido para %s.old-%d", self.path, n)
            except OSError as exc:
                logger.error("Falha ao rotacionar job.csv: %s", exc)
                return
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

        Dedup: se ``payload['job_url']`` já estiver no conjunto carregado,
        retorna False sem gravar.

        Returns:
            True em caso de sucesso, False se falhou ou se já existia.
        """
        url = payload.get("job_url")
        if not url:
            return False

        row = [_serialize(payload.get(col)) for col in CSV_COLUMNS]

        with self._lock:
            if url in self._seen_urls:
                return False
            try:
                with open(self.path, "a", encoding="utf-8", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow(row)
                self._seen_urls.add(url)
                return True
            except OSError as exc:
                logger.error("Falha ao escrever no job.csv: %s", exc)
                return False


def _serialize(value) -> str:
    """Converte o valor para string segura no CSV (None → vazio).
    Listas (ex.: skills) viram string separada por '|' para preservar elementos
    sem conflitar com o delimitador do CSV.
    """
    if value is None:
        return ""
    if isinstance(value, list):
        return "|".join(str(v) for v in value)
    return str(value)

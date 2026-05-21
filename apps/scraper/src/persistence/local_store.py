"""
Buffer local de vagas em memória (UTF-8) — camada de dedup do scraper.

ARQUITETURA single-writer (mudança 2026-05)
-------------------------------------------
O scraper NÃO grava mais o ``jobs.json``. O único processo que escreve esse
arquivo é o ``message-formatting-core``. Antes, scraper e core gravavam o
mesmo arquivo — dois escritores causavam corrida no rename (``ENOENT``) e o
scraper apagava atualizações de ``sent_to`` feitas pelo core.

Agora:
  - No startup, ``_load()`` LÊ o ``jobs.json`` (escrito pelo core) só para
    semear o conjunto de dedup. Leitura é segura: há um único escritor e a
    gravação dele é atômica (rename).
  - ``upsert``/``mark_sent`` atualizam o buffer em memória e marcam a
    ``job_url`` como "suja".
  - ``drain_dirty()`` devolve as vagas sujas; o ``JobsRepository`` as envia
    ao core via HTTP (``POST /jobs/batch``) — e o core grava o arquivo.

``known_urls()``/``has()``/``get()`` continuam lendo do buffer em memória,
sempre consistente.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from typing import Dict, Iterable, List, Optional


logger = logging.getLogger(__name__)


# Caminho do jobs.json ANCORADO no diretório do app (não no CWD do processo).
# Usado apenas para LEITURA no startup — quem grava o arquivo é o core.
_SRC_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_JSON_PATH = os.path.join(_SRC_DIR, "data", "jobs.json")


class LocalJobStore:
    """Buffer de vagas em memória, thread-safe, com rastreio de vagas sujas.

    "Sujas" = vagas inseridas/alteradas desde o último ``drain_dirty()`` e que
    ainda precisam ser enviadas ao core para persistência.
    """

    def __init__(self, path: Optional[str] = None):
        self.path = path or DEFAULT_JSON_PATH
        self._lock = threading.Lock()
        self._data: Dict[str, dict] = {}
        self._dirty: set = set()
        self._load()

    # ---------------- carregamento ----------------

    def _load(self) -> None:
        """Lê o jobs.json (escrito pelo core) para semear o buffer de dedup."""
        if not os.path.exists(self.path):
            self._data = {}
            return
        try:
            with open(self.path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                self._data = json.loads(content) if content else {}
        except (json.JSONDecodeError, OSError) as exc:
            logger.error('Falha ao carregar jobs.json (%s); iniciando vazio.', exc)
            self._data = {}

    # ---------------- leitura ----------------

    def known_urls(self) -> set:
        with self._lock:
            return set(self._data.keys())

    def has(self, job_url: str) -> bool:
        with self._lock:
            return job_url in self._data

    def get(self, job_url: str) -> Optional[dict]:
        with self._lock:
            entry = self._data.get(job_url)
            return dict(entry) if entry else None

    # ---------------- escrita (buffer + marcação de sujas) ----------------

    def upsert(self, job: dict) -> None:
        url = job.get('job_url')
        if not url:
            return
        with self._lock:
            existing = self._data.get(url, {})
            sent_to = existing.get('sent_to', [])
            merged = {**existing, **job}
            merged['sent_to'] = sent_to
            self._data[url] = merged
            self._dirty.add(url)

    def mark_sent(self, job_url: str, channel: str) -> None:
        with self._lock:
            entry = self._data.get(job_url)
            if not entry:
                return
            sent = set(entry.get('sent_to', []))
            sent.add(channel)
            entry['sent_to'] = sorted(sent)
            self._dirty.add(job_url)

    def delete_older_than(self, cutoff_iso: str) -> int:
        """Remove do buffer em memória vagas com publication_date < cutoff.

        Mantém o conjunto de dedup enxuto. O purge do arquivo ``jobs.json``
        em si é responsabilidade do core (único escritor).
        """
        removed = 0
        with self._lock:
            for url in list(self._data.keys()):
                pub = self._data[url].get('publication_date')
                if pub and pub < cutoff_iso:
                    del self._data[url]
                    self._dirty.discard(url)
                    removed += 1
        return removed

    # ---------------- sincronização com o core ----------------

    def pending_count(self) -> int:
        """Quantas vagas estão sujas (aguardando envio ao core)."""
        with self._lock:
            return len(self._dirty)

    def drain_dirty(self) -> List[dict]:
        """Devolve (e limpa) as vagas marcadas como sujas desde o último drain.

        O chamador deve enviá-las ao core. Se o envio falhar, deve chamar
        ``requeue`` com as job_urls para não perder as alterações.
        """
        with self._lock:
            jobs = []
            for url in self._dirty:
                entry = self._data.get(url)
                if entry is not None:
                    jobs.append(dict(entry))
            self._dirty.clear()
            return jobs

    def requeue(self, job_urls: Iterable[str]) -> None:
        """Re-marca job_urls como sujas (usar quando o envio ao core falhar)."""
        with self._lock:
            for url in job_urls:
                if url in self._data:
                    self._dirty.add(url)

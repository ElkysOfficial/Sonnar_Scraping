"""
Persistencia local em JSON (UTF-8) para vagas extraidas.

Formato:
{
  "<job_url>": {
    "job_url": "...",
    "job_title": "...",
    "company": "...",
    "location_raw": "...",
    "state_code": "SP" | null,
    "country_code": "BR" | null,
    "work_type": "...",
    "hiring_regime": "...",
    "salary_raw": "...",
    "salary_min": 8000 | null,
    "salary_max": 12000 | null,
    "publication_date": "...",
    "source": "linkedin",
    "scraped_at": "2026-05-02T14:30:00Z",
    "sent_to": []                 // canais que ja receberam (whatsapp, discord)
  }
}

A chave eh job_url para dedup O(1) e leitura rapida pelo message_sending.
Persistido a cada job (write-through) com replace atomico (.tmp + os.replace).
"""
from __future__ import annotations

import json
import logging
import os
import threading
from typing import Dict, Optional


logger = logging.getLogger(__name__)


class LocalJobStore:
    """Store JSON UTF-8 thread-safe (lock para escritas concorrentes)."""

    def __init__(self, path: Optional[str] = None):
        self.path = path or os.path.join('src', 'data', 'jobs.json')
        self._lock = threading.Lock()
        self._data: Dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
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

    def known_urls(self) -> set:
        """Retorna o conjunto de job_urls ja persistidos. Usado pra dedup."""
        with self._lock:
            return set(self._data.keys())

    def has(self, job_url: str) -> bool:
        with self._lock:
            return job_url in self._data

    def upsert(self, job: dict) -> None:
        """
        Insere ou atualiza um job. Preserva campo 'sent_to' se ja existir
        (nao sobrescreve historico de envios).
        """
        url = job.get('job_url')
        if not url:
            return

        with self._lock:
            existing = self._data.get(url, {})
            sent_to = existing.get('sent_to', [])
            merged = {**existing, **job}
            merged['sent_to'] = sent_to
            self._data[url] = merged
            self._flush_unlocked()

    def delete_older_than(self, cutoff_iso: str) -> int:
        """Remove entries com publication_date < cutoff_iso ('YYYY-MM-DD').

        Entradas sem publication_date sao preservadas (nao da pra julgar idade).
        Retorna a quantidade removida.
        """
        removed = 0
        with self._lock:
            for url in list(self._data.keys()):
                pub = self._data[url].get('publication_date')
                if pub and pub < cutoff_iso:
                    del self._data[url]
                    removed += 1
            if removed:
                self._flush_unlocked()
        return removed

    def mark_sent(self, job_url: str, channel: str) -> None:
        """Marca que um job foi enviado por um canal especifico (idempotente)."""
        with self._lock:
            entry = self._data.get(job_url)
            if not entry:
                return
            sent = set(entry.get('sent_to', []))
            sent.add(channel)
            entry['sent_to'] = sorted(sent)
            self._flush_unlocked()

    def _flush_unlocked(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp_path = f'{self.path}.tmp'
        try:
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.path)
        except OSError as exc:
            logger.error('Falha ao gravar jobs.json: %s', exc)
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

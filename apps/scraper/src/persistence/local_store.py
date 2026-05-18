"""
Persistencia local em JSON (UTF-8) para vagas extraidas.

Formato: ver versão anterior (chave = job_url).

Mudança 2026-05: ``upsert`` é write-back **em batch**.
Antes: cada upsert reserializava o JSON inteiro (O(N) por save), bloqueando o
event loop em volumes >5k vagas.

Agora: o flush para disco acontece quando:
    - acumular FLUSH_THRESHOLD upserts pendentes, OU
    - passar FLUSH_INTERVAL_S desde o último flush, OU
    - chamada explícita de ``flush_now()``.

Isso preserva a propriedade "fonte de verdade pro message_sending" porque
toda leitura passa por ``known_urls()``/``has()``/``get()`` que lêem do
buffer em memória — sempre consistente — e o flush garante durabilidade
em janelas curtas (default 5s).

Em desligamento normal o controlador chama ``flush_now()``. Em SIGKILL
perdem-se até 5s de upserts; o CSV (append-only) e o Supabase continuam
preservando os mesmos jobs.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Dict, Optional


logger = logging.getLogger(__name__)


FLUSH_THRESHOLD = int(os.getenv("LOCAL_STORE_FLUSH_THRESHOLD", "50"))
FLUSH_INTERVAL_S = float(os.getenv("LOCAL_STORE_FLUSH_INTERVAL_S", "5.0"))


class LocalJobStore:
    """Store JSON UTF-8 thread-safe com flush em batch."""

    def __init__(self, path: Optional[str] = None):
        self.path = path or os.path.join('src', 'data', 'jobs.json')
        self._lock = threading.Lock()
        self._data: Dict[str, dict] = {}
        self._dirty = 0
        self._last_flush = 0.0
        self._load()

    # ---------------- carregamento ----------------

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
        self._last_flush = time.monotonic()

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

    # ---------------- escrita (batched) ----------------

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
            self._dirty += 1
            if self._should_flush_unlocked():
                self._flush_unlocked()

    def mark_sent(self, job_url: str, channel: str) -> None:
        with self._lock:
            entry = self._data.get(job_url)
            if not entry:
                return
            sent = set(entry.get('sent_to', []))
            sent.add(channel)
            entry['sent_to'] = sorted(sent)
            self._dirty += 1
            if self._should_flush_unlocked():
                self._flush_unlocked()

    def delete_older_than(self, cutoff_iso: str) -> int:
        removed = 0
        with self._lock:
            for url in list(self._data.keys()):
                pub = self._data[url].get('publication_date')
                if pub and pub < cutoff_iso:
                    del self._data[url]
                    removed += 1
            if removed:
                self._dirty += removed
                self._flush_unlocked()
        return removed

    def flush_now(self) -> None:
        """Força flush imediato (use no shutdown/idle)."""
        with self._lock:
            if self._dirty > 0:
                self._flush_unlocked()

    # ---------------- internos ----------------

    def _should_flush_unlocked(self) -> bool:
        if self._dirty >= FLUSH_THRESHOLD:
            return True
        if (time.monotonic() - self._last_flush) >= FLUSH_INTERVAL_S and self._dirty > 0:
            return True
        return False

    def _flush_unlocked(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp_path = f'{self.path}.tmp'
        try:
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
            # os.replace pode falhar no Windows (WinError 5 / PermissionError)
            # se outro processo estiver lendo o jobs.json naquele instante.
            # O lock e breve — tenta de novo algumas vezes antes de desistir.
            for attempt in range(8):
                try:
                    os.replace(tmp_path, self.path)
                    break
                except PermissionError:
                    if attempt == 7:
                        raise
                    time.sleep(0.25)
            self._dirty = 0
            self._last_flush = time.monotonic()
        except OSError as exc:
            logger.error('Falha ao gravar jobs.json: %s', exc)
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

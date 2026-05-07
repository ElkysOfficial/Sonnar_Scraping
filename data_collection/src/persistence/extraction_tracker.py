"""
Tracker de extração: máquina de estados por URL persistida em Supabase
(``extraction_jobs``) + dead-letter queue (``extraction_dlq``).

Estados:
    discovered  URL achada no listing, ainda não foi buscada
    running     detail-fetch em andamento
    partial     seed gravado mas detail falhou (best-effort)
    completed   dado final persistido em todos os sinks
    failed      última tentativa falhou (será reintroduzida)
    blocked     domínio em quarentena (circuit aberto)

Pipeline (controller chama):
    discover()          quando uma URL aparece no listing
    mark_running()      antes do detail-fetch
    mark_partial()      detail falhou mas seed foi gravado
    mark_completed()    após persistir em todos os sinks
    mark_failed()       erro recuperável; ao 3º vai pra DLQ

Auto-reenrichment:
    No startup, ``requeue_stale_partial(engine, parser_version)`` zera
    URLs com versão antiga - elas voltam para ``discovered`` e são
    reprocessadas no próximo passe de reenrichment.

Implementação:
    - Buffer in-memory + flush em batch (5s ou 200 transições) via upsert.
    - Idempotência via PK ``job_url``.
    - URLs ``completed`` carregadas no startup para dedup local.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional
from urllib.parse import urlparse

import httpx


logger = logging.getLogger("scraper.tracker")


MAX_ATTEMPTS = int(os.getenv("EXTRACTION_MAX_ATTEMPTS", "3"))
FLUSH_INTERVAL_S = float(os.getenv("EXTRACTION_FLUSH_INTERVAL_S", "5"))
FLUSH_THRESHOLD = int(os.getenv("EXTRACTION_FLUSH_THRESHOLD", "200"))


def _domain_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_PGRST_HINTS = {
    "PGRST102": "linhas com chaves diferentes no batch (corrigir payload).",
    "PGRST116": "RLS bloqueou a operação (verifique service_role).",
    "PGRST301": "JWT expirado ou inválido.",
    "23505":    "violação de UNIQUE (linha já existe).",
    "23502":    "coluna NOT NULL recebeu NULL.",
    "23503":    "FK quebrada (referência inexistente).",
    "42P01":    "tabela não existe (migration faltando?).",
    "42501":    "permissão negada (RLS ou GRANT).",
}


def _humanize_postgrest_error(sink: str, status: int, body: str) -> str:
    """Transforma erro do PostgREST em mensagem legível para o operador."""
    import json
    code = ""
    message = ""
    try:
        payload = json.loads(body) if body else {}
        code = payload.get("code") or ""
        message = payload.get("message") or ""
    except Exception:
        message = (body or "")[:200]

    sink_label = {
        "extraction_jobs":   "salvar vagas em processamento",
        "extraction_dlq":    "salvar dead-letter queue",
        "dlq_remove":        "limpar entradas migradas para DLQ",
    }.get(sink, sink)

    hint = _PGRST_HINTS.get(code, "")
    parts = [f"Falha ao {sink_label} no Supabase (HTTP {status})"]
    if code:
        parts.append(f"código={code}")
    if message:
        parts.append(f'"{message}"')
    if hint:
        parts.append(f"→ {hint}")
    return " | ".join(parts)


@dataclass
class _Pending:
    job_url: str
    domain: str
    engine: str
    state: str
    attempts: int = 0
    parser_version: Optional[str] = None
    payload_hash: Optional[str] = None
    last_error_type: Optional[str] = None
    last_error_msg: Optional[str] = None
    discovered_at: Optional[str] = None
    last_attempt_at: Optional[str] = None
    completed_at: Optional[str] = None


class ExtractionTracker:
    def __init__(self):
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.enabled = bool(url and key)
        self._url = url
        self._key = key
        self._pending: Dict[str, _Pending] = {}
        self._dlq_buffer: List[dict] = []
        self._dlq_remove: set[str] = set()
        self._completed: set[str] = set()
        self._attempts_local: Dict[str, int] = defaultdict(int)
        self._lock = asyncio.Lock()
        self._last_flush = time.monotonic()
        # Throttle de logs repetidos: (sink, http_status, code) -> (count, last_logged_at)
        self._warn_throttle: Dict[tuple, tuple] = {}

    # Helper: loga warning agregando repetições (uma a cada 60s).
    def _warn_throttled(self, sink: str, status: int, body: str) -> None:
        # Tenta extrair "code" do JSON do PostgREST para agrupar erros similares.
        code = ""
        try:
            import json
            payload = json.loads(body) if body else {}
            code = (payload.get("code") or payload.get("message") or "")[:40]
        except Exception:
            code = body[:40]

        bucket = (sink, status, code)
        now = time.monotonic()
        count, last_at = self._warn_throttle.get(bucket, (0, 0.0))
        count += 1

        # Loga: primeira vez OU pelo menos 60s desde o último log do mesmo bucket.
        if count == 1 or (now - last_at) >= 60.0:
            human = _humanize_postgrest_error(sink, status, body)
            suffix = f" (vista {count}x desde a última mensagem)" if count > 1 else ""
            logger.warning("%s%s", human, suffix)
            self._warn_throttle[bucket] = (0, now)
        else:
            self._warn_throttle[bucket] = (count, last_at)

    # ---------------- bootstrap ----------------

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=f"{self._url}/rest/v1",
            headers={
                "apikey": self._key,
                "Authorization": f"Bearer {self._key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            timeout=15.0,
        )

    async def load_completed(self) -> set:
        """Pré-carrega URLs em estado completed para dedup local."""
        if not self.enabled:
            return set()
        try:
            seen: set = set()
            async with self._client() as cli:
                offset = 0
                while True:
                    r = await cli.get(
                        "/extraction_jobs",
                        params={
                            "select": "job_url",
                            "state": "eq.completed",
                            "limit": "1000",
                            "offset": str(offset),
                        },
                    )
                    if r.status_code != 200:
                        break
                    rows = r.json()
                    if not rows:
                        break
                    for row in rows:
                        seen.add(row["job_url"])
                    if len(rows) < 1000:
                        break
                    offset += 1000
            self._completed = seen
            logger.info("tracker_loaded", extra={"completed": len(seen)})
            return set(seen)
        except Exception as exc:
            logger.warning("tracker_load_failed", extra={"errorMessage": str(exc)})
            return set()

    async def requeue_stale_partial(self, engine: str, parser_version: str) -> int:
        """Marca URLs com parser_version antiga como discovered.
        Chamada no startup por engine. Devolve quantas linhas afetadas."""
        if not self.enabled or not engine or not parser_version:
            return 0
        try:
            async with self._client() as cli:
                r = await cli.post(
                    "/rpc/requeue_stale_partial",
                    json={"p_engine": engine, "p_parser_version": parser_version},
                )
                if r.status_code != 200:
                    logger.warning("requeue_stale_partial status=%s body=%s",
                                   r.status_code, r.text[:200])
                    return 0
                count = int(r.json() or 0)
                if count:
                    logger.info("reenrich_requeued", extra={
                        "engine": engine, "parser_version": parser_version,
                        "count": count,
                    })
                return count
        except Exception as exc:
            logger.warning("requeue_stale_partial erro: %s", exc)
            return 0

    async def pick_pending(self, engine: str, limit: int = 100) -> List[str]:
        """URLs em state=discovered para reprocessar (passe de reenrichment)."""
        if not self.enabled:
            return []
        try:
            async with self._client() as cli:
                r = await cli.post(
                    "/rpc/pick_pending_urls",
                    json={"p_engine": engine, "p_limit": limit},
                )
                if r.status_code != 200:
                    return []
                rows = r.json() or []
                return [row["job_url"] for row in rows]
        except Exception as exc:
            logger.warning("pick_pending erro: %s", exc)
            return []

    def known_completed(self) -> set:
        return set(self._completed)

    # ---------------- API de transição ----------------

    def discover(self, job_url: str, *, engine: str) -> None:
        if not job_url or job_url in self._completed:
            return
        existing = self._pending.get(job_url)
        if existing and existing.state in ("running", "completed"):
            return
        self._pending[job_url] = _Pending(
            job_url=job_url,
            domain=_domain_of(job_url),
            engine=engine,
            state=existing.state if existing else "discovered",
            attempts=self._attempts_local[job_url],
            discovered_at=_now_iso() if not existing else existing.discovered_at,
        )

    def mark_running(self, job_url: str, *, engine: str) -> None:
        if not job_url:
            return
        p = self._pending.get(job_url) or _Pending(
            job_url=job_url, domain=_domain_of(job_url),
            engine=engine, state="discovered", discovered_at=_now_iso(),
        )
        self._attempts_local[job_url] += 1
        p.state = "running"
        p.attempts = self._attempts_local[job_url]
        p.last_attempt_at = _now_iso()
        p.engine = engine
        self._pending[job_url] = p

    def mark_partial(self, job_url: str, *, engine: str,
                     parser_version: Optional[str] = None) -> None:
        if not job_url:
            return
        p = self._pending.setdefault(job_url, _Pending(
            job_url=job_url, domain=_domain_of(job_url),
            engine=engine, state="partial", discovered_at=_now_iso(),
        ))
        p.state = "partial"
        p.engine = engine
        if parser_version:
            p.parser_version = parser_version

    def mark_completed(self, job_url: str, *, engine: str,
                       parser_version: Optional[str] = None,
                       payload_hash: Optional[str] = None) -> None:
        if not job_url:
            return
        self._completed.add(job_url)
        self._attempts_local.pop(job_url, None)
        p = self._pending.setdefault(job_url, _Pending(
            job_url=job_url, domain=_domain_of(job_url),
            engine=engine, state="completed", discovered_at=_now_iso(),
        ))
        p.state = "completed"
        p.engine = engine
        p.completed_at = _now_iso()
        if parser_version:
            p.parser_version = parser_version
        if payload_hash:
            p.payload_hash = payload_hash
        p.last_error_type = None
        p.last_error_msg = None

    def mark_failed(self, job_url: str, *, engine: str,
                    error_type: Optional[str] = None,
                    error_msg: Optional[str] = None,
                    blocked: bool = False) -> None:
        if not job_url:
            return
        attempts = self._attempts_local.get(job_url, 0)
        if attempts >= MAX_ATTEMPTS:
            existing = self._pending.get(job_url)
            self._dlq_buffer.append({
                "job_url": job_url,
                "domain": _domain_of(job_url),
                "engine": engine,
                "attempts": attempts,
                "last_error_type": error_type,
                "last_error_msg": (error_msg or "")[:500],
                "parser_version": existing.parser_version if existing else None,
                "discovered_at": existing.discovered_at if existing else None,
                "failed_at": _now_iso(),
            })
            self._dlq_remove.add(job_url)
            self._pending.pop(job_url, None)
            self._attempts_local.pop(job_url, None)
            return

        p = self._pending.setdefault(job_url, _Pending(
            job_url=job_url, domain=_domain_of(job_url),
            engine=engine, state="failed", discovered_at=_now_iso(),
        ))
        p.state = "blocked" if blocked else "failed"
        p.engine = engine
        p.attempts = attempts
        p.last_attempt_at = _now_iso()
        if error_type:
            p.last_error_type = error_type
        if error_msg:
            p.last_error_msg = error_msg[:500]

    # ---------------- flush ----------------

    async def flush(self) -> None:
        if not self.enabled:
            self._pending.clear()
            self._dlq_buffer.clear()
            self._dlq_remove.clear()
            return

        async with self._lock:
            # PostgREST batch insert exige chaves idênticas em todas as linhas
            # (PGRST102 "All object keys must match"). Garantimos isso enviando
            # todos os campos do dataclass — None vira NULL no banco.
            jobs_payload = [dict(p.__dict__) for p in self._pending.values()]
            dlq_payload = list(self._dlq_buffer)
            dlq_remove = list(self._dlq_remove)
            self._pending.clear()
            self._dlq_buffer.clear()
            self._dlq_remove.clear()
            self._last_flush = time.monotonic()

        if not jobs_payload and not dlq_payload and not dlq_remove:
            return

        try:
            async with self._client() as cli:
                if jobs_payload:
                    r = await cli.post(
                        "/extraction_jobs", json=jobs_payload,
                        params={"on_conflict": "job_url"},
                    )
                    if r.status_code >= 400:
                        self._warn_throttled("extraction_jobs", r.status_code, r.text)
                if dlq_payload:
                    r = await cli.post("/extraction_dlq", json=dlq_payload)
                    if r.status_code >= 400:
                        self._warn_throttled("extraction_dlq", r.status_code, r.text)
                if dlq_remove:
                    in_list = ",".join(f'"{u}"' for u in dlq_remove)
                    r = await cli.delete(
                        "/extraction_jobs",
                        params={"job_url": f"in.({in_list})"},
                    )
                    if r.status_code >= 400:
                        self._warn_throttled("dlq_remove", r.status_code, r.text)
        except Exception as exc:
            logger.warning("Falha ao conectar com Supabase para flush do tracker: %s", exc)

    def _should_flush(self) -> bool:
        if len(self._pending) >= FLUSH_THRESHOLD:
            return True
        if (time.monotonic() - self._last_flush) >= FLUSH_INTERVAL_S:
            return bool(self._pending or self._dlq_buffer or self._dlq_remove)
        return False

    async def run_flusher(self, interval_s: float = FLUSH_INTERVAL_S) -> None:
        while True:
            try:
                await asyncio.sleep(interval_s)
                if self._should_flush():
                    await self.flush()
            except asyncio.CancelledError:
                try:
                    await self.flush()
                except Exception:
                    pass
                raise
            except Exception as exc:
                logger.warning("tracker flusher loop erro: %s", exc)


tracker = ExtractionTracker()

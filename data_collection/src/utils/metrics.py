"""
Coletor de métricas in-memory + flush periódico para Supabase.

Alimenta a página ``/admin/scraper`` do dashboard:
    extraction_metrics  série temporal (counter/gauge/timer agregado por janela)
    extraction_events   eventos discretos (429, circuit open, parser error, ...)

Uso:
    from src.utils.metrics import metrics
    metrics.incr("status.429", domain="linkedin.com")
    metrics.observe_request("linkedin.com", status=200, duration_ms=842)
    metrics.event("circuit.open", domain="linkedin.com", wait_s=900)

Flush:
    asyncio.create_task(metrics.run_flusher(interval_s=30))
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import httpx


logger = logging.getLogger("scraper.metrics")


_HOST = socket.gethostname()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class _Bucket:
    counters: dict = field(default_factory=lambda: defaultdict(int))
    gauges: dict = field(default_factory=dict)
    durations: dict = field(default_factory=lambda: defaultdict(list))


class MetricsCollector:
    """Acumula métricas em memória, flusha em batch para o Supabase."""

    def __init__(self, max_event_buffer: int = 500):
        self._lock = asyncio.Lock()
        self._bucket = _Bucket()
        self._events: deque = deque(maxlen=max_event_buffer)

    # ---------------- API pública ----------------

    def incr(self, key: str, *, domain: str = "", value: int = 1) -> None:
        self._bucket.counters[(key, domain)] += value

    def set_gauge(self, key: str, value: float, *, domain: str = "") -> None:
        self._bucket.gauges[(key, domain)] = float(value)

    def observe_request(self, domain: str, *, status: Optional[int],
                        duration_ms: int, error_type: Optional[str] = None) -> None:
        self._bucket.counters[("req.total", domain)] += 1
        if status is not None:
            self._bucket.counters[(f"status.{status // 100}xx", domain)] += 1
            self._bucket.counters[(f"status.{status}", domain)] += 1
        if error_type:
            self._bucket.counters[(f"err.{error_type}", domain)] += 1
        self._bucket.durations[domain].append(duration_ms)

    def event(self, kind: str, *, domain: str = "", **fields) -> None:
        self._events.append({
            "ts": _now_iso(),
            "host": _HOST,
            "kind": kind,
            "domain": domain,
            "data": fields or None,
        })

    # ---------------- Snapshot in-memory ----------------

    def snapshot_counters(self) -> dict:
        return {
            "counters": {f"{k}|{d}": v for (k, d), v in self._bucket.counters.items()},
            "gauges":   {f"{k}|{d}": v for (k, d), v in self._bucket.gauges.items()},
            "events":   list(self._events),
        }

    # ---------------- Flush para Supabase ----------------

    def _drain(self) -> tuple[list[dict], list[dict]]:
        """Drena bucket para listas prontas para upsert."""
        rows: list[dict] = []
        ts = _now_iso()

        # counters
        for (key, dom), value in self._bucket.counters.items():
            rows.append({
                "ts": ts, "host": _HOST, "domain": dom or None,
                "metric_type": "counter", "metric_key": key, "value": float(value),
            })
        # gauges
        for (key, dom), value in self._bucket.gauges.items():
            rows.append({
                "ts": ts, "host": _HOST, "domain": dom or None,
                "metric_type": "gauge", "metric_key": key, "value": float(value),
            })
        # latência por domínio (p50, p95, count)
        for dom, samples in self._bucket.durations.items():
            if not samples:
                continue
            samples.sort()
            n = len(samples)
            p50 = samples[n // 2]
            p95 = samples[min(n - 1, int(n * 0.95))]
            rows.append({"ts": ts, "host": _HOST, "domain": dom,
                         "metric_type": "gauge", "metric_key": "latency.p50_ms", "value": float(p50)})
            rows.append({"ts": ts, "host": _HOST, "domain": dom,
                         "metric_type": "gauge", "metric_key": "latency.p95_ms", "value": float(p95)})
            rows.append({"ts": ts, "host": _HOST, "domain": dom,
                         "metric_type": "counter", "metric_key": "req.sampled", "value": float(n)})

        events = list(self._events)
        # reset
        self._bucket = _Bucket()
        self._events.clear()
        return rows, events

    async def flush(self) -> None:
        """Envia métricas e eventos acumulados ao Supabase."""
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            return

        async with self._lock:
            rows, events = self._drain()

        if not rows and not events:
            return

        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        try:
            async with httpx.AsyncClient(base_url=f"{url}/rest/v1",
                                         headers=headers, timeout=10.0) as cli:
                if rows:
                    r = await cli.post("/extraction_metrics", json=rows)
                    if r.status_code >= 400:
                        logger.warning("metrics flush metrics status=%s body=%s",
                                       r.status_code, r.text[:200])
                if events:
                    r = await cli.post("/extraction_events", json=events)
                    if r.status_code >= 400:
                        logger.warning("metrics flush events status=%s body=%s",
                                       r.status_code, r.text[:200])
        except Exception as exc:
            logger.warning("metrics flush erro: %s", exc)

    async def flush_circuits(self, snapshot: dict) -> None:
        """Sobrescreve estado atual dos circuits no Supabase."""
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key or not snapshot:
            return
        rows = []
        for dom, st in snapshot.items():
            rows.append({
                "domain": dom,
                "state": st["state"],
                "open_until_s": st["open_until_s"],
                "error_rate": st["error_rate"],
                "failures_5m": st["failures_5m"],
                "successes_5m": st["successes_5m"],
                "updated_at": _now_iso(),
            })
        if not rows:
            return
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        }
        try:
            async with httpx.AsyncClient(base_url=f"{url}/rest/v1",
                                         headers=headers, timeout=10.0) as cli:
                r = await cli.post("/domain_circuits", json=rows,
                                   params={"on_conflict": "domain"})
                if r.status_code >= 400:
                    logger.warning("circuits flush status=%s body=%s",
                                   r.status_code, r.text[:200])
        except Exception as exc:
            logger.warning("circuits flush erro: %s", exc)

    async def run_flusher(self, interval_s: float = 30.0) -> None:
        """Loop infinito que flusha periodicamente. Spawn como task."""
        # Lazy import para evitar ciclo
        from .rate_limiter import snapshot as rl_snapshot
        while True:
            try:
                await asyncio.sleep(interval_s)
                await self.flush()
                snap = rl_snapshot()
                await self.flush_circuits(snap.get("circuits") or {})
            except asyncio.CancelledError:
                # flush final
                try:
                    await self.flush()
                except Exception:
                    pass
                raise
            except Exception as exc:
                logger.warning("metrics flusher loop erro: %s", exc)


metrics = MetricsCollector()

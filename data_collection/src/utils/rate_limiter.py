"""
Rate limit, retry com backoff/jitter e circuit breaker por domínio.

Componentes:
    DomainRateLimiter   token bucket assíncrono por host
    CircuitBreaker      estado por host: closed | open | half_open
    RetryPolicy         matriz de decisão por status / tipo de erro
    request_with_policy wrapper único: GET com rate-limit + retry + circuit

Uso:
    from src.utils.rate_limiter import request_with_policy, get_metrics
    resp = await request_with_policy(client, url, domain="linkedin.com")
    # resp pode ser None se circuit estiver aberto ou política decidir DLQ.
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Optional, Dict
from urllib.parse import urlparse

import httpx

from .metrics import metrics


logger = logging.getLogger("scraper")


# ------------------------------------------------------------------
# Configuração por domínio (defaults conservadores)
# ------------------------------------------------------------------

@dataclass
class DomainConfig:
    rate_per_sec: float = 0.5     # ~1 req a cada 2s
    burst: int = 2
    concurrency: int = 3
    base_backoff_s: float = 2.0
    max_backoff_s: float = 120.0
    max_retries: int = 3


_DEFAULT_DOMAIN_CONFIG = DomainConfig()

_DOMAIN_CONFIGS: Dict[str, DomainConfig] = {
    # LinkedIn: backoff maior (8s base, 300s teto) — IP marcado por 429
    # demora minutos para esfriar. Backoff de 2s do default reentra ainda
    # marcado, gera novo 429 imediato.
    "linkedin.com":   DomainConfig(rate_per_sec=0.4, burst=2, concurrency=2,
                                   base_backoff_s=8.0, max_backoff_s=300.0),
    "br.linkedin.com": DomainConfig(rate_per_sec=0.4, burst=2, concurrency=2,
                                    base_backoff_s=8.0, max_backoff_s=300.0),
    "indeed.com":     DomainConfig(rate_per_sec=0.4, burst=2, concurrency=2),
    "br.indeed.com":  DomainConfig(rate_per_sec=0.4, burst=2, concurrency=2),
    "jooble.org":     DomainConfig(rate_per_sec=0.5, burst=2, concurrency=3),
    "br.jooble.org":  DomainConfig(rate_per_sec=0.5, burst=2, concurrency=3),
    "gupy.io":        DomainConfig(rate_per_sec=0.7, burst=3, concurrency=3),
    "weworkremotely.com": DomainConfig(rate_per_sec=1.0, burst=3, concurrency=3),
}


def domain_of(url: str) -> str:
    """Devolve o host (sem porta) lowercased. ``""`` se não for parseável."""
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return ""
    return host.lower()


def _config_for(domain: str) -> DomainConfig:
    return _DOMAIN_CONFIGS.get(domain, _DEFAULT_DOMAIN_CONFIG)


# ------------------------------------------------------------------
# Token bucket por domínio + semáforo de concorrência
# ------------------------------------------------------------------

class _TokenBucket:
    """Token bucket assíncrono. Cada ``acquire()`` consome 1 token."""

    def __init__(self, rate_per_sec: float, burst: int):
        self.rate = rate_per_sec
        self.capacity = burst
        self.tokens = float(burst)
        self.last = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
            self.last = now
            if self.tokens < 1.0:
                wait = (1.0 - self.tokens) / max(self.rate, 0.001)
                await asyncio.sleep(wait + random.uniform(0, wait * 0.3))
                self.tokens = 0.0
                self.last = time.monotonic()
            else:
                self.tokens -= 1.0


class DomainRateLimiter:
    """Token bucket + semáforo por domínio. Ajusta rate dinamicamente."""

    def __init__(self):
        self._buckets: Dict[str, _TokenBucket] = {}
        self._sems: Dict[str, asyncio.Semaphore] = {}
        self._effective_rate: Dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def _ensure(self, domain: str) -> tuple[_TokenBucket, asyncio.Semaphore]:
        if domain in self._buckets:
            return self._buckets[domain], self._sems[domain]
        async with self._lock:
            if domain not in self._buckets:
                cfg = _config_for(domain)
                self._buckets[domain] = _TokenBucket(cfg.rate_per_sec, cfg.burst)
                self._sems[domain] = asyncio.Semaphore(cfg.concurrency)
                self._effective_rate[domain] = cfg.rate_per_sec
            return self._buckets[domain], self._sems[domain]

    async def acquire(self, domain: str) -> asyncio.Semaphore:
        bucket, sem = await self._ensure(domain)
        await bucket.acquire()
        return sem

    def slow_down(self, domain: str, factor: float = 0.5) -> None:
        """Reduz rate efetivo (após 429/timeouts)."""
        bucket = self._buckets.get(domain)
        if not bucket:
            return
        new_rate = max(0.05, bucket.rate * factor)
        bucket.rate = new_rate
        self._effective_rate[domain] = new_rate
        metrics.set_gauge("rate.effective", new_rate, domain=domain)

    def speed_up(self, domain: str, factor: float = 1.2) -> None:
        cfg = _config_for(domain)
        bucket = self._buckets.get(domain)
        if not bucket:
            return
        new_rate = min(cfg.rate_per_sec, bucket.rate * factor)
        bucket.rate = new_rate
        self._effective_rate[domain] = new_rate
        metrics.set_gauge("rate.effective", new_rate, domain=domain)

    def snapshot(self) -> Dict[str, float]:
        return dict(self._effective_rate)


# ------------------------------------------------------------------
# Circuit breaker por domínio
# ------------------------------------------------------------------

@dataclass
class _CircuitState:
    state: str = "closed"     # closed | open | half_open
    open_until: float = 0.0
    consecutive_failures: int = 0
    failures_window: list = field(default_factory=list)   # timestamps
    successes_window: list = field(default_factory=list)
    open_count: int = 0


class CircuitBreaker:
    """Circuit por domínio. Usa janela de 5min e taxa de erro >40% sobre n>=20."""

    WINDOW_S = 300.0
    MIN_REQUESTS = 20
    ERROR_THRESHOLD = 0.40
    OPEN_BASE_S = 900.0           # 15 min
    OPEN_MAX_S = 7200.0           # 2 h

    def __init__(self):
        self._states: Dict[str, _CircuitState] = {}

    def _state_for(self, domain: str) -> _CircuitState:
        st = self._states.get(domain)
        if st is None:
            st = _CircuitState()
            self._states[domain] = st
        return st

    def can_request(self, domain: str) -> bool:
        st = self._state_for(domain)
        now = time.monotonic()
        if st.state == "open":
            if now >= st.open_until:
                st.state = "half_open"
                metrics.event("circuit.half_open", domain=domain)
                return True
            return False
        return True

    def record_success(self, domain: str) -> None:
        st = self._state_for(domain)
        now = time.monotonic()
        st.successes_window.append(now)
        st.consecutive_failures = 0
        self._gc_window(st, now)
        if st.state == "half_open":
            st.state = "closed"
            metrics.event("circuit.closed", domain=domain)

    def record_failure(self, domain: str, fatal: bool = False) -> bool:
        """Registra falha. Devolve True se circuito acabou de abrir."""
        st = self._state_for(domain)
        now = time.monotonic()
        st.failures_window.append(now)
        st.consecutive_failures += 1
        self._gc_window(st, now)

        if st.state == "half_open" and fatal:
            return self._open(domain, st, now)

        total = len(st.failures_window) + len(st.successes_window)
        if total >= self.MIN_REQUESTS:
            err_rate = len(st.failures_window) / total
            if err_rate >= self.ERROR_THRESHOLD and st.state != "open":
                return self._open(domain, st, now)
        return False

    def _open(self, domain: str, st: _CircuitState, now: float) -> bool:
        st.open_count += 1
        wait = min(self.OPEN_MAX_S, self.OPEN_BASE_S * (2 ** (st.open_count - 1)))
        st.open_until = now + wait
        st.state = "open"
        metrics.event("circuit.open", domain=domain, wait_s=int(wait))
        logger.warning("circuit OPEN domain=%s wait=%ds", domain, int(wait))
        return True

    def _gc_window(self, st: _CircuitState, now: float) -> None:
        cutoff = now - self.WINDOW_S
        st.failures_window = [t for t in st.failures_window if t >= cutoff]
        st.successes_window = [t for t in st.successes_window if t >= cutoff]

    def snapshot(self) -> Dict[str, dict]:
        out = {}
        now = time.monotonic()
        for d, st in self._states.items():
            self._gc_window(st, now)
            total = len(st.failures_window) + len(st.successes_window)
            err_rate = len(st.failures_window) / total if total else 0.0
            out[d] = {
                "state": st.state,
                "open_until_s": max(0.0, st.open_until - now) if st.state == "open" else 0.0,
                "error_rate": err_rate,
                "failures_5m": len(st.failures_window),
                "successes_5m": len(st.successes_window),
            }
        return out


# ------------------------------------------------------------------
# Retry policy
# ------------------------------------------------------------------

# Status -> (deve_retry, e_fatal_pro_circuito)
_STATUS_RULES = {
    200: (False, False), 201: (False, False), 202: (False, False), 204: (False, False),
    301: (False, False), 302: (False, False),
    400: (False, False), 404: (False, False), 410: (False, False), 451: (False, True),
    401: (False, True), 403: (False, True),
    408: (True, False),
    429: (True, True),
    500: (True, False), 502: (True, False), 503: (True, False), 504: (True, False),
}


def _should_retry(status: Optional[int], err: Optional[Exception]) -> tuple[bool, bool]:
    """Devolve (retry?, fatal_for_circuit?)."""
    if err is not None:
        # timeouts e erros de rede => retry, fatal somente se persistente
        if isinstance(err, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)):
            return True, False
        return False, True
    if status is None:
        return True, False
    return _STATUS_RULES.get(status, (False, status >= 500))


def _backoff_delay(attempt: int, base: float, cap: float, retry_after: Optional[float] = None) -> float:
    exp = base * (2 ** attempt)
    if retry_after is not None:
        exp = max(exp, retry_after)
    delay = min(cap, exp)
    return delay + random.uniform(0, delay * 0.3)


def _parse_retry_after(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------
# Singleton compartilhado
# ------------------------------------------------------------------

_LIMITER = DomainRateLimiter()
_BREAKER = CircuitBreaker()


def get_limiter() -> DomainRateLimiter:
    return _LIMITER


def get_breaker() -> CircuitBreaker:
    return _BREAKER


# ------------------------------------------------------------------
# Wrapper público
# ------------------------------------------------------------------

async def request_with_policy(
    client: httpx.AsyncClient,
    url: str,
    *,
    method: str = "GET",
    domain: Optional[str] = None,
    follow_redirects: bool = True,
    **kwargs,
) -> Optional[httpx.Response]:
    """
    GET (ou outro método) com rate-limit + retry/backoff + circuit breaker.

    Devolve ``httpx.Response`` (mesmo em status de erro 4xx que não retentamos)
    ou ``None`` quando: circuit aberto, retries esgotados, ou erro fatal.
    """
    dom = domain or domain_of(url)
    if not _BREAKER.can_request(dom):
        metrics.incr("req.skipped_circuit", domain=dom)
        return None

    cfg = _config_for(dom)
    attempts = 0
    last_resp: Optional[httpx.Response] = None

    while attempts <= cfg.max_retries:
        sem = await _LIMITER.acquire(dom)
        async with sem:
            t0 = time.monotonic()
            err: Optional[Exception] = None
            resp: Optional[httpx.Response] = None
            try:
                resp = await client.request(
                    method, url, follow_redirects=follow_redirects, **kwargs
                )
            except httpx.HTTPError as e:
                err = e
            duration_ms = int((time.monotonic() - t0) * 1000)

        status = resp.status_code if resp is not None else None
        metrics.observe_request(dom, status=status, duration_ms=duration_ms,
                                error_type=type(err).__name__ if err else None)

        retry, fatal = _should_retry(status, err)

        if not retry:
            if status and status < 400:
                _BREAKER.record_success(dom)
                _LIMITER.speed_up(dom)
            elif fatal:
                _BREAKER.record_failure(dom, fatal=True)
            return resp

        # vamos retry
        _BREAKER.record_failure(dom, fatal=fatal)
        if status == 429:
            _LIMITER.slow_down(dom, factor=0.5)
            metrics.incr("status.429", domain=dom)
        elif status and 500 <= status < 600:
            metrics.incr("status.5xx", domain=dom)

        if attempts == cfg.max_retries:
            metrics.incr("retry.exhausted", domain=dom)
            return resp

        retry_after = _parse_retry_after(
            resp.headers.get("Retry-After") if resp is not None else None
        )
        delay = _backoff_delay(attempts, cfg.base_backoff_s, cfg.max_backoff_s, retry_after)
        metrics.incr("retry.attempt", domain=dom)
        logger.info(
            "retry domain=%s url=%s status=%s err=%s attempt=%d delay=%.1fs",
            dom, url, status, type(err).__name__ if err else None,
            attempts + 1, delay,
        )
        await asyncio.sleep(delay)
        attempts += 1
        last_resp = resp

    return last_resp


def snapshot() -> dict:
    return {
        "rates": _LIMITER.snapshot(),
        "circuits": _BREAKER.snapshot(),
    }


# ------------------------------------------------------------------
# apply_policy: variante genérica para clientes síncronos
# (curl_cffi, cloudscraper). Aceita qualquer callable que devolva
# um objeto-resposta com ``.status_code`` e ``.headers``.
# ------------------------------------------------------------------

def _is_sync_network_error(exc: Exception) -> bool:
    name = type(exc).__name__.lower()
    return any(token in name for token in ("timeout", "connect", "ssl", "read", "remote"))


async def apply_policy(domain: str, do_request, *, max_retries: Optional[int] = None):
    """Roda ``do_request()`` (sync ou async) sob a mesma política do
    ``request_with_policy``. Para clientes sync (curl_cffi/cloudscraper)
    a chamada é despachada via ``asyncio.to_thread`` pra não bloquear
    o event loop.

    Devolve a resposta da última tentativa (ou None se circuit aberto).
    """
    if not _BREAKER.can_request(domain):
        metrics.incr("req.skipped_circuit", domain=domain)
        return None

    cfg = _config_for(domain)
    retries = cfg.max_retries if max_retries is None else max_retries
    attempts = 0

    while attempts <= retries:
        sem = await _LIMITER.acquire(domain)
        async with sem:
            t0 = time.monotonic()
            err: Optional[Exception] = None
            resp = None
            try:
                if asyncio.iscoroutinefunction(do_request):
                    resp = await do_request()
                else:
                    resp = await asyncio.to_thread(do_request)
            except Exception as e:
                err = e
            duration_ms = int((time.monotonic() - t0) * 1000)

        status = getattr(resp, "status_code", None) if resp is not None else None
        metrics.observe_request(domain, status=status, duration_ms=duration_ms,
                                error_type=type(err).__name__ if err else None)

        # decide retry
        if err is not None:
            retry, fatal = (_is_sync_network_error(err), False)
        elif status is None:
            retry, fatal = True, False
        else:
            retry, fatal = _STATUS_RULES.get(status, (False, status >= 500))

        if not retry:
            if status and status < 400:
                _BREAKER.record_success(domain)
                _LIMITER.speed_up(domain)
            elif fatal:
                _BREAKER.record_failure(domain, fatal=True)
            return resp

        _BREAKER.record_failure(domain, fatal=fatal)
        if status == 429:
            _LIMITER.slow_down(domain, factor=0.5)
            metrics.incr("status.429", domain=domain)
        elif status and 500 <= status < 600:
            metrics.incr("status.5xx", domain=domain)

        if attempts == retries:
            metrics.incr("retry.exhausted", domain=domain)
            return resp

        retry_after_hdr = None
        if resp is not None and hasattr(resp, "headers"):
            try:
                retry_after_hdr = resp.headers.get("Retry-After")
            except Exception:
                retry_after_hdr = None
        delay = _backoff_delay(attempts, cfg.base_backoff_s, cfg.max_backoff_s,
                               _parse_retry_after(retry_after_hdr))
        metrics.incr("retry.attempt", domain=domain)
        logger.info(
            "retry domain=%s status=%s err=%s attempt=%d delay=%.1fs",
            domain, status, type(err).__name__ if err else None,
            attempts + 1, delay,
        )
        await asyncio.sleep(delay)
        attempts += 1

    return None

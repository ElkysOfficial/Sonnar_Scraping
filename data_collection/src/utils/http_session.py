"""
Sessão httpx compartilhada (singleton por event loop) com pool e timeouts
adequados para VPS pequena, e helper ``fetch`` que aplica rate-limit +
retry + circuit breaker via :mod:`src.utils.rate_limiter`.

Uso recomendado:

    from src.utils.http_session import HttpSession, fetch
    _SESSION = HttpSession()
    client = await _SESSION.get_client()
    resp = await fetch(client, url)             # passa pelo policy wrapper
    if resp is None or resp.status_code != 200: ...

Se precisar de raw client (sem policy), basta usar ``await client.get(url)``.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Dict, Optional

import httpx


logger = logging.getLogger("scraper.http")


_DEFAULT_TIMEOUT = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=5.0)
_DEFAULT_LIMITS = httpx.Limits(
    max_connections=20,
    max_keepalive_connections=10,
    keepalive_expiry=30.0,
)
_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
}


class HttpSession:
    """Wrapper singleton do ``httpx.AsyncClient`` (1 client por event loop)."""

    def __init__(
        self,
        *,
        timeout: Optional[httpx.Timeout] = None,
        limits: Optional[httpx.Limits] = None,
        headers: Optional[dict] = None,
        follow_redirects: bool = True,
        max_redirects: int = 3,
        http2: bool = True,
    ):
        self.timeout = timeout or _DEFAULT_TIMEOUT
        self.limits = limits or _DEFAULT_LIMITS
        self.headers = {**_DEFAULT_HEADERS, **(headers or {})}
        self.follow_redirects = follow_redirects
        self.max_redirects = max_redirects
        self.http2 = http2
        self._clients: Dict[int, httpx.AsyncClient] = {}
        self._lock = asyncio.Lock()

    async def get_client(self) -> httpx.AsyncClient:
        loop_id = id(asyncio.get_running_loop())
        if loop_id in self._clients:
            return self._clients[loop_id]
        async with self._lock:
            if loop_id in self._clients:
                return self._clients[loop_id]
            try:
                client = httpx.AsyncClient(
                    timeout=self.timeout,
                    limits=self.limits,
                    headers=self.headers,
                    follow_redirects=self.follow_redirects,
                    max_redirects=self.max_redirects,
                    http2=self.http2,
                )
            except ImportError:
                # h2 opcional; cai para http/1.1
                client = httpx.AsyncClient(
                    timeout=self.timeout,
                    limits=self.limits,
                    headers=self.headers,
                    follow_redirects=self.follow_redirects,
                    max_redirects=self.max_redirects,
                )
            self._clients[loop_id] = client
            return client

    def reset(self) -> None:
        for client in self._clients.values():
            try:
                loop = asyncio.get_event_loop_policy().get_event_loop()
                if loop.is_running():
                    asyncio.ensure_future(client.aclose(), loop=loop)
                else:
                    loop.run_until_complete(client.aclose())
            except Exception:
                pass
        self._clients.clear()

    async def aclose(self) -> None:
        for client in list(self._clients.values()):
            try:
                await client.aclose()
            except Exception:
                pass
        self._clients.clear()


# ---------------------------------------------------------------------------
# Helper público com rate-limit + retry + circuit breaker.
# ---------------------------------------------------------------------------

async def fetch(client: httpx.AsyncClient, url: str, **kwargs) -> Optional[httpx.Response]:
    """GET ``url`` aplicando ``request_with_policy`` (httpx)."""
    from .rate_limiter import request_with_policy
    return await request_with_policy(client, url, **kwargs)


async def fetch_sync(session, url: str, *, domain: Optional[str] = None,
                     timeout: float = 20.0, **kwargs):
    """Helper para clientes síncronos (curl_cffi.Session, cloudscraper).

    Roda em ``asyncio.to_thread`` sob política (rate-limit + retry + breaker).
    ``session`` precisa ter ``.get(url, timeout=..., **kwargs)``.
    """
    from .rate_limiter import apply_policy, domain_of
    dom = domain or domain_of(url)

    def _do():
        return session.get(url, timeout=timeout, **kwargs)

    return await apply_policy(dom, _do)

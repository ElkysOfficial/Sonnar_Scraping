"""
Sessão httpx compartilhada — padrão equivalente ao usado nas engines de
``curl_cffi``/``cloudscraper`` (singleton por engine, com ``reset_session``).

Particularidade do httpx: ``AsyncClient`` é amarrado ao event loop em que
foi criado. Por isso o singleton é mantido **por loop** (key = ``id(loop)``).
Em uso prático cada chamada da engine roda no mesmo loop do scraper, então
fica de fato um client único por engine; em testes pytest-asyncio com loops
distintos, cada loop ganha o seu - sem conflito.

Uso (espelha o padrão das engines curl_cffi):

    from src.utils.http_session import HttpSession
    _SESSION = HttpSession()

    async def fetch(url):
        client = await _SESSION.get_client()
        return await client.get(url)

    def reset_session():
        _SESSION.reset()
"""
from __future__ import annotations

import asyncio
import logging
from typing import Dict, Optional

import httpx


logger = logging.getLogger(__name__)


_DEFAULT_TIMEOUT = httpx.Timeout(30.0)
_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
}


class HttpSession:
    """Wrapper singleton do ``httpx.AsyncClient`` (1 client por event loop).

    Args:
        timeout: timeout padrão (httpx.Timeout ou float).
        headers: headers adicionais (mesclados com os defaults).
        follow_redirects: comportamento de redirect (default True).
    """

    def __init__(
        self,
        *,
        timeout: Optional[httpx.Timeout] = None,
        headers: Optional[dict] = None,
        follow_redirects: bool = True,
    ):
        self.timeout = timeout or _DEFAULT_TIMEOUT
        self.headers = {**_DEFAULT_HEADERS, **(headers or {})}
        self.follow_redirects = follow_redirects
        self._clients: Dict[int, httpx.AsyncClient] = {}
        self._lock = asyncio.Lock()

    async def get_client(self) -> httpx.AsyncClient:
        """Devolve o ``AsyncClient`` do loop atual (cria se não existir)."""
        loop_id = id(asyncio.get_running_loop())
        if loop_id in self._clients:
            return self._clients[loop_id]
        async with self._lock:
            if loop_id in self._clients:  # double-check após adquirir o lock
                return self._clients[loop_id]
            client = httpx.AsyncClient(
                timeout=self.timeout,
                headers=self.headers,
                follow_redirects=self.follow_redirects,
            )
            self._clients[loop_id] = client
            return client

    def reset(self) -> None:
        """Descarta clients acumulados (use após bloqueios em sequência).

        Não é async porque é chamado em cleanup/log handlers; os ``aclose``
        ficam pendentes mas o GC do httpx fecha o socket de qualquer forma.
        """
        for client in self._clients.values():
            try:
                # schedule close best-effort
                loop = asyncio.get_event_loop_policy().get_event_loop()
                if loop.is_running():
                    asyncio.ensure_future(client.aclose(), loop=loop)
                else:
                    loop.run_until_complete(client.aclose())
            except Exception:
                pass
        self._clients.clear()

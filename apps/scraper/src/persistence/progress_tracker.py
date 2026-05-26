"""
ProgressTracker — checkpoint de varredura por (engine, batch).

Cada engine reporta sua posição interna (stack atual, location, sort, página)
após cada unidade de trabalho. Quando o processo é reiniciado, a engine lê o
cursor e retoma de onde parou — sem revarrer listings de stacks/páginas
já processadas no batch corrente.

Modelo
------
- Cursor é por (``engine``, ``batch_key``). ``batch_key`` identifica o batch
  do controller (ex.: ``"cat=Linguagens|idx=3"``). Se o batch mudou desde o
  checkpoint salvo (linhas com outro ``batch_key`` ficam na tabela), o
  ``resume()`` devolve ``None`` — não faz sentido retomar de um batch antigo.
- O conteúdo do ``cursor`` é livre: cada engine define seu próprio shape
  (ex.: ``{"stack": "Java", "location": "PE", "sort": "rel", "start": 75}``).

Performance
-----------
Buffer in-memory + flush periódico (igual ao ``ExtractionTracker``). Engines
chamam ``set_cursor`` a cada unidade de trabalho sem custo de I/O; o flusher
de background faz upsert no Supabase a cada ``FLUSH_INTERVAL_S``. Se o processo
cai entre dois flushes, perdem-se no máximo ~5s de progresso (aceitável: ao
retomar, a engine refaz no máximo 1-2 páginas).

Limpeza
-------
``clear(engine, batch_key)`` é chamado quando a engine completa o ciclo daquele
batch. Faz DELETE síncrono no Supabase (não é flusherizado: precisamos garantir
que o próximo startup não retome um batch já concluído).
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

import httpx


logger = logging.getLogger("scraper.progress")


FLUSH_INTERVAL_S = float(os.getenv("PROGRESS_FLUSH_INTERVAL_S", "5"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProgressTracker:
    """Checkpoint de progresso por (engine, batch_key)."""

    def __init__(self) -> None:
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.enabled = bool(url and key)
        self._url = url
        self._key = key
        # Buffer in-memory: (engine, batch_key) -> cursor (dict).
        self._buffer: Dict[Tuple[str, str], dict] = {}
        self._lock = asyncio.Lock()
        self._last_flush = time.monotonic()

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

    # ---------------- API consumida pelas engines ----------------

    def set_cursor(self, engine: str, batch_key: str, cursor: dict) -> None:
        """Atualiza o cursor in-memory. Não bloqueia: o flusher escreve no banco.

        Chamado pela engine a cada unidade de trabalho concluída (ex.: ao fim
        de uma página de listing). Sobrescreve o cursor anterior — o cursor
        sempre representa o **próximo passo** que ainda falta executar.
        """
        if not engine or not batch_key:
            return
        self._buffer[(engine, batch_key)] = dict(cursor or {})

    async def resume(self, engine: str, batch_key: str) -> Optional[dict]:
        """Lê o cursor salvo para ``(engine, batch_key)``. ``None`` se não há
        checkpoint OU se o batch salvo é diferente do atual (batch mudou).

        Chamado UMA vez no início da engine, antes do loop de varredura.
        """
        if not self.enabled or not engine or not batch_key:
            return None
        try:
            async with self._client() as cli:
                r = await cli.get(
                    "/scraper_progress",
                    params={
                        "select": "cursor",
                        "engine": f"eq.{engine}",
                        "batch_key": f"eq.{batch_key}",
                        "limit": "1",
                    },
                )
                if r.status_code != 200:
                    logger.warning("progress.resume status=%s body=%s",
                                   r.status_code, r.text[:200])
                    return None
                rows = r.json() or []
                if not rows:
                    return None
                cursor = rows[0].get("cursor")
                if not isinstance(cursor, dict) or not cursor:
                    return None
                return cursor
        except Exception as exc:
            logger.warning("progress.resume erro: %s", exc)
            return None

    async def clear(self, engine: str, batch_key: str) -> None:
        """Apaga o cursor do ``(engine, batch_key)``. Chamado quando a engine
        completa o ciclo do batch — garante que o próximo startup não retome
        um batch já concluído.

        Limpa também qualquer cursor de batches anteriores da MESMA engine
        (linhas residuais que ficaram sem ``clear`` por crash do processo).
        """
        # Remove do buffer mesmo se desabilitado.
        self._buffer.pop((engine, batch_key), None)
        for key in list(self._buffer.keys()):
            if key[0] == engine:
                self._buffer.pop(key, None)

        if not self.enabled or not engine:
            return
        try:
            async with self._client() as cli:
                r = await cli.delete(
                    "/scraper_progress",
                    params={"engine": f"eq.{engine}"},
                )
                if r.status_code >= 400:
                    logger.warning("progress.clear status=%s body=%s",
                                   r.status_code, r.text[:200])
        except Exception as exc:
            logger.warning("progress.clear erro: %s", exc)

    # ---------------- checkpoint do controller (batch_idx do ciclo) ----------------
    #
    # Reusa a tabela ``scraper_progress`` com chave fixa
    # (engine=``_controller``, batch_key=``cycle``). Cursor guarda o índice do
    # próximo lote a executar dentro do ciclo. Após restart, o controller lê
    # esse cursor e retoma do lote certo — sem reiniciar do 1/N.

    _CONTROLLER_ENGINE = "_controller"
    _CONTROLLER_KEY = "cycle"

    async def save_cycle_idx(self, next_idx: int, total: int) -> None:
        """Grava o próximo ``batch_idx`` (1-based) a executar. Síncrono no
        banco — não passa pelo buffer, pra garantir que um crash logo após
        não perca o checkpoint."""
        if not self.enabled:
            return
        payload = [{
            "engine":     self._CONTROLLER_ENGINE,
            "batch_key":  self._CONTROLLER_KEY,
            "cursor":     {"next_idx": int(next_idx), "total": int(total)},
            "updated_at": _now_iso(),
        }]
        try:
            async with self._client() as cli:
                r = await cli.post(
                    "/scraper_progress",
                    json=payload,
                    params={"on_conflict": "engine,batch_key"},
                )
                if r.status_code >= 400:
                    logger.warning("progress.save_cycle_idx status=%s body=%s",
                                   r.status_code, r.text[:200])
        except Exception as exc:
            logger.warning("progress.save_cycle_idx erro: %s", exc)

    async def load_cycle_idx(self, total: int) -> int:
        """Lê o ``next_idx`` salvo. Devolve 1 se não há checkpoint ou se o
        ``total`` mudou (lista de lotes mudou entre deploys — não dá pra
        retomar com segurança)."""
        if not self.enabled:
            return 1
        try:
            async with self._client() as cli:
                r = await cli.get(
                    "/scraper_progress",
                    params={
                        "select": "cursor",
                        "engine": f"eq.{self._CONTROLLER_ENGINE}",
                        "batch_key": f"eq.{self._CONTROLLER_KEY}",
                        "limit": "1",
                    },
                )
                if r.status_code != 200:
                    return 1
                rows = r.json() or []
                if not rows:
                    return 1
                cursor = rows[0].get("cursor") or {}
                saved_total = int(cursor.get("total", 0))
                next_idx = int(cursor.get("next_idx", 1))
                if saved_total != total:
                    logger.info("progress.load_cycle_idx total mudou (%s -> %s); reiniciando do 1",
                                saved_total, total)
                    return 1
                if next_idx < 1 or next_idx > total:
                    return 1
                return next_idx
        except Exception as exc:
            logger.warning("progress.load_cycle_idx erro: %s", exc)
            return 1

    async def clear_cycle_idx(self) -> None:
        """Apaga o checkpoint do ciclo. Chamado quando o ciclo completa."""
        if not self.enabled:
            return
        try:
            async with self._client() as cli:
                r = await cli.delete(
                    "/scraper_progress",
                    params={
                        "engine": f"eq.{self._CONTROLLER_ENGINE}",
                        "batch_key": f"eq.{self._CONTROLLER_KEY}",
                    },
                )
                if r.status_code >= 400:
                    logger.warning("progress.clear_cycle_idx status=%s body=%s",
                                   r.status_code, r.text[:200])
        except Exception as exc:
            logger.warning("progress.clear_cycle_idx erro: %s", exc)

    # ---------------- flush periódico ----------------

    async def flush(self) -> None:
        """Envia ao Supabase os cursores acumulados no buffer."""
        if not self.enabled:
            self._buffer.clear()
            return

        async with self._lock:
            if not self._buffer:
                self._last_flush = time.monotonic()
                return
            payload = [
                {
                    "engine":     engine,
                    "batch_key":  batch_key,
                    "cursor":     cursor,
                    "updated_at": _now_iso(),
                }
                for (engine, batch_key), cursor in self._buffer.items()
            ]
            self._buffer.clear()
            self._last_flush = time.monotonic()

        try:
            async with self._client() as cli:
                r = await cli.post(
                    "/scraper_progress",
                    json=payload,
                    params={"on_conflict": "engine,batch_key"},
                )
                if r.status_code >= 400:
                    logger.warning(
                        "progress.flush status=%s body=%s",
                        r.status_code, r.text[:200],
                    )
        except Exception as exc:
            logger.warning("progress.flush erro: %s (%s)",
                           exc, type(exc).__name__)

    async def run_flusher(self, interval_s: float = FLUSH_INTERVAL_S) -> None:
        """Loop de background — chama ``flush()`` a cada ``interval_s``."""
        while True:
            try:
                await asyncio.sleep(interval_s)
                await self.flush()
            except asyncio.CancelledError:
                try:
                    await self.flush()
                except Exception:
                    pass
                raise
            except Exception as exc:
                logger.warning("progress flusher loop erro: %s", exc)


progress = ProgressTracker()

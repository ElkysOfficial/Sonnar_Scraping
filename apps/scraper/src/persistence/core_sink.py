"""
Cliente HTTP para enviar vagas ao message-formatting-core.

ARQUITETURA single-writer (2026-05)
-----------------------------------
O ``jobs.json`` passa a ter UM único escritor: o ``message-formatting-core``.

Antes, o scraper (Python) e o core (Node) gravavam o MESMO arquivo. Dois
escritores sobre o mesmo arquivo causavam:
  - corrida no rename do arquivo temporário -> ``ENOENT`` ("Falha ao gravar
    jobs.json"); e
  - o scraper reescrevia o arquivo inteiro e apagava atualizações de
    ``sent_to`` que o core tinha acabado de fazer (bots reenviavam vagas).

Agora o scraper NÃO grava mais o arquivo: coleta as vagas e as envia ao core
via ``POST /jobs/batch``. O core funde no ``jobs.json`` e é o único a gravar.

Variável de ambiente:
  CORE_API_URL   URL base do core. Default: http://localhost:3100
"""
from __future__ import annotations

import hashlib
import logging
import os
from typing import List, Optional

import httpx


logger = logging.getLogger(__name__)


# Tamanho máximo de vagas por request. Um flush pode acumular milhares de
# vagas (ex.: core fora do ar por um tempo); enviar tudo numa request só
# estouraria o limite de corpo do core. Fatiar mantém cada request pequena.
_DEFAULT_CHUNK_SIZE = 500


def _resolve_chunk_size() -> int:
    """Lê CORE_PUSH_CHUNK_SIZE do env com validação.

    Um valor não-inteiro, zero ou negativo quebraria ``range(0, n, step)``
    (``step`` zero) ou faria o flush nunca enviar nada. Nesses casos, cai no
    default e registra um aviso.
    """
    raw = os.getenv("CORE_PUSH_CHUNK_SIZE")
    if raw is None:
        return _DEFAULT_CHUNK_SIZE
    try:
        value = int(raw)
    except ValueError:
        logger.warning("CORE_PUSH_CHUNK_SIZE invalido (%r); usando %d.", raw, _DEFAULT_CHUNK_SIZE)
        return _DEFAULT_CHUNK_SIZE
    if value < 1:
        logger.warning("CORE_PUSH_CHUNK_SIZE deve ser >= 1 (%d); usando %d.", value, _DEFAULT_CHUNK_SIZE)
        return _DEFAULT_CHUNK_SIZE
    return value


CHUNK_SIZE = _resolve_chunk_size()


class CoreJobsSink:
    """Envia lotes de vagas ao message-formatting-core (único escritor do jobs.json)."""

    def __init__(self, base_url: Optional[str] = None, timeout: float = 30.0):
        self.base_url = (
            base_url or os.getenv("CORE_API_URL", "http://localhost:3100")
        ).rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def push_batch(self, jobs: List[dict]) -> bool:
        """
        Envia as vagas ao core (``POST /jobs/batch``), fatiando em chunks de
        ``CHUNK_SIZE`` para não estourar o limite de corpo da request.

        Retorna ``True`` somente se TODOS os chunks foram confirmados. Se
        qualquer chunk falhar (core fora do ar, timeout, status != 200),
        retorna ``False`` — o chamador deve reenfileirar TODAS as vagas para
        tentar de novo. Reenviar chunks já gravados é inofensivo: o upsert do
        core é idempotente (merge por job_url).
        """
        if not jobs:
            return True
        if not self._client:
            logger.error("CoreJobsSink usado sem __aenter__ — lote descartado.")
            return False
        for i in range(0, len(jobs), CHUNK_SIZE):
            chunk = jobs[i:i + CHUNK_SIZE]
            if not await self._push_chunk(chunk):
                return False
        return True

    async def _push_chunk(self, chunk: List[dict]) -> bool:
        """Envia um único chunk ao core. True se o core confirmou."""
        try:
            response = await self._client.post("/jobs/batch", json={"jobs": chunk})
            if response.status_code == 200:
                return True
            logger.error(
                "Core /jobs/batch falhou status=%s body=%s",
                response.status_code,
                response.text[:300],
            )
            return False
        except httpx.HTTPError as exc:
            logger.error("Core /jobs/batch erro de rede: %s", exc)
            return False

    async def delete_job_by_url(self, job_url: str) -> bool:
        """Remove a vaga ``job_url`` do ``jobs.json`` via ``DELETE /jobs/:id``.

        O core deriva o id como ``md5(job_url)`` (ver ``deriveId`` no core),
        entao calculamos a mesma hash e chamamos o endpoint. Retorna ``True``
        em sucesso (200), ``False`` em erro real, e ``True`` tambem em 404 —
        a vaga ja nao estava no arquivo, o objetivo do delete foi atingido.

        Usado pelo revalidator para remover vagas que expiraram (HTTP 404 na
        URL de origem) antes do purge automatico de 90 dias.
        """
        if not job_url:
            return False
        if not self._client:
            logger.error("CoreJobsSink usado sem __aenter__ — delete descartado.")
            return False
        job_id = hashlib.md5(job_url.encode("utf-8")).hexdigest()
        try:
            response = await self._client.delete(f"/jobs/{job_id}")
            if response.status_code == 200:
                return True
            if response.status_code == 404:
                # Vaga ja nao estava no arquivo — objetivo atingido.
                return True
            logger.warning(
                "Core DELETE /jobs/%s status=%s body=%s",
                job_id, response.status_code, response.text[:200],
            )
            return False
        except httpx.HTTPError as exc:
            logger.error("Core DELETE /jobs erro de rede: %s", exc)
            return False

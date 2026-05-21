"""Testes para CoreJobsSink: fatiamento em chunks, falha de chunk, cliente
não inicializado e erro de rede."""
import json

import httpx
import pytest

from src.persistence.core_sink import CHUNK_SIZE, CoreJobsSink


def _sink_with_handler(handler):
    """CoreJobsSink com cliente httpx em transporte mockado (sem rede)."""
    sink = CoreJobsSink(base_url="http://core.test")
    sink._client = httpx.AsyncClient(
        base_url="http://core.test",
        transport=httpx.MockTransport(handler),
    )
    return sink


def _jobs(n):
    return [
        {"job_url": f"https://e.com/v/{i}", "job_title": f"Dev {i}"}
        for i in range(n)
    ]


@pytest.mark.asyncio
async def test_push_batch_lista_vazia_retorna_true():
    # Lote vazio é no-op de sucesso — nem precisa de cliente.
    sink = CoreJobsSink()
    assert await sink.push_batch([]) is True


@pytest.mark.asyncio
async def test_push_batch_sem_aenter_retorna_false():
    # __aenter__ nunca chamado => _client é None => não envia, devolve False.
    sink = CoreJobsSink()
    assert await sink.push_batch(_jobs(3)) is False


@pytest.mark.asyncio
async def test_push_batch_fatia_em_chunks():
    recebidos = []

    def handler(request):
        body = json.loads(request.content)
        recebidos.append(len(body["jobs"]))
        return httpx.Response(200, json={"success": True})

    total = CHUNK_SIZE * 2 + 7
    jobs = _jobs(total)
    esperado = [len(jobs[i:i + CHUNK_SIZE]) for i in range(0, total, CHUNK_SIZE)]

    sink = _sink_with_handler(handler)
    try:
        ok = await sink.push_batch(jobs)
    finally:
        await sink._client.aclose()

    assert ok is True
    assert recebidos == esperado
    assert sum(recebidos) == total


@pytest.mark.asyncio
async def test_push_batch_falha_em_chunk_intermediario():
    chamadas = {"n": 0}

    def handler(request):
        chamadas["n"] += 1
        if chamadas["n"] == 2:
            return httpx.Response(500, json={"success": False})
        return httpx.Response(200, json={"success": True})

    sink = _sink_with_handler(handler)
    try:
        ok = await sink.push_batch(_jobs(CHUNK_SIZE * 3))
    finally:
        await sink._client.aclose()

    # Chunk 2 falhou => push_batch retorna False e PARA (não envia o 3º).
    assert ok is False
    assert chamadas["n"] == 2


@pytest.mark.asyncio
async def test_push_batch_erro_de_rede_retorna_false():
    def handler(request):
        raise httpx.ConnectError("conexao recusada")

    sink = _sink_with_handler(handler)
    try:
        ok = await sink.push_batch(_jobs(10))
    finally:
        await sink._client.aclose()

    assert ok is False

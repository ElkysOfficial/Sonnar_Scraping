"""Revalidator — remove vagas expiradas do ``jobs.json`` antes do purge de 90d.

Por que existe
--------------
O ``LocalJobStore`` purga automaticamente vagas com ``publication_date`` mais
antiga que 90 dias. Mas muitas vagas expiram **antes** disso — o anunciante
encerrou as candidaturas, a empresa removeu o anuncio, ou a vaga foi
preenchida. Sem revalidacao, vagas inativas continuam no ``jobs.json`` ate
completar 90 dias, sendo enviadas pros assinantes via WhatsApp como se
estivessem abertas — gera ruido pro usuario e tempo perdido aplicando.

Estrategia
----------
Pra cada vaga ativa com idade entre 80 e 90 dias (proxima do purge), faz
HTTP GET na URL. Decisao conservadora:

  - HTTP 404/410 -> vaga **expirada**, remove via ``DELETE /jobs/:id`` no core.
  - Outros statuses (200, 5xx, redirect, timeout) -> mantem.

Erramos pro lado de NAO remover quando ha duvida: vaga valida sob rate-limit
ou indisponibilidade temporaria vai ficar no jobs.json, mas o usuario apenas
recebe uma vaga que pode estar fechada — menos grave que remover por engano
vagas validas.

Loop em background
------------------
Roda 1x/dia (default 24h). A primeira execucao acontece 5 minutos apos o
startup pra nao concorrer com o boot do scraper. O core eh o unico escritor
do ``jobs.json``, entao todas as remocoes passam por ele.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime, timedelta
from typing import Optional

import httpx


logger = logging.getLogger("scraper.revalidator")


# Janela alvo: vagas com publication_date entre LOWER e UPPER dias atras.
# 80-90 corresponde aas vagas proximas do purge automatico de 90d.
REVALIDATE_AGE_MIN_DAYS = int(os.getenv("REVALIDATE_AGE_MIN_DAYS", "80"))
REVALIDATE_AGE_MAX_DAYS = int(os.getenv("REVALIDATE_AGE_MAX_DAYS", "90"))

# Intervalo entre execucoes (default 24h).
REVALIDATE_INTERVAL_S = int(os.getenv("REVALIDATE_INTERVAL_S", str(24 * 60 * 60)))

# Delay no startup antes da primeira execucao (default 5min).
REVALIDATE_STARTUP_DELAY_S = int(os.getenv("REVALIDATE_STARTUP_DELAY_S", "300"))

# Concorrencia do HTTP GET na revalidacao. Baixa pra nao saturar nenhum
# host de origem (cada vaga pode ser de site diferente, mas vagas de uma
# mesma janela vem de poucos sites).
REVALIDATE_CONCURRENCY = int(os.getenv("REVALIDATE_CONCURRENCY", "3"))

# Timeout do HTTP GET por URL. URLs lentas nao bloqueiam o ciclo.
REVALIDATE_HTTP_TIMEOUT_S = float(os.getenv("REVALIDATE_HTTP_TIMEOUT_S", "20"))


def _parse_pub_date(raw: str) -> Optional[date]:
    """Aceita 'YYYY-MM-DD' ou 'DD/MM/YYYY' e devolve date. None se invalida."""
    if not raw:
        return None
    text = raw.strip()
    # Tenta ISO primeiro
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date()
    except ValueError:
        pass
    try:
        return datetime.strptime(text[:10], "%d/%m/%Y").date()
    except ValueError:
        return None


def _is_in_aging_window(pub_date: date, today: Optional[date] = None) -> bool:
    """True se ``pub_date`` esta na janela [today - MAX, today - MIN]."""
    today = today or date.today()
    age = (today - pub_date).days
    return REVALIDATE_AGE_MIN_DAYS <= age <= REVALIDATE_AGE_MAX_DAYS


async def check_url_status(client: httpx.AsyncClient, url: str) -> str:
    """Faz GET na URL e devolve um veredito conservador.

    Returns:
        ``"expired"``  HTTP 404/410 — vaga removida pelo site.
        ``"active"``   HTTP 200 — vaga ainda no ar (provavel).
        ``"unknown"``  Qualquer outro caso (timeout, 5xx, redirect, erro
                       de rede). Mantemos a vaga — melhor falso positivo
                       no envio do que apagar vaga valida.
    """
    try:
        # Usa GET (e nao HEAD) porque varios sites devolvem 200 em HEAD
        # mesmo pra URLs ja invalidas — eles validam o conteudo so no GET.
        # ``follow_redirects=False``: redirect pra /jobs ou /search significa
        # que a vaga foi removida e o site esta levando pra listagem geral
        # — tratamos como "unknown" pra ser conservador.
        response = await client.get(
            url,
            timeout=REVALIDATE_HTTP_TIMEOUT_S,
            follow_redirects=False,
        )
    except (httpx.TimeoutException, httpx.TransportError):
        return "unknown"
    except Exception as exc:
        logger.warning("revalidate_check_error", extra={
            "url": url, "errorType": type(exc).__name__,
        })
        return "unknown"

    status = response.status_code
    if status in (404, 410):
        return "expired"
    if status == 200:
        return "active"
    return "unknown"


async def revalidate_aging_jobs(repo) -> dict:
    """Itera vagas na janela 80-90 dias e remove as expiradas.

    Args:
        repo: ``JobsRepository`` — usa ``repo.local`` (LocalJobStore) pra
              filtrar candidatos e ``repo.core`` (CoreJobsSink) pra deletar
              do ``jobs.json``.

    Returns:
        Dict com estatisticas do ciclo:
            ``checked``  total verificado
            ``expired``  total removido (HTTP 404/410)
            ``active``   total mantido (HTTP 200)
            ``unknown``  total mantido (status ambiguo / erro de rede)
            ``failed``   delete no core falhou
    """
    today = date.today()
    candidates: list[tuple[str, dict]] = []

    # 1) Coleta candidatas (vagas na janela 80-90 dias).
    #    LocalJobStore expoe ``_data`` (dict url->entry); usamos a ``get`` API
    #    e ``known_urls`` pra nao quebrar encapsulamento.
    for url in repo.local.known_urls():
        entry = repo.local.get(url) or {}
        pub_raw = entry.get("publication_date") or ""
        pub_date = _parse_pub_date(str(pub_raw))
        if pub_date is None:
            continue
        if _is_in_aging_window(pub_date, today):
            candidates.append((url, entry))

    stats = {
        "checked": 0, "expired": 0, "active": 0,
        "unknown": 0, "failed": 0,
    }
    if not candidates:
        logger.info("revalidator_no_candidates", extra={"today": today.isoformat()})
        return stats

    logger.info("revalidator_start", extra={
        "candidates": len(candidates),
        "window_days": [REVALIDATE_AGE_MIN_DAYS, REVALIDATE_AGE_MAX_DAYS],
    })

    sem = asyncio.Semaphore(REVALIDATE_CONCURRENCY)

    async def _check_one(client, url, entry):
        async with sem:
            verdict = await check_url_status(client, url)
        stats["checked"] += 1
        stats[verdict] = stats.get(verdict, 0) + 1
        if verdict == "expired":
            ok = await repo.core.delete_job_by_url(url)
            if not ok:
                stats["failed"] += 1
                logger.warning("revalidate_delete_failed", extra={"url": url})
            else:
                # Tambem sincroniza o buffer in-memory do LocalJobStore (o
                # core ja escreveu no arquivo; aqui limpa o cache local).
                repo.local.delete_url(url)
                logger.info("revalidate_deleted", extra={
                    "url": url, "engine": entry.get("source"),
                })

    async with httpx.AsyncClient(headers={
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
        ),
    }) as client:
        await asyncio.gather(*(
            _check_one(client, url, entry) for url, entry in candidates
        ))

    logger.info("revalidator_done", extra=stats)
    return stats


async def run_revalidator_loop(repo) -> None:
    """Loop infinito — espera STARTUP_DELAY, depois roda a cada INTERVAL_S.

    Cancelable via ``asyncio.CancelledError`` (controller cancela no shutdown).
    """
    try:
        await asyncio.sleep(REVALIDATE_STARTUP_DELAY_S)
    except asyncio.CancelledError:
        raise

    while True:
        try:
            await revalidate_aging_jobs(repo)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("revalidator_loop_error")

        try:
            await asyncio.sleep(REVALIDATE_INTERVAL_S)
        except asyncio.CancelledError:
            raise

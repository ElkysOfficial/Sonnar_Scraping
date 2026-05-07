"""
Loop principal do scraper.

Estratégia em duas camadas:

1. **Batching** (camada de orquestração):
   As stacks são divididas em **lotes de 10**, respeitando categorias (ver
   ``variavel.iter_batches``). Cada lote roda todas as engines, persiste, e
   o scraper dorme ``BATCH_INTERVAL_SECONDS`` (default 2h) antes do próximo.
   Quando esgota a última categoria, recomeça da primeira.

2. **Streaming** (camada de persistência):
   As engines recebem um callback ``on_job`` e o invocam **a cada vaga**
   parseada - não no fim. Isso garante que, se a engine morrer no meio do
   ciclo, todas as vagas já extraídas estão salvas (JSON + CSV + Supabase).

Tunáveis (env vars):
    BATCH_SIZE              tamanho do lote      (default 10)
    BATCH_INTERVAL_SECONDS  pausa entre lotes    (default 7200 = 2h)
    MAX_CONCURRENT_ENGINES  engines em paralelo  (default 3)
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Awaitable, Callable

from variavel import iter_batches, set_active_batch

from .job_getters import getters
from ..persistence.extraction_tracker import tracker
from ..persistence.jobs_repository import JobsRepository
from ..utils.jobsUtils import process_salary
from ..utils.metrics import metrics
from ..utils.structured_logging import setup_logging


setup_logging(log_path=os.getenv("SCRAPER_LOG_PATH", "scraper.log"))
logger = logging.getLogger("scraper.controller")


# ---------------------------------------------------------------------------
# Configuração (lê do ambiente, com defaults sensatos)
# ---------------------------------------------------------------------------

BATCH_SIZE = int(os.getenv("BATCH_SIZE", "10"))
BATCH_INTERVAL_SECONDS = int(os.getenv("BATCH_INTERVAL_SECONDS", "7200"))  # 2h
# 2 vCPUs => 2 engines paralelas. Atual default era 3 e levava à contenção.
MAX_CONCURRENT_ENGINES = int(os.getenv("MAX_CONCURRENT_ENGINES", "2"))
METRICS_FLUSH_INTERVAL_S = float(os.getenv("METRICS_FLUSH_INTERVAL_S", "30"))

# Tipo do callback: ``async fn(job_data: dict, engine: str) -> None``.
JobCallback = Callable[[list, str], Awaitable[None]]


# ---------------------------------------------------------------------------
# Registry de parser_version e refetch por engine
# ---------------------------------------------------------------------------
# Bump a constante PARSER_VERSION em cada engine quando o parser mudar - o
# tracker detecta a mudança no startup e reagenda as vagas antigas.
# Engines com refetch_one(url) participam do passe de reenrichment.

def _build_engine_registry() -> dict:
    registry: dict = {}
    try:
        from ..engines import linkedin as _linkedin
        registry["linkedin"] = {
            "parser_version": getattr(_linkedin, "PARSER_VERSION", None),
            "refetch_one": getattr(_linkedin, "refetch_one", None),
        }
    except Exception:
        pass
    return registry


_ENGINE_REGISTRY = _build_engine_registry()


def _parser_version(engine: str) -> str | None:
    info = _ENGINE_REGISTRY.get(engine) or {}
    return info.get("parser_version")


# ---------------------------------------------------------------------------
# Normalização (formato cru das engines → dict canônico)
# ---------------------------------------------------------------------------

def normalize_job_result(result: list) -> dict:
    """
    Converte o formato lista que as engines devolvem em dict canônico.

    Formato esperado das engines (lista posicional):
        [job_url, job_title, company, location, work_type,
         hiring_regime, salary, publication_date,
         skills?, description?]

    `location` pode vir como str ou list - normalizamos para str ('SP - São Paulo').
    Os campos `skills` (list) e `description` (str) são opcionais - engines
    legadas que devolvem 8 elementos continuam funcionando.
    """
    location = result[3] if len(result) > 3 else ""
    if isinstance(location, list):
        location = " - ".join(str(item) for item in location if item)

    skills = result[8] if len(result) > 8 else []
    if not isinstance(skills, list):
        skills = []

    return {
        "job_url": str(result[0]) if len(result) > 0 else "",
        "job_title": str(result[1]) if len(result) > 1 else "",
        "company": str(result[2]) if len(result) > 2 else "",
        "location": str(location),
        "work_type": str(result[4]) if len(result) > 4 else "",
        "hiring_regime": str(result[5]) if len(result) > 5 else "",
        "salary": str(result[6]) if len(result) > 6 else "",
        "publication_date": str(result[7]) if len(result) > 7 else "",
        "skills": skills,
        "description": str(result[9]) if len(result) > 9 else "",
    }


def _engine_name(getter) -> str:
    """``get_linkedin_jobs`` → ``'linkedin'``. Usado em logs."""
    parts = getter.__name__.split("_")
    return parts[1] if len(parts) > 1 else getter.__name__


# ---------------------------------------------------------------------------
# Pipeline por vaga (chamado em streaming pelas engines)
# ---------------------------------------------------------------------------

async def _process_one_job(
    raw: list,
    engine: str,
    *,
    repo: JobsRepository,
    sent_jobs: set,
) -> None:
    """
    Pipeline aplicado a CADA vaga assim que a engine a entrega:
      1. Normaliza para dict canônico
      2. Dedup pelo conjunto em memória
      3. Normaliza salário
      4. Persiste em JSON + CSV + Supabase via ``repo.save``
      5. Envia para o serviço de embed (Discord) como best-effort

    Erros isolados não interrompem o ciclo da engine - só são logados.
    """
    job_data = normalize_job_result(raw)
    job_url = job_data.get("job_url")
    if not job_url or job_url in sent_jobs:
        return

    sent_jobs.add(job_url)
    tracker.mark_running(job_url, engine=engine)

    try:
        title = job_data.get("job_title", "")
        job_data["salary"] = process_salary(job_data.get("salary", ""), title)
    except Exception as exc:
        logger.error("salary_failed", extra={
            "engine": engine, "url": job_url, "errorMessage": str(exc),
        })

    description_len = len(job_data.get("description") or "")
    parser_version = _parser_version(engine)

    try:
        persisted = await repo.save(job_data, source=engine)
    except Exception as exc:
        logger.error("persist_failed", extra={
            "engine": engine, "url": job_url, "errorMessage": str(exc),
        })
        metrics.incr("persist.error", domain=engine)
        tracker.mark_failed(job_url, engine=engine,
                            error_type=type(exc).__name__, error_msg=str(exc))
        sent_jobs.discard(job_url)
        return

    if persisted:
        metrics.incr("persist.ok", domain=engine)
        # Heurística: descrição < 200 chars = enriquecimento incompleto.
        # Marca como partial pra o reenrichment retentar quando o parser_version mudar.
        if description_len < 200 and parser_version:
            tracker.mark_partial(job_url, engine=engine, parser_version=parser_version)
        else:
            tracker.mark_completed(job_url, engine=engine, parser_version=parser_version)
    else:
        metrics.incr("persist.skipped", domain=engine)
        sent_jobs.discard(job_url)
        tracker.mark_failed(job_url, engine=engine,
                            error_type="persist_skipped",
                            error_msg="repo.save retornou False")


# ---------------------------------------------------------------------------
# Execução de um lote (todas as engines em paralelo)
# ---------------------------------------------------------------------------

async def _run_one_batch(
    *,
    repo: JobsRepository,
    sent_jobs: set,
) -> None:
    """
    Dispara todas as engines registradas em ``getters`` em paralelo,
    limitando a concorrência a ``MAX_CONCURRENT_ENGINES``.

    Cada engine recebe ``on_job`` que chama ``_process_one_job`` em streaming
    - vagas vão para o disco/banco assim que são parseadas.
    """
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_ENGINES)

    async def _run_engine(getter):
        engine = _engine_name(getter)

        async def on_job(raw: list) -> None:
            await _process_one_job(
                raw, engine,
                repo=repo, sent_jobs=sent_jobs,
            )

        async with semaphore:
            metrics.event("engine.start", domain=engine)
            logger.info("engine_start", extra={"engine": engine})
            try:
                try:
                    results = await getter(on_job=on_job)
                except TypeError:
                    results = await getter()
                    for raw in results or []:
                        await on_job(raw)
                metrics.event("engine.finish", domain=engine)
            except Exception as exc:
                metrics.event("engine.error", domain=engine, error=str(exc))
                logger.exception("engine_error", extra={"engine": engine})

    await asyncio.gather(*(_run_engine(g) for g in getters))


# ---------------------------------------------------------------------------
# Reenrichment pass (entre lotes)
# ---------------------------------------------------------------------------

REENRICH_LIMIT = int(os.getenv("REENRICH_LIMIT_PER_PASS", "100"))


async def _run_reenrichment_pass(*, repo: JobsRepository, sent_jobs: set) -> None:
    """Para cada engine que expõe ``refetch_one``, busca URLs em ``state=discovered``
    no Supabase e reprocessa. Limita o passe a ``REENRICH_LIMIT`` por engine
    pra não deixar o reenrichment dominar o ciclo - URLs restantes ficam no
    próximo lote.
    """
    for engine_name, info in _ENGINE_REGISTRY.items():
        refetch = info.get("refetch_one")
        if not refetch:
            continue
        urls = await tracker.pick_pending(engine_name, REENRICH_LIMIT)
        if not urls:
            continue
        logger.info("reenrich_pass_start", extra={
            "engine": engine_name, "count": len(urls),
        })
        metrics.event("reenrich.start", domain=engine_name, count=len(urls))

        for url in urls:
            tracker.mark_running(url, engine=engine_name)
            try:
                parsed = await refetch(url)
            except Exception as exc:
                tracker.mark_failed(url, engine=engine_name,
                                    error_type=type(exc).__name__,
                                    error_msg=str(exc))
                continue
            if parsed is None:
                tracker.mark_failed(url, engine=engine_name,
                                    error_type="refetch_empty",
                                    error_msg="refetch_one devolveu None")
                continue
            await _process_one_job(parsed, engine_name,
                                   repo=repo, sent_jobs=sent_jobs)


# ---------------------------------------------------------------------------
# Loop principal - itera lotes e dorme entre eles
# ---------------------------------------------------------------------------

async def scrape_jobs() -> None:
    """
    Loop infinito do scraper.

    Ciclo:
        1. Para cada ``(categoria, lote)`` produzido por ``iter_batches``:
           a. Configura o lote ativo via ``set_active_batch``.
           b. Roda todas as engines (em paralelo, com streaming de vagas).
           c. Dorme ``BATCH_INTERVAL_SECONDS``.
        2. Quando esgotar todas as categorias, reinicia.

    O dedup é compartilhado entre lotes (set ``sent_jobs`` carregado
    do JSON local), de modo que vagas já processadas em ciclos anteriores
    não são reprocessadas.
    """
    metrics_task = asyncio.create_task(metrics.run_flusher(METRICS_FLUSH_INTERVAL_S))
    tracker_task = asyncio.create_task(tracker.run_flusher())

    try:
        async with JobsRepository() as repo:
            local_known = repo.known_urls()
            tracker_known = await tracker.load_completed()
            sent_jobs: set = local_known | tracker_known

            # Auto-reenrichment: bump de PARSER_VERSION reagenda automaticamente.
            for engine_name, info in _ENGINE_REGISTRY.items():
                pv = info.get("parser_version")
                if pv:
                    n = await tracker.requeue_stale_partial(engine_name, pv)
                    if n:
                        logger.info("auto_reenrich", extra={
                            "engine": engine_name, "parser_version": pv, "requeued": n,
                        })

            logger.info("scraper_init", extra={
                "local_known": len(local_known),
                "tracker_known": len(tracker_known),
            })

            while True:
                batches = list(iter_batches(BATCH_SIZE))
                total = len(batches)

                for idx, (category, batch) in enumerate(batches, start=1):
                    set_active_batch(batch)
                    logger.info("batch_start", extra={
                        "batch_idx": idx, "batch_total": total,
                        "category": category, "stacks": batch,
                    })
                    metrics.event("batch.start", domain="", category=category, idx=idx)
                    try:
                        await _run_one_batch(repo=repo, sent_jobs=sent_jobs)
                    except Exception as exc:
                        logger.exception("batch_error", extra={
                            "category": category, "errorMessage": str(exc),
                        })
                        metrics.event("batch.error", domain="", category=category)

                    # Reenrichment pass: pega URLs em state=discovered (vindas
                    # de auto-reenrich ou listings anteriores) e chama refetch_one.
                    await _run_reenrichment_pass(repo=repo, sent_jobs=sent_jobs)

                    # Flush local entre lotes + fechar Playwright para liberar RAM
                    repo.flush_now()
                    await tracker.flush()
                    try:
                        from ..utils.browser_fetch import close_browser
                        await close_browser()
                    except Exception:
                        pass

                    if idx < total:
                        logger.info("batch_sleep", extra={
                            "seconds": BATCH_INTERVAL_SECONDS,
                        })
                        await asyncio.sleep(BATCH_INTERVAL_SECONDS)

                logger.info("cycle_complete")
                set_active_batch(None)
    finally:
        for t in (metrics_task, tracker_task):
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass

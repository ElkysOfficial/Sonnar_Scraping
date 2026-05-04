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
from ..persistence.jobs_repository import JobsRepository
from ..utils.jobsUtils import process_salary


logging.basicConfig(filename="errors.log", level=logging.ERROR)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuração (lê do ambiente, com defaults sensatos)
# ---------------------------------------------------------------------------

BATCH_SIZE = int(os.getenv("BATCH_SIZE", "10"))
BATCH_INTERVAL_SECONDS = int(os.getenv("BATCH_INTERVAL_SECONDS", "7200"))  # 2h
MAX_CONCURRENT_ENGINES = int(os.getenv("MAX_CONCURRENT_ENGINES", "3"))

# Tipo do callback: ``async fn(job_data: dict, engine: str) -> None``.
JobCallback = Callable[[list, str], Awaitable[None]]


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

    try:
        title = job_data.get("job_title", "")
        job_data["salary"] = process_salary(job_data.get("salary", ""), title)
    except Exception as exc:
        logger.error("Erro ao processar salário do job %s: %s", job_url, exc)

    # Persistência (JSON + CSV + Supabase) - atômica do ponto de vista do job
    try:
        persisted = await repo.save(job_data, source=engine)
    except Exception as exc:
        logger.error("Erro ao persistir %s: %s", job_url, exc)
        return

    if not persisted:
        return

    sent_jobs.add(job_url)


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
            try:
                print(f"Buscando em {engine}...")
                # Engines que aceitam o callback fazem streaming. As que não
                # aceitam continuam funcionando: o try/except apanha o
                # TypeError e cai no fallback (retorno em batch).
                try:
                    results = await getter(on_job=on_job)
                except TypeError:
                    results = await getter()
                    for raw in results or []:
                        await on_job(raw)
            except Exception as exc:
                logger.error("Erro ao executar %s: %s", engine, exc)

    await asyncio.gather(*(_run_engine(g) for g in getters))


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
    async with JobsRepository() as repo:
        sent_jobs: set = repo.known_urls()
        logger.info("Inicializando: %d vagas já conhecidas no JSON local.", len(sent_jobs))

        while True:
            batches = list(iter_batches(BATCH_SIZE))
            total = len(batches)

            for idx, (category, batch) in enumerate(batches, start=1):
                set_active_batch(batch)
                print(
                    f"\n=== Lote {idx}/{total} | {category} | {len(batch)} stacks: "
                    f"{', '.join(batch)} ==="
                )
                try:
                    await _run_one_batch(repo=repo, sent_jobs=sent_jobs)
                except Exception as exc:
                    logger.error("Erro geral no lote %s: %s", category, exc)

                if idx < total:
                    print(f"Lote {idx} concluído. Dormindo {BATCH_INTERVAL_SECONDS // 60} min.")
                    await asyncio.sleep(BATCH_INTERVAL_SECONDS)

            print("Ciclo completo das categorias concluído. Reiniciando.")
            set_active_batch(None)  # libera o lote ativo no fim

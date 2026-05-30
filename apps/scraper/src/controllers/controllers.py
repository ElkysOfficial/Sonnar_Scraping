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
    BATCH_SIZE              tamanho do lote      (default 5)
    BATCH_INTERVAL_SECONDS  pausa entre lotes    (default 7200 = 2h)
    MAX_CONCURRENT_ENGINES  engines em paralelo  (default 3)
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Awaitable, Callable

from variavel import iter_batches, set_active_batch, set_active_batch_context

from .job_getters import getters
from ..persistence.extraction_tracker import tracker
from ..persistence.jobs_repository import JobsRepository
from ..persistence.progress_tracker import progress
from ..persistence.revalidator import run_revalidator_loop
from ..utils.jobsUtils import process_salary
from ..utils.metrics import metrics
from ..utils.structured_logging import setup_logging
from ..utils.translator import prepare as prepare_translation


# Idiomas mais frequentes nas vagas estrangeiras (deduzidos dos locales
# rotativos do Careerjet e dos VIPs internacionais do sender). Warm-load
# no boot evita pagar latencia de download/init na primeira vaga de cada
# idioma — antes, isso aparecia como spikes de CPU intermitentes durante
# o ciclo. Modelos ja em cache no disco do Argos sao no-op.
# v3.6.0: reduzido de 27 -> 8 idiomas (ADR-006). Os 8 mantidos cobrem >95%
# das vagas estrangeiras observadas em prod (en/es/fr/de/it sao a maior
# fatia; pl/nl/pt completam o nucleo). Idiomas raros sao preparados sob
# demanda na primeira vaga (overhead ~2-5s por idioma novo, amortizado).
# Ganho: -800MB de RAM no boot do scraper.
_WARMUP_LANGS = (
    "en", "es", "fr", "de", "it", "nl", "pl", "pt",
)


setup_logging(log_path=os.getenv("SCRAPER_LOG_PATH", "scraper.log"))
logger = logging.getLogger("scraper.controller")


# ---------------------------------------------------------------------------
# Configuração (lê do ambiente, com defaults sensatos)
# ---------------------------------------------------------------------------

# 2 stacks por batch (era 5): prioriza qualidade da varredura sobre velocidade.
# Com menos stacks por lote, cada engine faz menos requests por hora, ficando
# mais longe dos limites de rate-limit dos sites. A cobertura completa de
# todas as stacks acontece ao longo do dia (104 batches × 2h pausa).
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "2"))
BATCH_INTERVAL_SECONDS = int(os.getenv("BATCH_INTERVAL_SECONDS", "7200"))  # 2h
# v3.10.19: 2 vCPUs -> 1 engine de cada vez. Antes (2) duas engines pesadas
# (indeed + simplyhired com Playwright) podiam rodar concorrente, somando
# >100% de CPU. Serializa, com cada engine consumindo no maximo 50-60% de
# 1 core. Meta acordada com o user: pico <=50%, fora pico <=35%.
MAX_CONCURRENT_ENGINES = int(os.getenv("MAX_CONCURRENT_ENGINES", "1"))
# v3.10.19: pausa entre CICLOS completos (119 batches finalizados). Antes
# o loop reiniciava imediato, mantendo CPU em pico mesmo apos terminar a
# varredura. 1800s (30min) deixa a VM esfriar e dilui o pico medio de
# CPU pela metade. Meta: <=50% pico, <=35% media.
CYCLE_SLEEP_SECONDS = int(os.getenv("CYCLE_SLEEP_SECONDS", "1800"))
METRICS_FLUSH_INTERVAL_S = float(os.getenv("METRICS_FLUSH_INTERVAL_S", "30"))

# Tipo do callback: ``async fn(job_data: dict, engine: str) -> None``.
JobCallback = Callable[[list, str], Awaitable[None]]


# ---------------------------------------------------------------------------
# Mapa engine → domínio primário
#
# As engines (e o rate_limiter) emitem métricas com o domínio real
# (ex.: "br.linkedin.com"). Eventos do controller (engine.start, persist.ok,
# etc.) precisam usar o MESMO domínio para evitar linhas duplicadas no
# dashboard ("bne" + "bne.com.br"). Quem desconhece o domínio cai no nome
# da engine como fallback (compat com engines novas).
# ---------------------------------------------------------------------------

# IMPORTANTE: o valor aqui deve bater EXATAMENTE com o hostname que
# urlparse(url).hostname devolve para as requests reais da engine. Se
# o engine acessa "https://www.dice.com/...", o hostname é "www.dice.com" —
# e é com isso que o rate_limiter/http_session emitem suas métricas
# (latency, status, etc.). Se este map usar uma forma diferente
# ("dice.com"), o dashboard mostra DUAS linhas por engine: uma com as
# métricas do controller (persist.ok), outra com as do HTTP layer.
ENGINE_PRIMARY_DOMAIN = {
    "linkedin":       "br.linkedin.com",
    "indeed":         "br.indeed.com",
    "gupy":           "portal.api.gupy.io",
    "jooble":         "br.jooble.org",
    "catho":          "www.catho.com.br",
    "careerjet":      "search.api.careerjet.net",
    "geekhunter":     "www.geekhunter.com.br",
    "michaelpage":    "www.michaelpage.com.br",
    "programathor":   "programathor.com.br",
    "remoteok":       "remoteok.com",
    "remotive":       "remotive.com",
    "weworkremotely": "weworkremotely.com",
    "ziprecruiter":   "www.ziprecruiter.co.uk",
    "simplyhired":    "www.simplyhired.com.br",
    "bne":            "www.bne.com.br",
    "dice":           "www.dice.com",
    "infojobs":       "www.infojobs.com.br",
}


def _engine_domain(engine: str) -> str:
    """Domínio primário da engine para emissão de métricas."""
    return ENGINE_PRIMARY_DOMAIN.get(engine, engine)


# ---------------------------------------------------------------------------
# Registry de parser_version e refetch por engine
# ---------------------------------------------------------------------------
# Bump a constante PARSER_VERSION em cada engine quando o parser mudar - o
# tracker detecta a mudança no startup e reagenda as vagas antigas.
# Engines com refetch_one(url) participam do passe de reenrichment.

def _build_engine_registry() -> dict:
    """Mapa engine_name -> {parser_version, refetch_one}.

    refetch_one é opcional: engines API-only (gupy, remoteok, etc.) não têm
    refetch separado - o reenrichment delas acontece naturalmente quando
    o listing do próximo ciclo trouxer as URLs.
    """
    from ..engines import (
        bne as _bne,
        careerjet as _careerjet,
        catho as _catho,
        dice as _dice,
        geekhunter as _geekhunter,
        gupy as _gupy,
        indeed as _indeed,
        infojobs as _infojobs,
        jooble as _jooble,
        linkedin as _linkedin,
        michaelpage as _michaelpage,
        programathor as _programathor,
        remoteok as _remoteok,
        remotive as _remotive,
        simplyhired as _simplyhired,
        weworkremotely as _weworkremotely,
        ziprecruiter as _ziprecruiter,
    )
    modules = {
        "bne": _bne, "careerjet": _careerjet, "catho": _catho, "dice": _dice,
        "geekhunter": _geekhunter, "gupy": _gupy, "indeed": _indeed,
        "infojobs": _infojobs, "jooble": _jooble, "linkedin": _linkedin,
        "michaelpage": _michaelpage, "programathor": _programathor,
        "remoteok": _remoteok, "remotive": _remotive, "simplyhired": _simplyhired,
        "weworkremotely": _weworkremotely, "ziprecruiter": _ziprecruiter,
    }
    registry: dict = {}
    for name, mod in modules.items():
        registry[name] = {
            "parser_version": getattr(mod, "PARSER_VERSION", None),
            "refetch_one": getattr(mod, "refetch_one", None),
            # Override opcional: cada engine pode definir seu próprio mínimo
            # de descrição esperado. Útil para fontes onde resumos curtos
            # são normais (ex.: anúncios curtos do RemoteOK não devem ser
            # marcados como "incompletos").
            "min_description_len": getattr(mod, "MIN_DESCRIPTION_LEN", None),
            # Override opcional: a engine define quando uma vaga é partial.
            # Assinatura: ``is_partial(job_data: dict) -> bool``. Recebe o
            # dict canônico (saída de ``normalize_job_result``). Permite
            # ignorar campos que o site simplesmente não publica (ex.:
            # ``salary_min/max`` no BNE/Catho, ``state_code`` no Careerjet
            # quando ``location='Brasil'``) — esses casos são *completed*,
            # não partial. Sem o hook, cai no critério padrão (descrição
            # abaixo de ``MIN_DESCRIPTION_LEN``).
            "is_partial": getattr(mod, "is_partial", None),
            # Override opcional: engines cuja fonte ja filtra "vagas ativas" no
            # listing devem ignorar o filtro MAX_AGE_DAYS — a publication_date
            # devolvida e a data original e nao reflete recencia. Hoje: gupy,
            # geekhunter (ver TRUST_LISTING_ACTIVE no modulo da engine).
            "trust_listing_active": bool(getattr(mod, "TRUST_LISTING_ACTIVE", False)),
        }
    return registry


_ENGINE_REGISTRY = _build_engine_registry()


def _parser_version(engine: str) -> str | None:
    info = _ENGINE_REGISTRY.get(engine) or {}
    return info.get("parser_version")


def _has_refetch(engine: str) -> bool:
    """True se a engine tem refetch_one (i.e., é capaz de re-coletar detalhe).

    Engines listing-only (gupy, jooble, remoteok, remotive, weworkremotely,
    ziprecruiter, geekhunter) NÃO têm refetch_one — a descrição é o que
    veio no listing. Marcar partial nelas só polui o tracker, porque o
    reenrichment não tem o que fazer.
    """
    info = _ENGINE_REGISTRY.get(engine) or {}
    return callable(info.get("refetch_one"))


# Limite mínimo de descrição para considerar uma vaga "completa".
# Vale apenas para engines que têm refetch_one (i.e., podem reenriquecer).
# Engines podem sobrescrever via constante MIN_DESCRIPTION_LEN no módulo.
DEFAULT_MIN_DESCRIPTION_LEN = int(os.getenv("MIN_DESCRIPTION_LEN", "200"))


def _min_desc_len(engine: str) -> int:
    """Limite por engine (override via constante MIN_DESCRIPTION_LEN no módulo)."""
    info = _ENGINE_REGISTRY.get(engine) or {}
    val = info.get("min_description_len")
    return int(val) if val is not None else DEFAULT_MIN_DESCRIPTION_LEN


def _engine_is_partial(engine: str, job_data: dict, description_len: int) -> bool:
    """Decide se a vaga deve ficar em ``partial`` (e voltar pelo reenrichment).

    Se a engine expõe ``is_partial(job_data)``, delega — assim cada fonte
    decide o que é "incompleto" sem misturar com campos que o site não
    publica. Caso contrário, mantém o critério legado: descrição abaixo
    do mínimo da engine.
    """
    info = _ENGINE_REGISTRY.get(engine) or {}
    fn = info.get("is_partial")
    if callable(fn):
        try:
            return bool(fn(job_data))
        except Exception as exc:
            logger.warning("is_partial_failed", extra={
                "engine": engine, "errorMessage": str(exc),
            })
            return description_len < _min_desc_len(engine)
    return description_len < _min_desc_len(engine)


# ---------------------------------------------------------------------------
# Normalização (formato cru das engines → dict canônico)
# ---------------------------------------------------------------------------

def normalize_job_result(result: list) -> dict:
    """
    Converte o formato lista que as engines devolvem em dict canônico.

    Formato esperado das engines (lista posicional):
        [job_url, job_title, company, location, work_type,
         hiring_regime, salary, publication_date,
         skills?, description?, description_lang?, responsibilities?]

    `location` pode vir como str ou list - normalizamos para str ('SP - São Paulo').
    Os campos a partir do indice 8 sao opcionais - engines legadas que
    devolvem 8 ou 10 elementos continuam funcionando. Os campos
    `description_lang` (indice 10) e `responsibilities` (indice 11) sao
    novos no epico v3.0.0 e so vem preenchidos pelas engines integradas.
    """
    location = result[3] if len(result) > 3 else ""
    if isinstance(location, list):
        location = " - ".join(str(item) for item in location if item)

    skills = result[8] if len(result) > 8 else []
    if not isinstance(skills, list):
        skills = []

    # Novos campos opcionais do epico v3.0.0 - so engines integradas preenchem
    description_lang = result[10] if len(result) > 10 else None
    if description_lang is not None and not isinstance(description_lang, str):
        description_lang = str(description_lang)
    responsibilities = result[11] if len(result) > 11 else None
    if responsibilities is not None and not isinstance(responsibilities, str):
        responsibilities = str(responsibilities)

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
        "description_lang": description_lang,
        "responsibilities": responsibilities,
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
    info = _ENGINE_REGISTRY.get(engine) or {}
    skip_age_filter = bool(info.get("trust_listing_active"))

    try:
        result = await repo.save_with_reason(
            job_data, source=engine, skip_age_filter=skip_age_filter,
        )
    except Exception as exc:
        logger.error("persist_failed", extra={
            "engine": engine, "url": job_url, "errorMessage": str(exc),
        })
        metrics.incr("persist.error", domain=_engine_domain(engine))
        tracker.mark_failed(job_url, engine=engine,
                            error_type=type(exc).__name__, error_msg=str(exc))
        sent_jobs.discard(job_url)
        return

    domain = _engine_domain(engine)

    if result == JobsRepository.SAVE_OK:
        metrics.incr("persist.ok", domain=domain)
        # Marca como partial APENAS se as 3 condições forem verdadeiras:
        # 1. A engine tem refetch_one (é capaz de reenriquecer)
        # 2. A engine declarou um parser_version
        # 3. O critério da engine indica vaga incompleta
        #    (engines podem expor ``is_partial(job_data)`` — quem não expõe
        #    cai no critério padrão de descrição abaixo do mínimo).
        is_partial = (
            _has_refetch(engine)
            and parser_version
            and _engine_is_partial(engine, job_data, description_len)
        )
        if is_partial:
            tracker.mark_partial(job_url, engine=engine, parser_version=parser_version)
        else:
            tracker.mark_completed(job_url, engine=engine, parser_version=parser_version)

    elif result == JobsRepository.SAVE_TOO_OLD:
        # Vaga publicada há mais de 90 dias — filtro intencional, NÃO é erro.
        # Marcamos completed para que não seja retentada no próximo ciclo
        # (caso a URL volte a aparecer no listing por engano).
        metrics.incr("persist.too_old", domain=domain)
        tracker.mark_completed(job_url, engine=engine, parser_version=parser_version)

    elif result == JobsRepository.SAVE_NO_URL:
        # Defensivo — _process_one_job já valida job_url antes. Só registra.
        metrics.incr("persist.invalid", domain=domain)
        sent_jobs.discard(job_url)

    else:  # SAVE_ALL_FAILED — falha real
        metrics.incr("persist.skipped", domain=domain)
        sent_jobs.discard(job_url)
        tracker.mark_failed(job_url, engine=engine,
                            error_type="all_sinks_failed",
                            error_msg="JSON/CSV/Supabase recusaram a vaga")


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
            metrics.event("engine.start", domain=_engine_domain(engine))
            logger.info("engine_start", extra={"engine": engine})
            try:
                try:
                    results = await getter(on_job=on_job)
                except TypeError:
                    results = await getter()
                    for raw in results or []:
                        await on_job(raw)
                metrics.event("engine.finish", domain=_engine_domain(engine))
            except Exception as exc:
                metrics.event("engine.error", domain=_engine_domain(engine), error=str(exc))
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
        metrics.event("reenrich.start", domain=_engine_domain(engine_name), count=len(urls))

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
# Flush periódico para o core (single-writer do jobs.json)
# ---------------------------------------------------------------------------

# A cada CORE_PUSH_INTERVAL_S o scraper envia ao core as vagas acumuladas no
# buffer local. Mantém os bots com dados frescos sem esperar o fim do lote
# (que pode levar ~2h). O core é o único processo que grava o jobs.json.
CORE_PUSH_INTERVAL_S = float(os.getenv("CORE_PUSH_INTERVAL_S", "5.0"))


async def _core_flush_loop(repo: JobsRepository) -> None:
    """Envia periodicamente ao core as vagas acumuladas no buffer local."""
    while True:
        await asyncio.sleep(CORE_PUSH_INTERVAL_S)
        try:
            await repo.flush_to_core()
        except Exception:
            logger.exception("core_flush_error")


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
    progress_task = asyncio.create_task(progress.run_flusher())
    core_flush_task = None
    revalidator_task = None

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

            # Recupera URLs órfãs em state=running (interrupção/race do flush).
            await tracker.requeue_stale_running()

            logger.info("scraper_init", extra={
                "local_known": len(local_known),
                "tracker_known": len(tracker_known),
            })

            # Warm-load dos modelos Argos em background. Best-effort: se a
            # tabela de pacotes esta atualizada localmente, e instantaneo.
            # Roda em thread pra nao bloquear o boot do scraper.
            asyncio.create_task(
                asyncio.to_thread(prepare_translation, _WARMUP_LANGS)
            )

            # Flusher de fundo: envia ao core (único escritor do jobs.json) as
            # vagas acumuladas, mantendo os bots com dados frescos durante o lote.
            core_flush_task = asyncio.create_task(_core_flush_loop(repo))

            # Revalidator de fundo: 1x/dia varre vagas com idade entre 80 e 90
            # dias, faz HTTP GET pra verificar se ainda estao no ar, e remove
            # do jobs.json (via core) as que retornarem 404/410.
            revalidator_task = asyncio.create_task(run_revalidator_loop(repo))

            while True:
                batches = list(iter_batches(BATCH_SIZE))
                total = len(batches)

                # Checkpoint do ciclo: retoma do lote onde paramos em vez de
                # reiniciar do 1/N a cada restart. Se total mudou (lista de
                # stacks alterada entre deploys), reinicia do 1.
                resume_idx = await progress.load_cycle_idx(total)
                if resume_idx > 1:
                    logger.info("cycle_resume", extra={
                        "resume_idx": resume_idx, "total": total,
                    })

                for idx, (category, batch) in enumerate(batches, start=1):
                    if idx < resume_idx:
                        continue
                    set_active_batch(batch)
                    set_active_batch_context(category, idx)
                    # Persiste o idx ATUAL antes de executar. Se cair durante,
                    # ao retomar refaz este mesmo lote (idempotente via dedup).
                    await progress.save_cycle_idx(idx, total)
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

                    # Recupera zumbis em running antes do passe de reenrichment
                    # (caso o batch atual tenha deixado URLs órfãs por race/erro).
                    await tracker.requeue_stale_running()

                    # Reenrichment pass: pega URLs em state=discovered (vindas
                    # de auto-reenrich ou listings anteriores) e chama refetch_one.
                    await _run_reenrichment_pass(repo=repo, sent_jobs=sent_jobs)

                    # Envia ao core as vagas do lote + fecha Playwright (libera RAM)
                    await repo.flush_to_core()
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

                # Ciclo concluído: limpa checkpoint pra próximo ciclo começar do 1.
                await progress.clear_cycle_idx()
                logger.info("cycle_complete")
                set_active_batch(None)

                # v3.10.19: dorme antes de iniciar o proximo ciclo. Sem
                # esse sleep o scraper recomecava imediato, mantendo CPU
                # em pico continuo.
                if CYCLE_SLEEP_SECONDS > 0:
                    logger.info("cycle_sleep", extra={
                        "seconds": CYCLE_SLEEP_SECONDS,
                    })
                    await asyncio.sleep(CYCLE_SLEEP_SECONDS)
    finally:
        for t in (metrics_task, tracker_task, progress_task,
                  core_flush_task, revalidator_task):
            if t is None:
                continue
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass

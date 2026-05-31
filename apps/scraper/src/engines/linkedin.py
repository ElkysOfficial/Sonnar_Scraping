"""
Engine LinkedIn - listing -> fetch detalhe (JSON-LD) por vaga.

Fluxo:
    1. ``get_linkedin_links()`` - chama a API publica
       ``seeMoreJobPostings/search`` por stack (ate 100 vagas/stack
       paginando ``start=0..90``) e coleta links + dados parciais do card.
    2. ``get_linkedin_jobs()`` - resolve cada link em paralelo (semaforo)
       acessando ``https://br.linkedin.com/jobs/view/...-{jobId}`` e
       parseando o ``<script type=application/ld+json>`` JobPosting que
       expoe ``description``, ``employmentType``, ``datePosted``, ``skills``
       e endereco completo - dados que o listing nao traz.

Adicionalmente, lemos os ``description__job-criteria-item`` do HTML para
o ``Nivel de experiencia`` e ``Tipo de emprego`` quando o JSON-LD vem
incompleto.

LinkedIn nao impoe rate-limit pesado em paginas guest, mas pratica
respeitosa: ``_DETAIL_CONCURRENCY`` modesto, sleep aleatorio.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import sys
import time
import urllib.parse

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from variavel import get_active_batch_key, get_active_stacks  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.persistence.progress_tracker import progress  # noqa: E402
from src.utils.http_session import HttpSession, fetch  # noqa: E402
from src.utils.job_enrichment import enrich_async  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.metrics import metrics  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


logger = logging.getLogger("scraper.engine.linkedin")

# Versão do parser - bump quando mudar selectors. Permite reenrichment futuro.
# 2026.05.23 (v2.20.0): adicao de description_lang + responsibilities via
# pipeline central (lang_detect + translator + section_extractor).
PARSER_VERSION = "linkedin-2026.05.23.1"


# --- Sessao (httpx compartilhado) ----------------------------------------

# Headers completos de navegador real. LinkedIn faz fingerprinting de headers:
# faltar 'sec-ch-ua' / 'sec-fetch-*' eleva a taxa de 429 mesmo com User-Agent ok.
# Combinado com warm-up (_warmup_session) que pega cookies de tracking anonimo
# (bcookie, lidc), reduz drasticamente os bloqueios.
_LINKEDIN_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

_SESSION = HttpSession(headers=_LINKEDIN_HEADERS)
_warmed_up = False
_warmup_lock = asyncio.Lock()


async def get_session():
    return await _SESSION.get_client()


async def _warmup_session() -> None:
    """Acessa a home/jobs do LinkedIn para coletar cookies anonimos.

    LinkedIn marca IPs cujo primeiro hit e a API. Visitar paginas HTML
    publicas (/, /jobs) primeiro popula bcookie/lidc no jar do httpx; nas
    requests seguintes a sessao parece um browser normal, e nao um bot
    indo direto para um endpoint /jobs/api/.
    """
    global _warmed_up
    async with _warmup_lock:
        if _warmed_up:
            return
        client = await get_session()
        for url in ("https://br.linkedin.com/", "https://br.linkedin.com/jobs"):
            try:
                await client.get(url, timeout=10.0)
            except Exception:
                pass
        _warmed_up = True


def reset_session() -> None:
    global _warmed_up
    _warmed_up = False
    _SESSION.reset()


# --- Configuracao ---------------------------------------------------------

# Concorrência efetiva é controlada por DomainRateLimiter (rate_limiter.py).
# Mantemos um teto local de coroutines paralelas pra não criar tasks demais
# (todas vão ser serializadas pelo limitador, mas evitamos overhead de
# scheduling). Baixo = fluxo previsível, sem flooding inicial.
# v3.6.0: 4 -> 3 (ADR-006). Reduz pico de fetch paralelo do LinkedIn (~25%
# menos sockets concorrentes), com impacto minimo no throughput porque o
# bottleneck efetivo eh o DomainRateLimiter, nao o semaforo.
_DETAIL_CONCURRENCY = int(os.getenv("LINKEDIN_DETAIL_CONCURRENCY", "3"))

# Paginacao do listing. LinkedIn pagina em 25, e aceita ate ~start=1000.
# Se a stack esgotar antes (zero novos numa pagina), o loop quebra.
# 250 / 25 = 10 paginas — equilibrio entre cobertura e pressao no host.
_LISTING_MAX_START = int(os.getenv("LINKEDIN_LISTING_MAX_START", "250"))
_LISTING_STEP = int(os.getenv("LINKEDIN_LISTING_STEP", "25"))

# Regiao "base" sempre incluida — busca nacional Brasil. As demais regioes
# entram via lote rotativo (ver ``_rotating_regions``).
_PRIMARY_REGION: tuple[str, str | None] = ("Brasil", "106057199")

# Pool completo de regioes rotativas: todos os 27 estados brasileiros + um
# subset de paises com mercado tech relevante. ``geo_id=None`` faz o LinkedIn
# auto-resolver pela string ``location``. Em um ciclo so um lote eh varrido
# (ver ``_LISTING_REGION_BATCH_SIZE``); ao longo de varios ciclos cobrimos
# o pool inteiro sem saturar a sessao do LinkedIn em uma unica rodada.
_ROTATING_REGIONS: list[tuple[str, str | None]] = [
    # --- 27 UFs do Brasil ---
    ("Acre, Brasil", None),
    ("Alagoas, Brasil", None),
    ("Amapá, Brasil", None),
    ("Amazonas, Brasil", None),
    ("Bahia, Brasil", None),
    ("Ceará, Brasil", None),
    ("Distrito Federal, Brasil", None),
    ("Espírito Santo, Brasil", None),
    ("Goiás, Brasil", None),
    ("Maranhão, Brasil", None),
    ("Mato Grosso, Brasil", None),
    ("Mato Grosso do Sul, Brasil", None),
    ("Minas Gerais, Brasil", None),
    ("Pará, Brasil", None),
    ("Paraíba, Brasil", None),
    ("Paraná, Brasil", None),
    ("Pernambuco, Brasil", None),
    ("Piauí, Brasil", None),
    ("Rio de Janeiro, Brasil", None),
    ("Rio Grande do Norte, Brasil", None),
    ("Rio Grande do Sul, Brasil", None),
    ("Rondônia, Brasil", None),
    ("Roraima, Brasil", None),
    ("Santa Catarina, Brasil", None),
    ("São Paulo, Brasil", None),
    ("Sergipe, Brasil", None),
    ("Tocantins, Brasil", None),
    # --- Paises com tech relevante ---
    ("United States", None),
    ("United Kingdom", None),
    ("Portugal", None),
    ("Spain", None),
    ("France", None),
    ("Germany", None),
    ("Netherlands", None),
    ("Ireland", None),
    ("Italy", None),
    ("Sweden", None),
    ("Belgium", None),
    ("Switzerland", None),
    ("Canada", None),
    ("Mexico", None),
    ("Argentina", None),
    ("Chile", None),
    ("Colombia", None),
    ("Australia", None),
    ("Singapore", None),
    ("Japan", None),
]

# Tamanho do lote rotativo por ciclo. 5 regioes/ciclo × ~47 regioes total =
# ~10 lotes; em ~20 horas de ciclos (10min cada × 2h pausa) cobrimos o pool
# inteiro. Cada ciclo individual mantem 5 (rotativas) + Brasil (primary) =
# 6 regioes — pressao por ciclo equivalente a antiga (era 10 regioes fixas).
_LISTING_REGION_BATCH_SIZE = int(os.getenv("LINKEDIN_REGION_BATCH_SIZE", "5"))

# Janela de rotacao em segundos. O indice avanca 1 lote a cada essa janela.
# 2h casa com BATCH_INTERVAL_SECONDS do controller — cada execucao do
# LinkedIn dentro de um batch pega o mesmo lote rotativo, evitando saltos
# no meio do batch.
_LISTING_ROTATION_INTERVAL_S = int(
    os.getenv("LINKEDIN_REGION_ROTATION_INTERVAL_S", "7200")
)


def _rotating_regions() -> list[tuple[str, str | None]]:
    """Lote de regioes estrangeiras + estados BR do ciclo atual.

    Igual ao Careerjet: o indice avanca a cada janela de rotacao (default
    2h), cobrindo o pool inteiro de ``_ROTATING_REGIONS`` ao longo de
    aproximadamente um dia. Baseado no relogio (sem arquivo de estado) —
    sobrevive a reinicios do processo.
    """
    n = len(_ROTATING_REGIONS)
    if n == 0 or _LISTING_REGION_BATCH_SIZE <= 0:
        return []
    total_batches = math.ceil(n / _LISTING_REGION_BATCH_SIZE)
    idx = int(time.time() // _LISTING_ROTATION_INTERVAL_S) % total_batches
    start = idx * _LISTING_REGION_BATCH_SIZE
    return list(_ROTATING_REGIONS[start:start + _LISTING_REGION_BATCH_SIZE])


def _active_regions() -> list[tuple[str, str | None]]:
    """Regioes a varrer neste ciclo: ``Brasil`` (sempre) + lote rotativo."""
    return [_PRIMARY_REGION] + _rotating_regions()


# Ordenacoes a rodar por (stack, regiao). LinkedIn nao retorna o mesmo set
# por relevancia e por data: vagas recem-postadas que ainda nao ranquearam
# so aparecem em sortBy=DD.
#   None = relevance (default)
#   'DD' = date desc
_LISTING_SORTS: list[str | None] = [None, "DD"]

# Mapeamento employmentType (schema.org) -> vocabulario interno canonico.
# Compativel com job_fallbacks.refine_hiring_regime().
_REGIME_MAP = {
    "FULL_TIME": "CLT",
    "PART_TIME": "Meio Período",
    "CONTRACTOR": "PJ",
    "INTERN": "Estágio",
    "TEMPORARY": "Temporário",
    "VOLUNTEER": "Voluntário",
    "OTHER": "",
}

# "Tipo de emprego" do criteria item (HTML) -> vocabulario canonico.
# Usado quando o JSON-LD nao tem employmentType.
_EMPLOYMENT_TYPE_HTML = {
    "tempo integral": "CLT",
    "full-time": "CLT",
    "full time": "CLT",
    "meio período": "Meio Período",
    "meio periodo": "Meio Período",
    "part-time": "Meio Período",
    "part time": "Meio Período",
    "contrato": "PJ",
    "contract": "PJ",
    "estágio": "Estágio",
    "estagio": "Estágio",
    "internship": "Estágio",
    "temporário": "Temporário",
    "temporario": "Temporário",
    "temporary": "Temporário",
    "voluntário": "Voluntário",
    "voluntario": "Voluntário",
    "volunteer": "Voluntário",
}


# --- Fase 1: coleta de links ---------------------------------------------

def _detect_work_type(location_raw: str, title: str) -> str:
    """Heuristica de modalidade pelo texto da localidade e titulo."""
    blob = (location_raw + " " + title).lower()
    if "remoto" in blob or "remote" in blob:
        return "Remoto"
    if "híbrido" in blob or "hibrido" in blob or "hybrid" in blob:
        return "Híbrido"
    return "Presencial"


def _parse_listing_card(cell) -> dict | None:
    """Converte um ``base-card`` do listing num seed parcial.

    Returns:
        Dict com ``link``, ``title``, ``company``, ``location_raw``,
        ``work_type``, ``hiring_regime``, ``publication_date``, ou None
        se faltar link/titulo.
    """
    a = cell.find("a", class_="base-card__full-link")
    if not a or not a.get("href"):
        return None
    link = a["href"].split("?")[0]  # remove query (tracking) - URL canonica

    h3 = cell.find("h3")
    h4 = cell.find("h4")
    if not h3:
        return None
    title = h3.get_text(strip=True)
    company = h4.get_text(strip=True) if h4 else ""

    loc_el = cell.find("span", class_="job-search-card__location")
    location_raw = loc_el.get_text(strip=True) if loc_el else ""

    work_type = _detect_work_type(location_raw, title)

    # Data do listing (datetime ISO) - melhor que a data do detail-fetch
    # quando essa nao vier.
    time_el = cell.find("time", class_="job-search-card__listdate")
    date_raw = ""
    if time_el and time_el.get("datetime"):
        date_raw = time_el["datetime"][:10]
    if date_raw and len(date_raw) == 10 and "-" in date_raw:
        y, m, d = date_raw.split("-")
        publication_date = f"{d}/{m}/{y}"
    else:
        publication_date = date_raw

    # Regime do criteria-item do listing (raro, mas as vezes vem)
    hiring_regime = ""
    insight = cell.find("span", class_="job-search-card__job-insight")
    if insight:
        emp_text = insight.get_text(strip=True).lower()
        for needle, label in _EMPLOYMENT_TYPE_HTML.items():
            if needle in emp_text:
                hiring_regime = label
                break

    if work_type == "Remoto":
        location: list = []
    else:
        parts = [p.strip() for p in location_raw.split(",") if p.strip()]
        location = parts[:2]

    return {
        "link": link,
        "title": title,
        "company": company,
        "location": location,
        "work_type": work_type,
        "hiring_regime": hiring_regime,
        "publication_date": publication_date,
    }


def _build_listing_url(stack_encoded: str, location: str, geo_id: str | None,
                       start: int, sort: str | None) -> str:
    """Monta a URL do endpoint ``seeMoreJobPostings/search``."""
    loc_enc = urllib.parse.quote(location)
    parts = [
        f"keywords={stack_encoded}",
        f"location={loc_enc}",
        f"start={start}",
    ]
    if geo_id:
        parts.append(f"geoId={geo_id}")
    if sort:
        parts.append(f"sortBy={sort}")
    return "https://br.linkedin.com/jobs/api/seeMoreJobPostings/search?" + "&".join(parts)


def _build_referer(stack_encoded: str, location: str, geo_id: str | None) -> str:
    loc_enc = urllib.parse.quote(location)
    base = f"https://br.linkedin.com/jobs/search?keywords={stack_encoded}&location={loc_enc}"
    return base + (f"&geoId={geo_id}" if geo_id else "")


async def _scan_listing(client, stack: str, location: str, geo_id: str | None,
                        sort: str | None, seen: set[str], seeds: list[dict]) -> int:
    """Pagina o listing para uma combinacao (stack, regiao, ordenacao).

    Retorna o numero de novos seeds adicionados nesta passada. Quebra cedo
    quando uma pagina inteira so traz duplicatas (sinal de que LinkedIn
    esgotou o conjunto sob esse filtro).
    """
    encoded = urllib.parse.quote(stack)
    referer = _build_referer(encoded, location, geo_id)
    headers = {
        "Referer": referer,
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "X-Requested-With": "XMLHttpRequest",
    }
    added = 0
    for start in range(0, _LISTING_MAX_START, _LISTING_STEP):
        url = _build_listing_url(encoded, location, geo_id, start, sort)
        response = await fetch(client, url, headers=headers)
        if response is None:
            metrics.event("listing.aborted", domain="br.linkedin.com",
                          stack=stack, location=location, sort=sort or "rel",
                          start=start)
            break
        if response.status_code != 200:
            metrics.incr("listing.non_200", domain="br.linkedin.com")
            break

        soup = BeautifulSoup(response.content, "html.parser")
        cells = soup.find_all("div", class_="base-card")
        if not cells:
            break

        new_in_page = 0
        for cell in cells:
            seed = _parse_listing_card(cell)
            if not seed:
                continue
            if seed["link"] in seen:
                continue
            seen.add(seed["link"])
            seeds.append(seed)
            tracker.discover(seed["link"], engine="linkedin")
            new_in_page += 1
            added += 1

        if new_in_page == 0:
            # Pagina sem novidade: stack esgotada sob esse (regiao, sort).
            break
    return added


async def get_linkedin_links() -> list[dict]:
    """Coleta seeds (link + dados parciais) de todas as stacks ativas.

    Cobertura ampliada por 3 eixos:
      A. Paginacao profunda (ate ``_LISTING_MAX_START``, step 25),
         com cutoff adaptativo quando a stack esgota.
      B. Multi-ordenacao: relevance + date (``sortBy=DD``).
      C. Multi-regiao rotativa: ``Brasil`` (sempre) + lote rotativo de
         ``_LISTING_REGION_BATCH_SIZE`` regioes vindo do pool global
         (27 UFs + paises com mercado tech). O indice avanca por relogio
         (igual Careerjet) — sobrevive a reinicios e cobre o pool inteiro
         ao longo de ~1 dia de ciclos.

    Dedup por URL canonica via ``seen``: combinacoes posteriores so somam
    vagas inéditas. ``fetch`` (policy wrapper) cuida de rate-limit, retry
    e circuit breaker - sem isso o volume de requests dispararia 429.

    Checkpoint (sobrevive a restart)
    --------------------------------
    Antes de cada combinacao ``(stack, region, sort)`` salva o cursor no
    ``progress_tracker``. No restart, ``progress.resume`` devolve a
    posicao salva e o loop pula direto pra ela, evitando refazer os
    listings das combinacoes ja varridas no batch corrente. A retomada eh
    feita por **label** (``region_label`` no cursor), nao por indice,
    porque o lote rotativo pode mudar entre o checkpoint e o restart.
    Se o label salvo nao existe no lote atual, ignora o cursor e comeca
    do zero — pior caso: refaz o batch atual desde o inicio.

    Granularidade: por combinacao — perda maxima no restart e ~10 paginas
    (uma combinacao interrompida). O dedup mais amplo via ``sent_jobs`` no
    controller continua filtrando vagas conhecidas, entao perder o ``seen``
    local nao causa reprocessamento.
    """
    seeds: list[dict] = []
    seen: set[str] = set()
    client = await get_session()
    await _warmup_session()

    stacks_list = list(get_active_stacks())
    regions_list = _active_regions()

    # Tenta retomar do ponto salvo. None = sem cursor (comeca do zero ou
    # rodando sem controller/batch ativo). ``batch_key`` mudou desde o
    # checkpoint => ``resume`` ja devolve None (proximo batch, posicao zero).
    batch_key = get_active_batch_key()
    cursor = await progress.resume("linkedin", batch_key) if batch_key else None

    resume_stack = (cursor or {}).get("stack")
    resume_region_label = (cursor or {}).get("region")
    resume_sort = (cursor or {}).get("sort")

    # Resolve labels -> indices no contexto ATUAL. Se o label nao existe
    # mais (lote rotativo virou), descarta o cursor inteiro.
    resume_stack_idx = 0
    resume_region_idx = 0
    resume_sort_idx = 0
    if cursor:
        try:
            resume_stack_idx = stacks_list.index(resume_stack) if resume_stack else 0
        except ValueError:
            resume_stack_idx = 0
            cursor = None  # stack salva nao esta no batch atual

    if cursor:
        region_labels = [r[0] for r in regions_list]
        try:
            resume_region_idx = (
                region_labels.index(resume_region_label) if resume_region_label else 0
            )
        except ValueError:
            # Regiao salva nao esta no lote rotativo atual: descarta cursor.
            # Refazemos o batch desde o inicio — aceitavel.
            cursor = None
            resume_stack_idx = 0
            resume_region_idx = 0

    if cursor:
        sort_labels = [(s or "rel") for s in _LISTING_SORTS]
        try:
            resume_sort_idx = (
                sort_labels.index(resume_sort) if resume_sort else 0
            )
        except ValueError:
            resume_sort_idx = 0

    if cursor:
        logger.info("linkedin_resume", extra={
            "batch_key": batch_key,
            "stack": resume_stack, "stack_idx": resume_stack_idx,
            "region": resume_region_label, "region_idx": resume_region_idx,
            "sort": resume_sort, "sort_idx": resume_sort_idx,
        })

    for stack_idx, stack in enumerate(stacks_list):
        if stack_idx < resume_stack_idx:
            continue
        for region_idx, (region_label, geo_id) in enumerate(regions_list):
            # Region index so eh respeitado para a stack onde paramos.
            if stack_idx == resume_stack_idx and region_idx < resume_region_idx:
                continue
            for sort_idx, sort in enumerate(_LISTING_SORTS):
                # Sort index so eh respeitado para (stack, region) onde paramos.
                if (stack_idx == resume_stack_idx
                        and region_idx == resume_region_idx
                        and sort_idx < resume_sort_idx):
                    continue

                # Salva o cursor APONTANDO PRA ESTA combinacao antes de
                # executa-la. Se o processo cair durante, ao reiniciar
                # refazemos so esta combinacao (max ~10 paginas), nao o
                # batch inteiro.
                if batch_key:
                    progress.set_cursor("linkedin", batch_key, {
                        "stack_idx": stack_idx,
                        "stack": stack,
                        "region_idx": region_idx,
                        "region": region_label,
                        "sort_idx": sort_idx,
                        "sort": sort or "rel",
                    })

                added = await _scan_listing(
                    client, stack, region_label, geo_id, sort, seen, seeds,
                )
                # Respiro entre combinacoes pra nao saturar o rate limiter
                if added > 0:
                    await asyncio.sleep(2.0)

        # Respiro maior entre stacks: o multiplicador (regions x sorts)
        # ja eleva o volume; sustentar 10s evita 429 cascateado quando o
        # LinkedIn impoe limite por sessao (nao apenas por taxa).
        if stack_idx < len(stacks_list) - 1:
            await asyncio.sleep(10.0)

    # Ciclo completo: limpa o cursor pra que o proximo batch comece do zero
    # (proximo batch tera batch_key diferente — esse clear so eh defensivo).
    if batch_key:
        await progress.clear("linkedin", batch_key)

    metrics.set_gauge("listing.seeds", len(seeds), domain="br.linkedin.com")
    return seeds


# --- Fase 2: detail-fetch -------------------------------------------------

def _normalize_employment_type(value) -> str:
    """Mapeia ``employmentType`` (string ou lista) para vocabulario canonico."""
    if isinstance(value, list):
        for v in value:
            if isinstance(v, str) and v.upper() in _REGIME_MAP:
                return _REGIME_MAP[v.upper()]
        return ""
    if isinstance(value, str):
        return _REGIME_MAP.get(value.upper(), "")
    return ""


_COUNTRY_NAME_BY_ISO = {
    "BR": "Brasil", "US": "Estados Unidos", "PT": "Portugal", "GB": "Reino Unido",
    "ES": "Espanha", "FR": "França", "DE": "Alemanha", "IT": "Itália",
    "AR": "Argentina", "CA": "Canadá", "MX": "México",
}


def _format_jsonld_location(jp: dict) -> list:
    """Compoe ``[cidade, UF]`` a partir do ``jobLocation`` do JSON-LD.

    LinkedIn em vagas BR: ``addressCountry='BR'`` + ``addressLocality='Sao Paulo'``;
    ``addressRegion`` frequentemente vem null. Devolvemos ``[locality]``,
    ``[locality, region]``, ou ``[locality, country_name]`` quando a UF nao
    veio mas o pais sim - garante que o normalizer tenha pelo menos country.
    """
    loc = jp.get("jobLocation") or {}
    if isinstance(loc, list):
        loc = loc[0] if loc else {}
    if not isinstance(loc, dict):
        return []
    addr = loc.get("address") or {}
    if not isinstance(addr, dict):
        return []
    locality = (addr.get("addressLocality") or "").strip()
    region = (addr.get("addressRegion") or "").strip()
    country_iso = (addr.get("addressCountry") or "").strip().upper()
    if locality and region:
        return [locality, region]
    if locality:
        # Sem UF: anexa nome do pais para que normalize_location detecte cc.
        # Cobre macro-regioes ("Porto Alegre e Regiao") onde o LinkedIn nao
        # da UF mas da addressCountry='BR'.
        country_name = _COUNTRY_NAME_BY_ISO.get(country_iso)
        if country_name:
            return [locality, country_name]
        return [locality]
    return []


_BR_UF_SET = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
}


def _split_topcard_location(text: str) -> list:
    """Converte ``'Florianopolis, SC'`` em ``['Florianopolis', 'SC']``.

    Aceita ``'Brasil'``, ``'Sao Paulo, SP'``, ``'Sao Paulo, SP, Brasil'``.
    """
    parts = [p.strip() for p in text.split(",") if p.strip()]
    if not parts:
        return []
    # Se o ultimo token for sigla UF, mantem ['cidade', 'UF']
    if len(parts) >= 2 and parts[1].upper() in _BR_UF_SET:
        return [parts[0], parts[1].upper()]
    return [parts[0]]


def _format_topcard_location(soup) -> str:
    """Le a string de localizacao do topcard HTML do detail.

    LinkedIn coloca em dois lugares (redundantes):
      - ``span.topcard__flavor--bullet``
      - ``h4.top-card-layout__second-subline > span`` (segundo span, depois
        do nome da empresa).

    Vagas Brasil-wide remoto trazem ``'Brasil'``; vagas locais trazem
    ``'Cidade, UF'`` mesmo quando o JSON-LD omite ``addressRegion``.
    """
    el = soup.find("span", class_="topcard__flavor--bullet")
    if el:
        text = el.get_text(strip=True)
        if text:
            return text
    spans = soup.select("h4.top-card-layout__second-subline span")
    for s in spans:
        text = s.get_text(strip=True)
        if not text:
            continue
        # Pula timestamps ("Há 4 dias") e contadores ("33 candidaturas")
        low = text.lower()
        if low.startswith("há ") or "candidatur" in low or "applicant" in low:
            continue
        if re.search(r"\d", text):
            continue
        return text
    return ""


def _format_jsonld_date(jp: dict) -> str:
    """``'2026-05-06T13:12:24.000Z'`` -> ``'06/05/2026'``."""
    raw = (jp.get("datePosted") or "")[:10]
    if len(raw) == 10 and "-" in raw:
        y, m, d = raw.split("-")
        return f"{d}/{m}/{y}"
    return ""


def _format_jsonld_salary(jp: dict) -> str:
    """Extrai salario de ``baseSalary`` (geralmente null no LinkedIn BR)."""
    base = jp.get("baseSalary")
    if not isinstance(base, dict):
        return ""
    currency = base.get("currency", "BRL")
    value = base.get("value") or {}
    if isinstance(value, dict):
        mn = value.get("minValue", "")
        mx = value.get("maxValue", mn)
        if mn and mx and mn != mx:
            return f"{currency} {mn} - {mx}"
        if mn:
            return f"{currency} {mn}"
    elif value:
        return f"{currency} {value}"
    return ""


def _parse_html_criteria(soup) -> dict:
    """Le os ``description__job-criteria-item`` do HTML e devolve dict.

    Campos tipicos no LinkedIn (label PT-BR):
        'Nivel de experiencia', 'Tipo de emprego', 'Funcao', 'Setores'.
    """
    out = {}
    for ci in soup.find_all("li", class_="description__job-criteria-item"):
        h = ci.find(["h3", "h4"])
        v = ci.find("span")
        if not h or not v:
            continue
        out[h.get_text(strip=True).lower()] = v.get_text(strip=True)
    return out


def _regime_from_criteria(criteria: dict) -> str:
    """Mapeia ``Tipo de emprego`` ou ``Nivel de experiencia`` para regime."""
    tipo = (criteria.get("tipo de emprego") or "").lower()
    if tipo:
        for needle, label in _EMPLOYMENT_TYPE_HTML.items():
            if needle in tipo:
                return label
    nivel = (criteria.get("nível de experiência") or
             criteria.get("nivel de experiencia") or "").lower()
    if "estágio" in nivel or "estagio" in nivel or "internship" in nivel:
        return "Estágio"
    if "trainee" in nivel:
        return "Trainee"
    if "aprendiz" in nivel:
        return "Aprendiz"
    return ""


async def _fetch_detail(seed: dict, sem: asyncio.Semaphore, client) -> dict:
    """Busca a pagina canonica e devolve dict de enriquecimento.

    Rate-limit, retry/backoff e circuit breaker são aplicados pelo
    ``fetch`` (policy wrapper). Quando ele devolve ``None`` (circuit aberto
    ou retries esgotados), retornamos seed apenas - o controller já sabe
    que enriquecimento eh best-effort.
    """
    # v3.10.28: description_lang DEFAULT 'pt' (LinkedIn BR/LATAM eh
    # majoritariamente PT). Antes era None e quando a vaga vinha sem
    # description, o core rejeitava com 422 ("Vagas sem
    # description_lang nao sao aceitas"). Loop infinito de 1547 vagas
    # reenfileiradas observado em 31/05 15:21. enrich_canonical
    # sobrescreve quando detecta outro idioma.
    out = {
        "title": "",
        "company": "",
        "description": "",
        "description_lang": "pt",
        "responsibilities": None,
        "skills": [],
        "salary": "",
        "publication_date": "",
        "location": [],
        "hiring_regime": "",
    }
    async with sem:
        r = await fetch(client, seed["link"])
        if r is None:
            metrics.incr("detail.skipped", domain="br.linkedin.com")
            return out
        if r.status_code != 200 or len(r.text) < 1000:
            metrics.incr("detail.empty", domain="br.linkedin.com")
            return out

        soup = BeautifulSoup(r.text, "html.parser")

        # Camada 1: JSON-LD oficial
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
            except Exception:
                continue
            items = data if isinstance(data, list) else [data]
            jp = next((x for x in items if isinstance(x, dict)
                       and x.get("@type") == "JobPosting"), None)
            if not jp:
                continue

            # Title e company: o JSON-LD do LinkedIn SEMPRE traz; antes
            # so usavamos do seed do listing, perdiamos quando refetch_one
            # reprocessava a vaga (seed vazio).
            title = (jp.get("title") or "").strip()
            if title:
                out["title"] = title
            ho = jp.get("hiringOrganization") or {}
            if isinstance(ho, dict):
                cname = (ho.get("name") or "").strip()
                if cname:
                    out["company"] = cname

            description = strip_html(jp.get("description", "") or "")
            if description:
                out["description"] = description
                out["skills"] = extract_skills(description)

            sal = _format_jsonld_salary(jp)
            if sal:
                out["salary"] = sal

            pub = _format_jsonld_date(jp)
            if pub:
                out["publication_date"] = pub

            loc = _format_jsonld_location(jp)
            if loc:
                out["location"] = loc

            regime = _normalize_employment_type(jp.get("employmentType"))
            if regime:
                out["hiring_regime"] = regime
            break

        # Camada 1.5: topcard HTML location.
        # JSON-LD do LinkedIn frequentemente vem com addressRegion=null
        # (perdemos a UF) ou sem jobLocation algum (vagas remotas Brasil-wide).
        # O topcard HTML traz "Cidade, UF" ou "Brasil" - mais confiavel.
        topcard_text = _format_topcard_location(soup)
        if topcard_text:
            tc_loc = _split_topcard_location(topcard_text)
            cur = out["location"]
            if not cur:
                # JSON-LD nao trouxe nada (caso remoto): usa topcard
                out["location"] = tc_loc
            else:
                # JSON-LD nao trouxe UF real (segundo elem ausente ou eh
                # nome de pais como "Brasil"). Se o topcard tem UF, prefere.
                second = cur[1].upper() if len(cur) >= 2 else ""
                cur_has_uf = second in _BR_UF_SET
                tc_has_uf = (
                    len(tc_loc) >= 2 and tc_loc[1].upper() in _BR_UF_SET
                    and tc_loc[0].lower() == cur[0].lower()
                )
                if not cur_has_uf and tc_has_uf:
                    out["location"] = tc_loc

        # Camada 2: criteria items HTML (overrides regime se mais especifico)
        criteria = _parse_html_criteria(soup)
        if criteria:
            crit_regime = _regime_from_criteria(criteria)
            # "Estagio" do nivel de experiencia ganha de "CLT" do JSON-LD
            # quando employmentType=FULL_TIME mas nivel=Estagio (caso real
            # de bancos que cadastram estagiarios como tempo integral).
            if crit_regime == "Estágio":
                out["hiring_regime"] = "Estágio"
            elif crit_regime and not out["hiring_regime"]:
                out["hiring_regime"] = crit_regime

        # Camada 3: HTML markup como fallback de descricao
        if not out["description"]:
            desc_div = (soup.find("div", class_="show-more-less-html__markup") or
                        soup.find("section", class_="description"))
            if desc_div:
                description = desc_div.get_text("\n", strip=True)
                out["description"] = description
                out["skills"] = extract_skills(description) if description else []

    # Pipeline de enriquecimento (epico v3.0.0):
    # detect_lang -> translate (se !=pt) -> extract_responsibilities.
    # description e SUBSTITUIDA pela versao em PT quando idioma original
    # nao for portugues (regra de produto: cliente sempre recebe PT).
    #
    # v3.6.0: se enrichment falha, retorna None (skip vaga). Banco so PT.
    if out["description"]:
        try:
            lang, resp, description_pt = await enrich_async(
                title=out["title"], description=out["description"]
            )
            out["description_lang"] = lang
            out["responsibilities"] = resp
            if description_pt and lang and lang not in ("pt", "unknown"):
                out["description"] = description_pt
                # Recalcula skills no texto traduzido (catalogo PT esta
                # ajustado pro portugues; ingles tambem casa via overlap)
                out["skills"] = extract_skills(description_pt)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "[linkedin] skip url=%s: enrichment falhou: %s", seed.get("link"), exc
            )
            return None

    return out


def _merge_detail_over_seed(seed: dict, detail: dict) -> list:
    """Monta a lista canonica de 12 campos preferindo detail sobre seed.

    Indices 10 e 11 (description_lang, responsibilities) sao novos no
    epico v3.0.0 - preenchidos por enrich_async no _fetch_detail.
    """
    return [
        seed["link"],
        # Title e company: detail-first agora. Seed pode estar vazio quando
        # vem de refetch_one (reenrich), e o JSON-LD do LinkedIn sempre traz.
        detail.get("title") or seed["title"],
        detail.get("company") or seed["company"],
        detail.get("location") or seed["location"],
        seed["work_type"],
        detail.get("hiring_regime") or seed["hiring_regime"],
        detail.get("salary") or "",
        detail.get("publication_date") or seed["publication_date"],
        detail.get("skills") or [],
        detail.get("description") or "",
        detail.get("description_lang"),
        detail.get("responsibilities"),
    ]


# --- Funcao publica -------------------------------------------------------

async def get_linkedin_jobs(on_job=None) -> list:
    """Coleta vagas do LinkedIn em duas fases (listing + detalhe por link).

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                resolvida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canonico de 10 campos.
    """
    seeds = await get_linkedin_links()
    if not seeds:
        print("Foram obtidas 0 vagas do site LinkedIn")
        return []

    sem = asyncio.Semaphore(_DETAIL_CONCURRENCY)
    client = await get_session()
    jobs: list = []

    async def _resolve(seed: dict) -> None:
        try:
            detail = await _fetch_detail(seed, sem, client)
        except Exception as exc:
            metrics.event("parser.error", domain="br.linkedin.com",
                          url=seed.get("link"), error=str(exc))
            logger.exception("detail_parser_error", extra={
                "url": seed.get("link"), "errorMessage": str(exc),
            })
            detail = {}
        parsed = apply_description_fallbacks(_merge_detail_over_seed(seed, detail))
        jobs.append(parsed)
        if on_job is not None:
            try:
                await on_job(parsed)
            except Exception as exc:
                metrics.incr("on_job.error", domain="br.linkedin.com")
                logger.exception("on_job_error", extra={
                    "url": seed.get("link"), "errorMessage": str(exc),
                })

    await asyncio.gather(*(_resolve(s) for s in seeds))

    enriched = sum(1 for j in jobs if len(j[9]) > 200)
    metrics.set_gauge("jobs.total", len(jobs), domain="br.linkedin.com")
    metrics.set_gauge("jobs.enriched", enriched, domain="br.linkedin.com")
    print(
        f"Foram obtidas {len(jobs)} vagas do site LinkedIn "
        f"({enriched} com descricao completa)"
    )
    return jobs


async def refetch_one(url: str) -> list | None:
    """Reprocessa uma URL específica (passe de reenrichment).

    Pula o listing - vai direto na página canônica buscar o JSON-LD.
    Devolve a lista canônica de 10 campos ou None se o detail falhar.
    Útil quando o ``parser_version`` é bumpado e queremos reprocessar
    URLs antigas sem esperar o listing trazê-las de novo.
    """
    seed = {
        "link": url,
        "title": "",
        "company": "",
        "location": [],
        "work_type": "",
        "hiring_regime": "",
        "publication_date": "",
    }
    sem = asyncio.Semaphore(1)
    client = await get_session()
    try:
        detail = await _fetch_detail(seed, sem, client)
    except Exception as exc:
        logger.warning("refetch_error", extra={"url": url, "errorMessage": str(exc)})
        return None
    if not detail.get("description") and not detail.get("hiring_regime"):
        return None  # nada novo - deixa o tracker marcar como failed
    return apply_description_fallbacks(_merge_detail_over_seed(seed, detail))


# --- Modo debug ------------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_linkedin_jobs())[:10]:
        print(j)

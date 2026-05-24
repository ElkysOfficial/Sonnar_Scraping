"""
Engine SimplyHired Brasil - Playwright (listing) + curl_cffi (detail).

O SimplyHired fica atrás do Cloudflare, que bloqueia clientes HTTP comuns.
Para o **listing** ainda precisamos de Playwright headless (via
``utils.browser_fetch.fetch_html``); já as páginas de **detalhe** passam
com ``curl_cffi`` impersonando Chrome - bem mais barato.

Fluxo:
    1. Listing por stack via Playwright → extrai ``__NEXT_DATA__`` para
       coletar URLs + dados básicos (título, empresa, local).
    2. Para cada vaga, fetch da página de detalhe via curl_cffi → parseia o
       JSON-LD ``JobPosting`` para enriquecer com ``description``,
       ``datePosted`` (ISO) e endereço estruturado (locality/region/country).
    3. Skills extraídas de ``description`` via ``extract_skills``.

Iteramos por stack do lote ativo, paginando até ``SIMPLYHIRED_MAX_PAGES``
(default 5).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta

from curl_cffi import requests as cffi_requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from variavel import get_active_batch_key, get_active_stacks  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.persistence.progress_tracker import progress  # noqa: E402
from src.utils.http_session import fetch_sync  # noqa: E402
from src.utils.job_enrichment import enrich_canonical  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402

import logging
logger = logging.getLogger("scraper.engine.simplyhired")


# 2026-05-23 (v2.23.0): pipeline central. SimplyHired BR e majoritariamente PT.
PARSER_VERSION = "simplyhired-2026.05.23"

# Import preguiçoso de Playwright: só carrega no listing (que precisa dele
# pra passar Cloudflare). O fetch_detail usa curl_cffi e roda sem Playwright.


# --- Configuração --------------------------------------------------------

SH_MAX_PAGES = int(os.getenv("SIMPLYHIRED_MAX_PAGES", "5"))
SH_FETCH_DETAIL = os.getenv("SIMPLYHIRED_FETCH_DETAIL", "1") == "1"
SH_DETAIL_CONCURRENCY = int(os.getenv("SIMPLYHIRED_DETAIL_CONCURRENCY", "5"))

_RE_NEXT_DATA = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>',
    re.DOTALL,
)
_RE_JSONLD = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)


# Sessão curl_cffi reusada entre fetches de detalhe (Chrome impersonation)
_detail_session = None


def _get_detail_session():
    global _detail_session
    if _detail_session is None:
        _detail_session = cffi_requests.Session(impersonate="chrome120")
    return _detail_session


# --- Helpers privados ----------------------------------------------------

def _parse_relative_date(date_text: str) -> str:
    """Converte datas relativas (PT-BR/EN) para ``DD/MM/YYYY``.

    Aceita: ``hoje``/``today``/``just``, ``ontem``/``yesterday``,
    ``X dias``/``X days``, ``X semanas``/``X weeks``, ``X meses``/``X months``.
    """
    if not date_text:
        return ""
    date_text = date_text.lower().strip()
    today = datetime.now()
    if "hoje" in date_text or "today" in date_text or "just" in date_text:
        return today.strftime("%d/%m/%Y")
    if "ontem" in date_text or "yesterday" in date_text:
        return (today - timedelta(days=1)).strftime("%d/%m/%Y")
    days_match = re.search(r"(\d+)\s*(dias?|days?)", date_text)
    if days_match:
        return (today - timedelta(days=int(days_match.group(1)))).strftime("%d/%m/%Y")
    weeks_match = re.search(r"(\d+)\s*(semanas?|weeks?)", date_text)
    if weeks_match:
        return (today - timedelta(weeks=int(weeks_match.group(1)))).strftime("%d/%m/%Y")
    months_match = re.search(r"(\d+)\s*(m[eê]s(es)?|months?)", date_text)
    if months_match:
        return (today - timedelta(days=int(months_match.group(1)) * 30)).strftime("%d/%m/%Y")
    return ""


def _extract_company(item: dict, job_title: str) -> tuple[str, str]:
    """Extrai empresa do item, com fallback para sufixo do título.

    O SimplyHired às vezes embute a empresa no título com formato
    ``"Job Title - Company"``. Quando o campo dedicado não existe, removemos
    o sufixo do título e devolvemos a empresa.

    Returns:
        Tupla ``(company, possibly_cleaned_title)``.
    """
    company = (
        item.get("company", "")
        or item.get("companyName", "")
        or item.get("employer", "")
    )
    if not company:
        ci = item.get("companyInfo", {})
        if isinstance(ci, dict):
            company = ci.get("name", "") or ci.get("companyName", "")
    if not company and " - " in job_title:
        parts = job_title.rsplit(" - ", 1)
        job_title = parts[0].strip()
        company = parts[1].strip() if len(parts) > 1 else ""
    return company, job_title


def _extract_hiring_regime(job_types: list) -> str:
    """Mapeia ``jobTypes`` do SimplyHired para o vocabulário interno."""
    for jt in job_types or []:
        jt_lower = jt.lower() if isinstance(jt, str) else ""
        if "integral" in jt_lower or "full" in jt_lower:
            return "CLT"
        if "parcial" in jt_lower or "part" in jt_lower:
            return "Meio Período"
        if "temporário" in jt_lower or "temp" in jt_lower:
            return "Temporário"
        if "estágio" in jt_lower or "intern" in jt_lower:
            return "Estágio"
        if "freelance" in jt_lower or "contract" in jt_lower:
            return "PJ"
    return ""


def _parse_publication_date(item: dict) -> str:
    """Tenta múltiplos campos de data; ISO primeiro, fallback relativo."""
    date_field = (
        item.get("postedAt", "")
        or item.get("datePosted", "")
        or item.get("postedDate", "")
        or item.get("formattedDate", "")
    )
    if not isinstance(date_field, str) or not date_field:
        return ""
    if len(date_field) >= 10 and "-" in date_field:
        d = date_field[:10].split("-")
        if len(d) == 3:
            return f"{d[2]}/{d[1]}/{d[0]}"
    return _parse_relative_date(date_field)


def _parse_jsonld_jobposting(html: str) -> dict | None:
    """Procura bloco JSON-LD ``@type=JobPosting`` no HTML da página de detalhe."""
    for blk in _RE_JSONLD.finditer(html):
        try:
            data = json.loads(blk.group(1))
        except (json.JSONDecodeError, ValueError):
            continue
        cands = data if isinstance(data, list) else [data]
        for c in cands:
            if isinstance(c, dict) and c.get("@type") == "JobPosting":
                return c
    return None


def _format_jsonld_location(jp: dict) -> str:
    """Constrói ``"Cidade, ST, CC"`` a partir de ``jobLocation`` do JSON-LD.

    O ``location_normalizer`` do repository extrai ``state_code``/``country_code``
    a partir desse formato. Devolve string vazia se address ausente.
    """
    loc = jp.get("jobLocation") or {}
    if isinstance(loc, list):
        loc = loc[0] if loc else {}
    addr = loc.get("address") if isinstance(loc, dict) else None
    if not isinstance(addr, dict):
        return ""
    parts = [
        addr.get("addressLocality") or "",
        addr.get("addressRegion") or "",
        addr.get("addressCountry") or "",
    ]
    parts = [p.strip() for p in parts if p and isinstance(p, str) and p.strip()]
    return ", ".join(parts)


def _format_jsonld_date(jp: dict) -> str:
    """``'2026-04-01T05:00:00.000Z'`` → ``'01/04/2026'`` (vazio se ausente)."""
    raw = (jp.get("datePosted") or "")[:10]
    if len(raw) == 10 and "-" in raw:
        y, m, d = raw.split("-")
        return f"{d}/{m}/{y}"
    return ""


async def _fetch_job_detail(link: str, semaphore: asyncio.Semaphore) -> dict:
    """Busca detalhe via curl_cffi e devolve enriquecimentos.

    Returns:
        Dict com chaves opcionais ``description``, ``skills``,
        ``publication_date``, ``location_str`` (ex.: ``'Salvador, BA, BR'``).
        Vazio se o fetch ou parse falhar - caller decide o fallback.
    """
    async with semaphore:
        try:
            session = _get_detail_session()
            response = await fetch_sync(session, link, timeout=20)
            if response is None or response.status_code != 200:
                return {}
            jp = _parse_jsonld_jobposting(response.text)
            if not jp:
                return {}
            description = strip_html(jp.get("description", ""))
            skills = extract_skills(description) if description else []
            return {
                "description": description,
                "skills": skills,
                "publication_date": _format_jsonld_date(jp),
                "location_str": _format_jsonld_location(jp),
            }
        except Exception:
            return {}


def _parse_job_item(item: dict, seen: set) -> list | None:
    """Converte um item da API SimplyHired em lista canônica.

    Args:
        item: dict do ``props.pageProps.jobs[]``.
        seen: set de URLs já vistas (mutado).

    Returns:
        Lista canônica de 8 campos, ou ``None`` se faltar URL/título ou
        já estiver em ``seen``.
    """
    encoded_url = item.get("encodedUrl", "")
    if not encoded_url:
        return None
    decoded_url = urllib.parse.unquote(encoded_url)
    link = f"https://www.simplyhired.com.br{decoded_url}"
    if link in seen:
        return None
    seen.add(link)
    tracker.discover(link, engine="simplyhired")

    job_title = item.get("title", "")
    if not job_title:
        return None

    company, job_title = _extract_company(item, job_title)

    location_str = item.get("location", "") or item.get("formattedLocation", "")
    if isinstance(location_str, str) and location_str:
        location = [p.strip() for p in location_str.split(",") if p.strip()][:2]
    else:
        location = []
        location_str = ""

    title_lower = job_title.lower()
    location_lower = location_str.lower()
    remote_attrs = item.get("remoteAttributes", [])
    if remote_attrs or "remoto" in title_lower or "remote" in title_lower or "remoto" in location_lower:
        work_type = "Remoto"
        location = []
    elif "híbrido" in title_lower or "hybrid" in title_lower or "híbrido" in location_lower:
        work_type = "Híbrido"
    else:
        work_type = "Presencial"

    hiring_regime = _extract_hiring_regime(item.get("jobTypes", []) or [])
    salary = item.get("salary", "") or item.get("salaryText", "") or item.get("formattedSalary", "")
    publication_date = _parse_publication_date(item)

    # ``skills`` e ``description`` ficam vazios aqui - são preenchidos pelo
    # fetch de detalhe (JSON-LD ``description``) em ``get_simplyhired_jobs``.
    return [link, job_title, company, location, work_type,
            hiring_regime, salary, publication_date, [], ""]


# --- Função pública ------------------------------------------------------

async def get_simplyhired_jobs(on_job=None) -> list:
    """Coleta vagas do SimplyHired Brasil via Playwright (CF bypass).

    Estratégia: para cada stack do lote ativo, percorre até ``SH_MAX_PAGES``
    páginas. Cada fetch usa Playwright headless para passar o Cloudflare;
    em seguida extraímos o JSON ``__NEXT_DATA__`` embutido no HTML hidratado.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                emitida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos.
    """
    # Import preguiçoso: Playwright só é necessário para o listing
    from utils.browser_fetch import fetch_html  # noqa: E402

    jobs = []
    seen: set[str] = set()
    semaphore = asyncio.Semaphore(SH_DETAIL_CONCURRENCY)

    async def _enrich_and_emit(parsed: list) -> None:
        """Faz fetch de detalhe (best-effort) e mescla os campos antes de emitir."""
        if SH_FETCH_DETAIL:
            extra = await _fetch_job_detail(parsed[0], semaphore)
            if extra:
                # publication_date: detalhe (ISO) tem precedência sobre relativo do listing
                if extra.get("publication_date"):
                    parsed[7] = extra["publication_date"]
                # location: usa o endereço estruturado do JSON-LD se vier
                # (location é a posição [3]; controllers junta lista com " - ")
                if extra.get("location_str"):
                    parsed[3] = extra["location_str"]
                if extra.get("skills"):
                    parsed[8] = extra["skills"]
                if extra.get("description"):
                    parsed[9] = extra["description"]
        # Pos-processamento: minera campos vazios da descricao apos detail-fetch.
        apply_description_fallbacks(parsed)
        try:
            parsed = await enrich_canonical(parsed, hint_lang="pt")
        except Exception:
            pass
        jobs.append(parsed)
        if on_job is not None:
            try:
                await on_job(parsed)
            except Exception:
                pass

    # ---- Checkpoint -----------------------------------------------------
    stacks_list = list(get_active_stacks())
    batch_key = get_active_batch_key()
    cursor = await progress.resume("simplyhired", batch_key) if batch_key else None
    resume_stack = (cursor or {}).get("stack")
    resume_page = int((cursor or {}).get("page", 1))
    resume_stack_idx = 0
    if cursor:
        try:
            resume_stack_idx = stacks_list.index(resume_stack) if resume_stack else 0
        except ValueError:
            cursor = None
            resume_page = 1
    if cursor:
        logger.info("simplyhired_resume", extra={
            "batch_key": batch_key, "stack": resume_stack,
            "stack_idx": resume_stack_idx, "page": resume_page,
        })

    for stack_idx, stack in enumerate(stacks_list):
        if stack_idx < resume_stack_idx:
            continue
        start_page = resume_page if stack_idx == resume_stack_idx else 1
        for page in range(start_page, SH_MAX_PAGES + 1):
            if batch_key:
                progress.set_cursor("simplyhired", batch_key, {
                    "stack_idx": stack_idx, "stack": stack, "page": page,
                })
            url = f"https://www.simplyhired.com.br/search?q={urllib.parse.quote(stack)}&pn={page}"
            try:
                html = await fetch_html(url, wait_until="domcontentloaded", timeout_ms=30000)
            except Exception:
                break
            if not html:
                break

            match = _RE_NEXT_DATA.search(html)
            if not match:
                break
            try:
                data = json.loads(match.group(1))
            except json.JSONDecodeError:
                break

            job_list = data.get("props", {}).get("pageProps", {}).get("jobs", [])
            if not job_list:
                break

            page_parsed: list[list] = []
            for item in job_list:
                try:
                    parsed = _parse_job_item(item, seen)
                except Exception:
                    continue
                if parsed:
                    page_parsed.append(parsed)

            if not page_parsed:
                break

            # Enriquecimento (detalhe) em paralelo, bounded pelo semáforo
            await asyncio.gather(*(_enrich_and_emit(p) for p in page_parsed))
            await asyncio.sleep(0.3)

    if batch_key:
        await progress.clear("simplyhired", batch_key)

    print(f"Foram obtidas {len(jobs)} vagas do site SimplyHired")
    return jobs


def reset_session():
    """No-op: o SimplyHired usa Playwright (sessão gerida em ``browser_fetch``)."""
    pass


async def refetch_one(url: str) -> list | None:
    """Reprocessa uma URL específica do SimplyHired (passe de reenrichment)."""
    sem = asyncio.Semaphore(1)
    detail = await _fetch_job_detail(url, sem)
    if not detail or not detail.get("description"):
        return None
    location_str = detail.get("location_str", "")
    parsed = [
        url, "", "",
        [location_str] if location_str else [],
        "Remoto" if "remoto" in (detail.get("description") or "").lower() else "Presencial",
        detail.get("hiring_regime", ""),
        "", detail.get("publication_date", ""),
        detail.get("skills", []),
        detail.get("description", ""),
    ]
    return apply_description_fallbacks(parsed)


# --- Modo debug ----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_simplyhired_jobs())[:10]:
        print(j)

"""
Engine ZipRecruiter UK - listing HTML paginado por stack.

Fluxo simples: para cada stack do lote ativo, percorre 10 páginas do
listing ``ziprecruiter.co.uk/jobs/search``. Sem fetch de detalhe - todas
as informações vêm do card do listing.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta

from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_batch_key, get_active_stacks  # noqa: E402
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.persistence.progress_tracker import progress  # noqa: E402
from src.utils.http_session import fetch_sync  # noqa: E402
from src.utils.job_enrichment import enrich_canonical  # noqa: E402

import logging
logger = logging.getLogger("scraper.engine.ziprecruiter")


# 2026-05-23 (v2.22.0): pipeline central de enriquecimento. ZipRecruiter
# nao faz fetch de detalhe atualmente, entao description vem vazia e o
# enrich vira no-op (lang=None, resp=None). Mantemos a chamada pra que
# eventuais melhorias futuras (description-fetch) sejam beneficiadas.
PARSER_VERSION = "ziprecruiter-2026.05.23"


# --- Sessão ---------------------------------------------------------------

_session = None


def get_session():
    """Retorna a sessão global, criando-a sob demanda (impersonate Chrome)."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome")
    return _session


def reset_session() -> None:
    """Descarta a sessão atual (use após bloqueios em sequência)."""
    global _session
    _session = None


# --- Helpers privados -----------------------------------------------------

def _parse_relative_date(date_text: str) -> str:
    """Converte datas relativas em inglês para ``DD/MM/YYYY``.

    Aceita: ``today``/``just``/``now``, ``yesterday``, ``Xd``/``X days ago``,
    ``Xw``/``X weeks ago``, ``Xm``/``X months ago``, ``X hours ago``.
    """
    if not date_text:
        return ""

    date_text = date_text.lower().strip()
    today = datetime.now()

    if "today" in date_text or "just" in date_text or "now" in date_text:
        return today.strftime("%d/%m/%Y")
    if "yesterday" in date_text:
        return (today - timedelta(days=1)).strftime("%d/%m/%Y")

    days_match = re.search(r"(\d+)\s*d(ays?)?(\s*ago)?", date_text)
    if days_match:
        days = int(days_match.group(1))
        return (today - timedelta(days=days)).strftime("%d/%m/%Y")

    weeks_match = re.search(r"(\d+)\s*w(eeks?)?(\s*ago)?", date_text)
    if weeks_match:
        weeks = int(weeks_match.group(1))
        return (today - timedelta(weeks=weeks)).strftime("%d/%m/%Y")

    months_match = re.search(r"(\d+)\s*m(onths?)?(\s*ago)?", date_text)
    if months_match:
        months = int(months_match.group(1))
        return (today - timedelta(days=months * 30)).strftime("%d/%m/%Y")

    hours_match = re.search(r"(\d+)\s*h(ours?)?(\s*ago)?", date_text)
    if hours_match:
        return today.strftime("%d/%m/%Y")

    return ""


def _extract_publication_date(parent) -> str:
    """Procura data de publicação no contexto do card.

    Tenta primeiro ``<time datetime>``, depois texto com padrão ``X ago``.
    """
    if not parent:
        return ""

    date_elem = parent.find("time") or parent.find(
        "span",
        class_=lambda x: x and ("date" in str(x).lower() or "posted" in str(x).lower() or "ago" in str(x).lower()),
    )
    if date_elem:
        date_text = date_elem.get("datetime", "") or date_elem.get_text(strip=True)
        if date_text:
            if len(date_text) >= 10 and "-" in date_text:
                date_raw = date_text[:10]
                parts = date_raw.split("-")
                if len(parts) == 3:
                    return f"{parts[2]}/{parts[1]}/{parts[0]}"
            return _parse_relative_date(date_text)

    # Fallback: regex no texto inteiro do card
    card_text = parent.get_text()
    ago_match = re.search(r"(\d+\s*(?:d|day|hour|week|month)s?\s*ago)", card_text, re.I)
    if ago_match:
        return _parse_relative_date(ago_match.group(1))

    return ""


# --- Função pública -------------------------------------------------------

async def get_ziprecruiter_jobs(on_job=None) -> list:
    """Coleta vagas do ZipRecruiter UK paginando 10 páginas por stack.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                emitida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos.
    """
    jobs = []
    seen_links = set()
    session = get_session()

    # ---- Checkpoint -----------------------------------------------------
    stacks_list = list(get_active_stacks())
    batch_key = get_active_batch_key()
    cursor = await progress.resume("ziprecruiter", batch_key) if batch_key else None
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
        logger.info("ziprecruiter_resume", extra={
            "batch_key": batch_key, "stack": resume_stack,
            "stack_idx": resume_stack_idx, "page": resume_page,
        })

    for stack_idx, stack in enumerate(stacks_list):
        if stack_idx < resume_stack_idx:
            continue
        encoded = urllib.parse.quote(stack)
        start_page = resume_page if stack_idx == resume_stack_idx else 1
        for page in range(start_page, 11):
            if batch_key:
                progress.set_cursor("ziprecruiter", batch_key, {
                    "stack_idx": stack_idx, "stack": stack, "page": page,
                })
            try:
                url = f"https://www.ziprecruiter.co.uk/jobs/search?q={encoded}&l=&page={page}"
                response = await fetch_sync(session, url, timeout=30)

                if response is None or response.status_code != 200:
                    break

                soup = BeautifulSoup(response.text, "html.parser")
                job_titles = soup.find_all("a", class_="jobList-title")
                if not job_titles:
                    break

                for title_elem in job_titles:
                    try:
                        link = title_elem.get("href", "")
                        if not link:
                            continue
                        if not link.startswith("http"):
                            link = f"https://www.ziprecruiter.co.uk{link}"
                        if link in seen_links:
                            continue
                        seen_links.add(link)
                        tracker.discover(link, engine="ziprecruiter")

                        job_title = title_elem.get_text(strip=True)
                        if not job_title:
                            continue

                        # Sobe pro card pai pra capturar empresa/local/salário/data
                        parent = (
                            title_elem.find_parent("article")
                            or title_elem.find_parent("div", class_=lambda x: x and "job" in str(x).lower())
                        )

                        company = ""
                        if parent:
                            company_elem = parent.find("a", class_=lambda x: x and "company" in str(x).lower())
                            if company_elem:
                                company = company_elem.get_text(strip=True)

                        location_raw = ""
                        if parent:
                            location_elem = parent.find("span", class_=lambda x: x and "location" in str(x).lower())
                            if location_elem:
                                location_raw = location_elem.get_text(strip=True)

                        # work_type baseado em palavra-chave no título/localização
                        title_lower = job_title.lower()
                        location_lower = location_raw.lower()
                        if "remote" in title_lower or "remote" in location_lower:
                            work_type = "Remoto"
                            location = []
                        elif "hybrid" in title_lower or "hybrid" in location_lower:
                            work_type = "Híbrido"
                            location = [location_raw] if location_raw else []
                        else:
                            work_type = "Presencial"
                            location = [location_raw] if location_raw else []

                        # Regime
                        hiring_regime = "Full-time"
                        if "part-time" in title_lower or "part time" in title_lower:
                            hiring_regime = "Part-time"
                        elif "contract" in title_lower:
                            hiring_regime = "Contractor"
                        elif "intern" in title_lower:
                            hiring_regime = "Internship"

                        # Salário
                        salary = ""
                        if parent:
                            salary_elem = parent.find("span", class_=lambda x: x and "salary" in str(x).lower())
                            if salary_elem:
                                salary = salary_elem.get_text(strip=True)

                        publication_date = _extract_publication_date(parent)

                        job = [link, job_title, company, location, work_type,
                               hiring_regime, salary, publication_date]
                        try:
                            job = await enrich_canonical(job, hint_lang="en")
                        except Exception:
                            pass
                        jobs.append(job)
                        if on_job is not None:
                            try:
                                await on_job(job)
                            except Exception:
                                pass

                    except Exception:
                        continue

                await asyncio.sleep(0.3)

            except Exception:
                break

    if batch_key:
        await progress.clear("ziprecruiter", batch_key)

    print(f"Foram obtidas {len(jobs)} vagas do site ZipRecruiter")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_ziprecruiter_jobs())[:10]:
        print(j)

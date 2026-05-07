"""
Engine Careerjet Brasil - listing → fetch detalhe (JSON-LD) por vaga.

Fluxo:
    1. ``get_careerjet_links()`` - paginação até 5 páginas por stack do
       lote ativo, coletando URLs únicas dos cards.
    2. ``get_careerjet_jobs()`` - resolve cada link em paralelo
       (semáforo=8), parseando o ``<script type=application/ld+json>``
       schema.org JobPosting embutido no SSR.
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import re
import sys
import urllib.parse
from datetime import date

from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_stacks  # noqa: E402
from src.utils.http_session import fetch_sync  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


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


# --- Configuração --------------------------------------------------------

_REGIME_MAP = {
    "FULL_TIME": "CLT",
    "PART_TIME": "Meio Período",
    "CONTRACTOR": "PJ",
    "INTERN": "Estágio",
    "TEMPORARY": "Temporário",
    "VOLUNTEER": "Voluntário",
}

_RE_DATE_BR = re.compile(r"(\d{2})/(\d{2})/(\d{4})")
_RE_DATE_BR_NO_YEAR = re.compile(r"(\d{2})/(\d{2})")


# --- Helpers privados ----------------------------------------------------

def _parse_relative_date(text: str) -> str:
    """Tenta normalizar data do card para ``DD/MM/YYYY``.

    Aceita ``DD/MM/YYYY``, ``DD/MM`` (assume ano corrente, voltando se
    estiver no futuro) ou retorno vazio.
    """
    if not text:
        return ""
    m = _RE_DATE_BR.search(text)
    if m:
        return m.group(0)
    m = _RE_DATE_BR_NO_YEAR.search(text)
    if m:
        today = date.today()
        dd, mm = m.group(1), m.group(2)
        year = today.year
        try:
            if int(mm) > today.month or (int(mm) == today.month and int(dd) > today.day):
                year = today.year - 1
        except ValueError:
            pass
        return f"{dd}/{mm}/{year}"
    return ""


def _parse_jsonld_jobposting(soup) -> dict | None:
    """Procura bloco JSON-LD com ``@type=JobPosting`` no HTML.

    Returns:
        Dict do JobPosting, ou ``None`` se não houver.
    """
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.text or "{}")
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(data, dict) and data.get("@type") == "JobPosting":
            return data
    return None


async def _fetch_job_detail(link: str, session, semaphore: asyncio.Semaphore) -> list | None:
    """Busca a página de detalhe e devolve a lista canônica.

    Args:
        link: URL canônica da vaga.
        session: sessão ``curl_cffi`` reutilizada entre chamadas.
        semaphore: limita o número de fetches simultâneos.

    Returns:
        Lista canônica de 8 campos, ou ``None`` se faltar JSON-LD/título.
    """
    async with semaphore:
        try:
            response = await fetch_sync(session, link, timeout=20)
            if response is None or response.status_code != 200:
                return None

            soup = BeautifulSoup(response.text, "html.parser")
            data = _parse_jsonld_jobposting(soup)
            if not data:
                return None

            job_title = (data.get("title") or "").strip()
            if not job_title:
                return None

            hiring_org = data.get("hiringOrganization") or {}
            company = hiring_org.get("name", "") if isinstance(hiring_org, dict) else ""

            # jobLocation pode ser dict ou lista
            job_loc = data.get("jobLocation") or {}
            if isinstance(job_loc, list):
                job_loc = job_loc[0] if job_loc else {}
            address = job_loc.get("address", {}) if isinstance(job_loc, dict) else {}
            locality = address.get("addressLocality", "") if isinstance(address, dict) else ""
            region = address.get("addressRegion", "") if isinstance(address, dict) else ""

            location = []
            if locality:
                location.append(str(locality))
            if region:
                location.append(str(region))

            # Modalidade
            job_loc_type = data.get("jobLocationType", "")
            title_lower = job_title.lower()
            if job_loc_type == "TELECOMMUTE" or "remoto" in title_lower or "remote" in title_lower:
                work_type = "Remoto"
            elif "híbrido" in title_lower or "hibrido" in title_lower or "hybrid" in title_lower:
                work_type = "Híbrido"
            elif location:
                work_type = "Presencial"
            else:
                work_type = "Remoto"

            # Regime
            employment_type = data.get("employmentType", "")
            if isinstance(employment_type, list):
                hiring_regime = next((_REGIME_MAP[t] for t in employment_type if t in _REGIME_MAP), "")
            else:
                hiring_regime = _REGIME_MAP.get(employment_type, "")

            # Salário
            salary = ""
            base = data.get("baseSalary") or {}
            if isinstance(base, dict):
                currency = base.get("currency", "BRL")
                value = base.get("value") or {}
                if isinstance(value, dict):
                    mn = value.get("minValue", "")
                    mx = value.get("maxValue", "")
                    if mn and mx:
                        salary = f"{currency} {mn}" if mn == mx else f"{currency} {mn} - {mx}"
                    elif mn:
                        salary = f"{currency} {mn}"
                elif value:
                    salary = f"{currency} {value}"

            # Data
            date_posted = (data.get("datePosted") or "")[:10]
            if len(date_posted) == 10 and "-" in date_posted:
                y, m, d = date_posted.split("-")
                publication_date = f"{d}/{m}/{y}"
            else:
                publication_date = _parse_relative_date(date_posted)

            description = strip_html(data.get("description", ""))
            skills = extract_skills(description) if description else []

            return apply_description_fallbacks([
                link, job_title, company, location, work_type,
                hiring_regime, salary, publication_date,
                skills, description,
            ])
        except Exception:
            return None


# --- Fase 1: coleta de links ---------------------------------------------

async def get_careerjet_links() -> list:
    """Lista links únicos paginando até 5 páginas por stack do lote ativo."""
    links = []
    seen = set()
    session = get_session()

    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        for page in range(1, 6):
            try:
                url = f"https://www.careerjet.com.br/vagas?s={encoded}&l=Brasil&p={page}"
                response = await fetch_sync(session, url, timeout=20)
                if response is None or response.status_code != 200:
                    break

                soup = BeautifulSoup(response.text, "html.parser")
                cells = soup.find_all("article", class_="job clicky")
                if not cells:
                    break

                added = 0
                for cell in cells:
                    a = cell.find("a", href=True)
                    if not a:
                        continue
                    href = a.get("href")
                    if href.startswith("/"):
                        href = "https://www.careerjet.com.br" + href
                    if href not in seen:
                        seen.add(href)
                        links.append(href)
                        added += 1
                if added == 0:
                    break
            except Exception:
                break

    return links


# --- Fase 2 / Função pública ---------------------------------------------

async def get_careerjet_jobs(on_job=None) -> list:
    """Coleta vagas do Careerjet em duas fases (links + fetch paralelo).

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                resolvida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos.
    """
    job_links = await get_careerjet_links()
    if not job_links:
        print("Foram obtidas 0 vagas do site careerjet")
        return []

    session = get_session()
    semaphore = asyncio.Semaphore(8)

    async def _fetch_and_emit(link):
        """Resolve uma vaga e emite via callback (se configurado)."""
        parsed = await _fetch_job_detail(link, session, semaphore)
        if parsed is not None and on_job is not None:
            try:
                await on_job(parsed)
            except Exception:
                pass
        return parsed

    results = await asyncio.gather(*(_fetch_and_emit(l) for l in job_links))
    jobs = [r for r in results if r is not None]

    print(f"Foram obtidas {len(jobs)} vagas do site careerjet")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_careerjet_jobs())[:10]:
        print(j)

"""
Engine ProgramaThor - listing -> fetch detalhe (JSON-LD) por vaga.

O ProgramaThor é nicho de tech BR - todo o catálogo já é tech, então não
iteramos por stacks: paginamos a listagem geral até esgotar.

Fluxo:
    1. ``get_programathor_links()`` - paginação até ``PROGRAMATHOR_MAX_PAGES``.
    2. ``get_programathor_jobs()`` - resolve cada link sequencialmente,
       parseando o ``<script type="application/ld+json">`` schema.org.
"""
from __future__ import annotations

import json
import os
import re

from bs4 import BeautifulSoup

from ..utils.job_fallbacks import apply_description_fallbacks
from ..utils.text_utils import extract_skills, strip_html
from ..utils.http_session import HttpSession, fetch


# --- Sessão (padrão httpx compartilhado) ---------------------------------

_SESSION = HttpSession()


async def get_session():
    return await _SESSION.get_client()


def reset_session() -> None:
    _SESSION.reset()


# --- Configuração ---------------------------------------------------------

_REGIME_MAP = {
    "FULL_TIME": "CLT",
    "PART_TIME": "Meio Período",
    "CONTRACTOR": "PJ",
    "INTERN": "Estágio",
    "TEMPORARY": "Temporário",
}


# --- Fase 1: coleta de links ---------------------------------------------

async def get_programathor_links() -> list:
    """Coleta links de vagas paginando o listing geral do ProgramaThor.

    Lê ``PROGRAMATHOR_MAX_PAGES`` (default 20) e ``PROGRAMATHOR_MAX_EMPTY_PAGES``
    (default 1) do ambiente para parar antecipadamente em páginas vazias.

    Returns:
        Lista de URLs únicas de vagas (já com prefixo do domínio).
    """
    links = []

    max_pages = int(os.getenv("PROGRAMATHOR_MAX_PAGES", "20"))
    max_empty_pages = int(os.getenv("PROGRAMATHOR_MAX_EMPTY_PAGES", "1"))
    page = 1
    empty_pages = 0
    client = await get_session()
    while page <= max_pages and empty_pages < max_empty_pages:
        try:
            response = await fetch(client, f"https://programathor.com.br/jobs/page/{page}")

            if response is None or response.status_code != 200:
                empty_pages += 1
                page += 1
                continue

            soup = BeautifulSoup(response.content, "html.parser")
            cells = soup.find_all("div", class_="cell-list")

            if not cells:
                empty_pages += 1
                page += 1
                continue

            empty_pages = 0
            for cell in cells:
                job_title_elem = cell.find("h3")
                if job_title_elem is None or job_title_elem.text.startswith("Vencida"):
                    continue

                link_elem = cell.find("a")
                if link_elem and link_elem.get("href"):
                    link = f"https://programathor.com.br{link_elem['href']}"
                    if link not in links:
                        links.append(link)
            page += 1
        except Exception:
            empty_pages += 1
            page += 1

    return links


# --- Fase 2 / Função pública ---------------------------------------------

async def get_programathor_jobs(on_job=None) -> list:
    """Coleta vagas do ProgramaThor (sem iterar stacks).

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                resolvida - usado pelo controller pra persistir em streaming.

    Returns:
        Lista de vagas no formato canônico de 8 campos.
    """
    jobs = []
    job_links = await get_programathor_links()
    client = await get_session()

    for link in job_links:
        try:
            response = await fetch(client, link)

            if response is None or response.status_code != 200:
                continue

            soup = BeautifulSoup(response.text, "html.parser")
            script = soup.find("script", type="application/ld+json")

            if not script or not script.string:
                continue

            # Limpa control chars que quebram o decoder
            json_text = script.string.strip()
            json_text = re.sub(r"[\x00-\x1F\x7F-\x9F]", "", json_text)
            data = json.loads(json_text)

            # Título
            job_title = data.get("title", "")
            if not job_title:
                continue

            # Empresa
            hiring_org = data.get("hiringOrganization", {})
            company = hiring_org.get("name", "") if isinstance(hiring_org, dict) else ""

            # Localização e modalidade
            job_location = data.get("jobLocation", {})
            address = job_location.get("address", {}) if isinstance(job_location, dict) else {}

            locality = address.get("addressLocality", "") if isinstance(address, dict) else ""
            street = address.get("streetAddress", "") if isinstance(address, dict) else ""

            # work_type baseado no jobLocationType + título + locality
            job_location_type = data.get("jobLocationType", "")
            title_lower = job_title.lower()
            locality_lower = locality.lower() if locality else ""

            if job_location_type == "TELECOMMUTE" or "remoto" in title_lower or "remoto" in locality_lower or "remote" in title_lower:
                work_type = "Remoto"
                location = []
            elif "híbrido" in title_lower or "hibrido" in title_lower or "híbrido" in locality_lower:
                work_type = "Híbrido"
                if street:
                    parts = street.split(",")
                    location = [parts[0].strip()] if parts else []
                else:
                    location = []
            else:
                work_type = "Presencial"
                if street:
                    parts = [p.strip() for p in street.split(",") if p.strip()]
                    location = parts[:2] if len(parts) >= 2 else parts
                else:
                    location = []

            # Regime de contratação
            employment_type = data.get("employmentType", "")
            if isinstance(employment_type, list):
                employment_type = employment_type[0] if employment_type else ""
            hiring_regime = _REGIME_MAP.get(employment_type, "CLT")

            # Salário
            salary = ""
            base_salary = data.get("baseSalary", {})
            if isinstance(base_salary, dict):
                currency = base_salary.get("currency", "BRL")
                value = base_salary.get("value", {})
                if isinstance(value, dict):
                    min_val = value.get("minValue", value.get("value", ""))
                    max_val = value.get("maxValue", min_val)
                    if min_val and max_val and min_val != max_val:
                        salary = f"{currency} {min_val} - {max_val}"
                    elif min_val:
                        salary = f"{currency} {min_val}"
                elif value:
                    salary = f"{currency} {value}"

            # Data ISO -> DD/MM/YYYY
            date_posted = data.get("datePosted", "")
            date_raw = date_posted[:10] if date_posted else ""
            if date_raw and len(date_raw) == 10 and "-" in date_raw:
                parts = date_raw.split("-")
                publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
            else:
                publication_date = date_raw

            description = strip_html(data.get("description", ""))
            skills = extract_skills(description) if description else []

            job = apply_description_fallbacks([
                link, job_title, company, location, work_type, hiring_regime, salary, publication_date,
                skills, description,
            ])
            jobs.append(job)
            if on_job is not None:
                try:
                    await on_job(job)
                except Exception:
                    pass

        except Exception:
            continue

    print(f"Foram obtidas {len(jobs)} vagas do site ProgramaThor")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    import asyncio

    for j in asyncio.run(get_programathor_jobs())[:10]:
        print(j)

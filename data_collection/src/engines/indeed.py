"""
Engine Indeed Brasil - listing → fetch detalhe (JSON-LD) por vaga.

Fluxo:
    1. ``get_indeed_links()`` - paginação (2 páginas × 50 vagas) por stack
       do lote ativo, acumulando ``data-jk`` únicos.
    2. ``get_indeed_jobs()`` - resolve cada link em paralelo (semáforo=5)
       parseando o JSON-LD ``JobPosting`` (com fallback HTML).
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import sys
import urllib.parse

from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_stacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


# --- Sessão ---------------------------------------------------------------

_session = None


def get_session():
    """Retorna a sessão global, criando-a sob demanda.

    IMPORTANTE: não adicionamos headers personalizados.
    ``impersonate='chrome120'`` já configura todos os headers corretos -
    headers extras conflitam e causam 403.
    """
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome120")
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
    "TEMPORARY": "Temporário",
    "INTERN": "Estágio",
}


# --- Helpers privados ----------------------------------------------------

def _parse_jsonld_jobposting(soup) -> dict | None:
    """Extrai dados estruturados do bloco ``<script type=application/ld+json>``.

    Returns:
        Dict com chaves ``title``, ``company``, ``location``, ``work_type``,
        ``hiring_regime``, ``salary``, ``publication_date`` - ou ``None`` se
        não houver JSON-LD válido.
    """
    script = soup.find("script", type="application/ld+json")
    if not script:
        return None

    try:
        data = json.loads(script.text)
    except Exception:
        return None

    job_title = data.get("title", "")
    if not job_title:
        return None

    hiring_org = data.get("hiringOrganization", {})
    company = hiring_org.get("name", "") if isinstance(hiring_org, dict) else ""

    job_location = data.get("jobLocation", {})
    address = job_location.get("address", {}) if isinstance(job_location, dict) else {}
    locality = address.get("addressLocality", "")
    region = address.get("addressRegion", "")

    if locality.lower() == "remoto":
        location = []
    elif region:
        location = [locality, region]
    else:
        location = [locality] if locality else []

    job_location_type = data.get("jobLocationType", "")
    loc_lower = locality.lower() if locality else ""
    data_str = str(data).lower()

    if job_location_type == "TELECOMMUTE" or "remoto" in loc_lower or "remote" in loc_lower:
        work_type = "Remoto"
    elif "híbrido" in loc_lower or "hibrido" in loc_lower or "hybrid" in data_str:
        work_type = "Híbrido"
    else:
        work_type = "Presencial"

    employment_type = data.get("employmentType", "")
    if isinstance(employment_type, list):
        employment_type = employment_type[0] if employment_type else ""
    hiring_regime = _REGIME_MAP.get(employment_type, "") if employment_type else ""

    # Salário
    salary = ""
    base_salary = data.get("baseSalary")
    if base_salary and isinstance(base_salary, dict):
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

    return {
        "title": job_title,
        "company": company,
        "location": location,
        "work_type": work_type,
        "hiring_regime": hiring_regime,
        "salary": salary,
        "publication_date": publication_date,
        "skills": skills,
        "description": description,
    }


def _parse_html_fallback(soup) -> dict | None:
    """Fallback de parsing direto do HTML quando o JSON-LD está ausente.

    Captura título (meta), empresa (data-attr) e localização (page title).
    """
    title_meta = soup.find("meta", {"id": "indeed-share-message"})
    job_title = title_meta.get("content", "") if title_meta else ""
    if not job_title:
        page_title = soup.find("title")
        if page_title:
            job_title = page_title.text.split(" - ")[0].strip()
    if not job_title:
        return None

    # Empresa
    company_div = soup.find("div", attrs={"data-company-name": True})
    if company_div:
        company = company_div.get("data-company-name", "")
        if company == "true" or not company:
            company = company_div.get_text(strip=True)
    else:
        company = ""

    # Localização (vinda do <title> da página)
    location: list = []
    page_title = soup.find("title")
    if page_title:
        parts = page_title.text.split(" - ")
        if len(parts) >= 2:
            location_part = parts[-2].strip()
            if location_part.lower() != "indeed.com":
                if "," in location_part:
                    city, state = location_part.rsplit(",", 1)
                    location = [city.strip(), state.strip()]
                elif location_part.lower() != "remoto":
                    location = [location_part]

    page_text = soup.get_text().lower()
    title_text = job_title.lower() if job_title else ""

    if "remoto" in title_text or "remote" in title_text or "remoto" in str(location).lower():
        work_type = "Remoto"
        location = []
    elif "híbrido" in page_text or "hibrido" in page_text or "hybrid" in page_text:
        work_type = "Híbrido"
    else:
        work_type = "Presencial"

    # Fallback: extrai descrição do bloco principal e roda extract_skills
    description = ""
    desc_block = soup.find("div", id="jobDescriptionText")
    if desc_block:
        description = strip_html(str(desc_block))
    skills = extract_skills(description) if description else []

    return {
        "title": job_title,
        "company": company,
        "location": location,
        "work_type": work_type,
        "hiring_regime": "",
        "salary": "",
        "publication_date": "",
        "skills": skills,
        "description": description,
    }


async def _fetch_job_detail(link: str, semaphore: asyncio.Semaphore) -> list | None:
    """Busca a página de detalhe e devolve a lista canônica.

    Tenta JSON-LD primeiro; se falhar, faz fallback de parsing direto no HTML.
    """
    async with semaphore:
        await asyncio.sleep(random.uniform(0.3, 0.8))
        session = get_session()

        try:
            response = await asyncio.to_thread(session.get, link, timeout=30)
            if response.status_code != 200:
                return None

            soup = BeautifulSoup(response.text, "html.parser")
            data = _parse_jsonld_jobposting(soup) or _parse_html_fallback(soup)
            if not data:
                return None

            return [
                link,
                data["title"],
                data["company"],
                data["location"],
                data["work_type"],
                data["hiring_regime"],
                data["salary"],
                data["publication_date"],
                data.get("skills", []),
                data.get("description", ""),
            ]

        except Exception:
            return None


# --- Fase 1: coleta de links ---------------------------------------------

async def get_indeed_links() -> list:
    """Extrai links únicos de vaga (2 páginas × 50 vagas por stack ativa)."""
    links = []
    session = get_session()
    seen_jks = set()

    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        for page in range(2):
            try:
                if page > 0 or links:
                    await asyncio.sleep(random.uniform(0.5, 1.5))

                url = f"https://br.indeed.com/empregos?q={encoded}&limit=50&start={page*50}&sort=date"
                response = await asyncio.to_thread(session.get, url, timeout=30)

                if response.status_code != 200:
                    break

                soup = BeautifulSoup(response.text, "html.parser")
                cells = soup.find_all("div", class_="job_seen_beacon")
                if not cells:
                    break

                for cell in cells:
                    link_elem = cell.find("a", attrs={"data-jk": True})
                    if link_elem:
                        jk = link_elem.get("data-jk")
                        if jk and jk not in seen_jks:
                            seen_jks.add(jk)
                            links.append(f"https://br.indeed.com/viewjob?jk={jk}")

            except Exception:
                break

    return links


# --- Fase 2 / Função pública ---------------------------------------------

async def get_indeed_jobs(on_job=None) -> list:
    """Coleta vagas do Indeed em duas fases (lista links + fetch detalhes).

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                resolvida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos.
    """
    jobs = []
    job_links = await get_indeed_links()
    semaphore = asyncio.Semaphore(5)

    async def _fetch_and_emit(link):
        """Resolve uma vaga e emite via callback (se configurado)."""
        parsed = await _fetch_job_detail(link, semaphore)
        if parsed is not None and on_job is not None:
            try:
                await on_job(parsed)
            except Exception:
                pass
        return parsed

    job_details = await asyncio.gather(*[_fetch_and_emit(l) for l in job_links])
    for job in job_details:
        if job is not None:
            jobs.append(job)

    print(f"Foram obtidas {len(jobs)} vagas do site Indeed")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_indeed_jobs())[:10]:
        print(j)

"""
Engine BNE - listing → fetch detalhe (JSON-LD) por vaga, via cloudscraper.

A BNE usa proteção anti-bot que ``httpx`` não passa. Usamos ``cloudscraper``
que resolve o desafio JavaScript da Cloudflare-like.

Particularidade: a BNE **não suporta busca por texto livre** - só por área
hardcoded. Por isso esta engine **não participa do batching** de stacks:
sempre cobre as mesmas 5 áreas tech.

Fluxo:
    1. ``get_bne_job_ids()`` - paginação paralela das 5 áreas, coletando IDs.
    2. ``get_bne_jobs()`` - resolve cada ID em paralelo (semáforo=10),
       parseando o ``<script type=application/ld+json>`` JobPosting.
"""
from __future__ import annotations

import asyncio
import json
import random

import cloudscraper
from bs4 import BeautifulSoup

from ..utils.job_fallbacks import apply_description_fallbacks
from ..utils.text_utils import extract_skills, strip_html


# --- Sessão ---------------------------------------------------------------

_scraper_session = None


def _create_scraper():
    """Cria uma sessão do ``cloudscraper`` simulando Chrome no Windows."""
    return cloudscraper.create_scraper(
        browser={
            "browser": "chrome",
            "platform": "windows",
            "desktop": True,
        }
    )


def get_scraper():
    """Retorna a sessão global, criando-a sob demanda (Chrome/Windows)."""
    global _scraper_session
    if _scraper_session is None:
        _scraper_session = _create_scraper()
    return _scraper_session


def reset_session() -> None:
    """Descarta a sessão atual (use após bloqueios em sequência)."""
    global _scraper_session
    _scraper_session = None


# --- Configuração --------------------------------------------------------

# Áreas tech da BNE (URL-encoded). Não há busca por texto livre - usamos
# essa lista fixa, e por isso a engine ignora o batching de stacks.
BNE_AREAS = [
    "Inform%C3%A1tica",
    "Tecnologia",
    "Desenvolvimento",
    "Programador",
    "Software",
]

def _extract_full_description(soup) -> str:
    """Extrai a descricao completa do DOM da pagina de detalhe da BNE.

    Estrategia (em ordem de preferencia):
      1. ``.requisitos__vaga`` + ``.atribuicoes__vaga`` quando presentes -
         vagas detalhadas dividem o texto nestes dois blocos e ele e mais
         completo que o resumo abaixo.
      2. ``.descricao__vaga`` - vagas simples colocam tudo num bloco unico.

    Retorna string vazia se nenhum dos blocos existir - o caller deve cair
    no JSON-LD truncado (fallback).
    """
    parts = []
    req = soup.select_one('.requisitos__vaga')
    if req:
        parts.append(req.get_text('\n', strip=True))
    atr = soup.select_one('.atribuicoes__vaga')
    if atr:
        parts.append(atr.get_text('\n', strip=True))
    if parts:
        return '\n\n'.join(p for p in parts if p)

    desc_node = soup.select_one('.descricao__vaga')
    if desc_node:
        return desc_node.get_text('\n', strip=True)
    return ''


_REGIME_MAP = {
    "CONTRACTOR": "Autônomo",
    "PART_TIME": "Meio Período",
    "INTERN": "Estágio",
    "TEMPORARY": "Temporário",
    "FULL_TIME": "Efetivo",
}


# --- Helpers privados ----------------------------------------------------

async def _scan_area(area: str, scraper, max_pages: int = 15) -> set:
    """Pagina uma área até encontrar 2 páginas vazias consecutivas ou ``max_pages``.

    Args:
        area: slug URL-encoded da área (ex.: ``"Inform%C3%A1tica"``).
        scraper: instância de ``cloudscraper``.
        max_pages: limite duro de páginas a percorrer.

    Returns:
        Set de ``job_id`` únicos coletados (sem o prefixo ``"job-"``).
    """
    found: set[str] = set()
    page = 1
    consecutive_empty = 0

    while page <= max_pages and consecutive_empty < 2:
        try:
            if page > 1:
                await asyncio.sleep(random.uniform(0.3, 0.8))

            url = f"https://www.bne.com.br/vagas-de-emprego-na-area-de-{area}?Area={area}&Sort=0&Page={page}"
            response = await asyncio.to_thread(scraper.get, url, timeout=20)

            if response.status_code != 200:
                consecutive_empty += 1
                page += 1
                continue

            soup = BeautifulSoup(response.text, "html.parser")
            jobs = soup.find_all("section", class_="job__card__container")

            if not jobs:
                consecutive_empty += 1
                page += 1
                continue

            new_count = 0
            for job in jobs:
                job_id = job.get("id", "").replace("job-", "")
                if job_id and job_id not in found:
                    found.add(job_id)
                    new_count += 1

            consecutive_empty = 0 if new_count else (consecutive_empty + 1)
            page += 1

        except Exception:
            consecutive_empty += 1
            page += 1

    return found


async def _fetch_job_detail(job_id, semaphore: asyncio.Semaphore) -> list | None:
    """Busca a página de detalhe e devolve a lista canônica.

    Args:
        job_id: ID numérico da vaga (``"123456"``, sem prefixo).
        semaphore: limita o número de fetches simultâneos.

    Returns:
        Lista canônica de 8 campos, ou ``None`` se faltar JSON-LD/título.
    """
    async with semaphore:
        await asyncio.sleep(random.uniform(0.5, 1.5))

        scraper = get_scraper()
        link = f"https://www.bne.com.br/vagas-de-emprego/{job_id}"

        try:
            response = await asyncio.to_thread(scraper.get, link, timeout=30)
            if response.status_code != 200:
                return None

            soup = BeautifulSoup(response.text, "html.parser")
            scripts = soup.find_all("script", type="application/ld+json")
            if not scripts:
                return None

            # O primeiro script contém os dados da vaga
            data = json.loads(scripts[0].string)
            if data.get("@type") != "JobPosting":
                return None

            job_title = data.get("title", "").split(" Cargo/Função:")[0].strip()

            hiring_org = data.get("hiringOrganization", {})
            company = hiring_org.get("name", "") if isinstance(hiring_org, dict) else ""

            job_location = data.get("jobLocation", {})
            address = job_location.get("address", {}) if isinstance(job_location, dict) else {}
            location = [
                address.get("addressLocality", ""),
                address.get("addressRegion", ""),
            ]

            # Modalidade
            job_location_type = data.get("jobLocationType", "")
            loc_str = str(location).lower() + " " + address.get("streetAddress", "").lower()
            if job_location_type == "TELECOMMUTE" or "remoto" in loc_str or "home office" in loc_str:
                work_type = "Remoto"
            elif "híbrido" in loc_str or "hibrido" in loc_str:
                work_type = "Híbrido"
            else:
                work_type = "Presencial"

            # Regime
            employment_type = data.get("employmentType", "")
            if isinstance(employment_type, list):
                emp_type = employment_type[0] if employment_type else ""
            else:
                emp_type = employment_type
            hiring_regime = _REGIME_MAP.get(emp_type, "Efetivo")

            # Salário
            base_salary = data.get("baseSalary", {})
            salary = ""
            if isinstance(base_salary, dict):
                value = base_salary.get("value", {})
                if isinstance(value, dict):
                    min_val = value.get("minValue", "")
                    max_val = value.get("maxValue", "")
                    if min_val and max_val:
                        salary = f"R$ {min_val:.0f} - R$ {max_val:.0f}"
                    elif min_val:
                        salary = f"R$ {min_val:.0f}"
                else:
                    salary = str(value) if value else ""

            # Data ISO -> DD/MM/YYYY
            date_raw = data.get("datePosted", "")[:10]
            if date_raw and len(date_raw) == 10 and "-" in date_raw:
                parts = date_raw.split("-")
                publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
            else:
                publication_date = date_raw

            # JSON-LD da BNE entrega description truncada (~189-314 chars,
            # cortando frases pela metade). O texto completo vive no DOM em:
            #   Layout A: .requisitos__vaga + .atribuicoes__vaga (separados)
            #   Layout B: .descricao__vaga                     (bloco unico)
            # Cai no JSON-LD apenas se o DOM nao tiver nenhuma das classes.
            description = _extract_full_description(soup)
            if not description:
                description = strip_html(data.get("description", ""))
            skills = extract_skills(description) if description else []

            return apply_description_fallbacks([
                link, job_title, company, location, work_type,
                hiring_regime, salary, publication_date,
                skills, description,
            ])

        except Exception:
            return None


# --- Fase 1: coleta de IDs -----------------------------------------------

async def get_bne_job_ids() -> list:
    """Coleta IDs únicos de vagas paralelizando as 5 áreas tech.

    Cada área roda em sua própria thread via ``asyncio.to_thread``, então o
    fetch das 5 áreas é efetivamente paralelo.

    Returns:
        Lista de IDs únicos (strings) prontos para ``_fetch_job_detail``.
    """
    scraper = get_scraper()
    results = await asyncio.gather(
        *(_scan_area(a, scraper) for a in BNE_AREAS),
        return_exceptions=True,
    )
    job_ids: set[str] = set()
    for r in results:
        if isinstance(r, set):
            job_ids.update(r)
    return list(job_ids)


# --- Fase 2 / Função pública ---------------------------------------------

async def get_bne_jobs(on_job=None) -> list:
    """Coleta vagas da BNE em duas fases (lista IDs por área + fetch detalhes).

    A BNE não filtra por stack - usa 5 áreas hardcoded de TI. Logo, esta
    engine não participa do batching: ela sempre cobre as mesmas 5 áreas.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                resolvida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos.
    """
    jobs = []
    job_ids = await get_bne_job_ids()
    semaphore = asyncio.Semaphore(10)

    async def _fetch_and_emit(job_id):
        """Resolve uma vaga e emite via callback (se configurado)."""
        parsed = await _fetch_job_detail(job_id, semaphore)
        if parsed is not None and on_job is not None:
            try:
                await on_job(parsed)
            except Exception:
                pass
        return parsed

    job_details = await asyncio.gather(*[_fetch_and_emit(jid) for jid in job_ids])
    jobs = [j for j in job_details if j is not None]

    print(f"Foram obtidas {len(jobs)} vagas do site BNE")
    return jobs


# --- Modo debug ----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_bne_jobs()):
        print(j)

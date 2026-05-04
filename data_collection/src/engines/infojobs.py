"""
Engine InfoJobs Brasil - listing → fetch detalhe (JSON-LD) por vaga.

Fluxo:
    1. ``get_infojobs_links()`` paginada por stack do lote ativo.
    2. ``get_infojobs_jobs()`` resolve cada link em paralelo (semáforo=8),
       parseando o ``<script type="application/ld+json">`` que a InfoJobs
       publica em todas as páginas de vaga (formato schema.org JobPosting).
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.parse

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_stacks  # noqa: E402


# --- Configuração --------------------------------------------------------

_TIMEOUT = httpx.Timeout(30.0)
_FETCH_CONCURRENCY = 8


# --- Helpers privados ----------------------------------------------------

def _parse_job_detail(html: str, link: str) -> list | None:
    """Parseia o JSON-LD da página de detalhe e devolve a lista canônica.

    Args:
        html: HTML completo da página de vaga InfoJobs.
        link: URL canônica da vaga (já resolvida pelo cliente HTTP).

    Returns:
        Lista canônica de 8 campos, ou ``None`` se não houver JSON-LD válido.
    """
    soup = BeautifulSoup(html, "html.parser")
    script = soup.find("script", type="application/ld+json")
    if not script:
        return None

    try:
        data = json.loads(script.text)
    except (json.JSONDecodeError, ValueError):
        return None

    title = data.get("title", "")
    company = (data.get("hiringOrganization") or {}).get("name", "")

    address = ((data.get("jobLocation") or {}).get("address") or {})
    locality = address.get("addressLocality", "") if isinstance(address, dict) else ""
    region = address.get("addressRegion", "") if isinstance(address, dict) else ""
    location = [p for p in (locality, region) if p]

    # Modalidade (campo livre na pagina) - best-effort
    work_type = ""
    work_el = soup.find("div", class_="text-medium small font-weight-bold mb-4")
    if work_el:
        work_type = work_el.get_text(strip=True)

    # Regime - extraido do bloco "Tipo de contrato e Jornada" se houver
    hiring_regime = ""
    paragraphs = soup.find_all("p")
    if len(paragraphs) >= 3:
        text = paragraphs[2].get_text(strip=True)
        if "Tipo de contrato e Jornada:" in text:
            hiring_regime = (
                text.split("Tipo de contrato e Jornada:")[1]
                .replace("- Período Integral", "")
                .strip()
            )

    # Salario do JSON-LD
    salary = ""
    base = data.get("baseSalary") or {}
    if base:
        currency = base.get("currency", "BRL")
        value = base.get("value") or {}
        if isinstance(value, dict):
            mn = value.get("minValue", "")
            mx = value.get("maxValue", mn)
            if mn:
                salary = f"{currency} {mn}" if mn == mx else f"{currency} {mn} - {mx}"
        elif value:
            salary = f"{currency} {value}"

    # Data ISO → DD/MM/YYYY
    date_raw = (data.get("datePosted") or "")[:10]
    if len(date_raw) == 10 and "-" in date_raw:
        y, m, d = date_raw.split("-")
        publication_date = f"{d}/{m}/{y}"
    else:
        publication_date = date_raw

    return [link, title, company, location, work_type, hiring_regime, salary, publication_date]


# --- Fase 1: coleta de links ---------------------------------------------

async def get_infojobs_links() -> list[str]:
    """Coleta links únicos de vaga (1ª página por stack do lote ativo)."""
    links: list[str] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        for stack in get_active_stacks():
            encoded = urllib.parse.quote(stack)
            url = (
                f"https://www.infojobs.com.br/empregos.aspx"
                f"?palabra={encoded}&page=1&limit=20"
            )
            try:
                response = await client.get(url)
            except Exception:
                continue
            if response.status_code != 200:
                continue

            soup = BeautifulSoup(response.text, "html.parser")
            for cell in soup.find_all("div", class_="js_vacancyLoad"):
                href = cell.get("data-href")
                if not href:
                    continue
                full = f"https://www.infojobs.com.br{href}"
                if full not in seen:
                    seen.add(full)
                    links.append(full)

    return links


# --- Fase 2 / Função pública ---------------------------------------------

async def get_infojobs_jobs(on_job=None) -> list:
    """Coleta links e resolve cada vaga em paralelo (semáforo=8).

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                resolvida - usado pelo controller pra persistir em streaming.

    Returns:
        Lista de vagas no formato canônico de 8 campos.
    """
    links = await get_infojobs_links()
    if not links:
        print("Foram obtidas 0 vagas do site InfoJobs")
        return []

    semaphore = asyncio.Semaphore(_FETCH_CONCURRENCY)

    async def _fetch(link: str) -> list | None:
        """Fetch + parse de uma URL, respeitando o semáforo."""
        async with semaphore:
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
                    response = await client.get(link)
            except Exception:
                return None
            if response.status_code != 200:
                return None
            parsed = _parse_job_detail(response.text, link)
            if parsed is not None and on_job is not None:
                try:
                    await on_job(parsed)
                except Exception:
                    pass
            return parsed

    results = await asyncio.gather(*(_fetch(l) for l in links))
    jobs = [r for r in results if r is not None]
    print(f"Foram obtidas {len(jobs)} vagas do site InfoJobs")
    return jobs


# --- Modo debug ----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_infojobs_jobs())[:10]:
        print(j)

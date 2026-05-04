"""
Engine Careerjet — usa curl_cffi (impersonate Chrome) porque o site fica atrás
do Cloudflare Turnstile e bloqueia clientes httpx genéricos.
"""
import asyncio
import json
import os
import random
import re
import sys
from datetime import date

from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_stacks  # noqa: E402


_session = None


def get_session():
    """Sessão global com fingerprint Chrome (curl_cffi)."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome")
    return _session


_RE_DATE_BR = re.compile(r"(\d{2})/(\d{2})/(\d{4})")
_RE_DATE_BR_NO_YEAR = re.compile(r"(\d{2})/(\d{2})")


def _parse_pub_date(text: str) -> str:
    """Tenta normalizar data do card para DD/MM/YYYY. Aceita 'DD/MM/YYYY', 'DD/MM' ou ISO."""
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


async def get_careerjet_links() -> list:
    """Lista links únicos paginando até 5 páginas por stack do lote ativo."""
    import urllib.parse

    links = []
    seen = set()
    session = get_session()

    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        for page in range(1, 6):
            try:
                if page > 1:
                    await asyncio.sleep(random.uniform(0.4, 1.0))
                url = f"https://www.careerjet.com.br/vagas?s={encoded}&l=Brasil&p={page}"
                response = await asyncio.to_thread(session.get, url, timeout=20)
                if response.status_code != 200:
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


def _parse_jsonld(soup) -> dict | None:
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.text or "{}")
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(data, dict) and data.get("@type") == "JobPosting":
            return data
    return None


async def _fetch_job(link: str, session, semaphore: asyncio.Semaphore) -> list | None:
    async with semaphore:
        try:
            await asyncio.sleep(random.uniform(0.2, 0.6))
            response = await asyncio.to_thread(session.get, link, timeout=20)
            if response.status_code != 200:
                return None

            soup = BeautifulSoup(response.text, "html.parser")
            data = _parse_jsonld(soup)
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
            regime_map = {
                "FULL_TIME": "CLT",
                "PART_TIME": "Meio Período",
                "CONTRACTOR": "PJ",
                "INTERN": "Estágio",
                "TEMPORARY": "Temporário",
                "VOLUNTEER": "Voluntário",
            }
            if isinstance(employment_type, list):
                hiring_regime = next((regime_map[t] for t in employment_type if t in regime_map), "")
            else:
                hiring_regime = regime_map.get(employment_type, "")

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
                publication_date = _parse_pub_date(date_posted)

            return [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
        except Exception:
            return None


async def get_careerjet_jobs(on_job=None) -> list:
    """
    Coleta vagas do Careerjet em duas fases:
        1. Lista links (paginação por stack do lote ativo).
        2. Para cada link, faz fetch paralelo (semáforo=8) e parseia JSON-LD.

    Args:
        on_job: callback ``async fn(parsed)`` invocado a cada vaga parseada.
    """
    job_links = await get_careerjet_links()
    if not job_links:
        print("Foram obtidas 0 vagas do site careerjet")
        return []

    session = get_session()
    semaphore = asyncio.Semaphore(8)

    async def _fetch_and_emit(link):
        parsed = await _fetch_job(link, session, semaphore)
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


def reset_session():
    global _session
    _session = None


if __name__ == "__main__":
    result = asyncio.run(get_careerjet_jobs())
    for j in result[:10]:
        print(j)

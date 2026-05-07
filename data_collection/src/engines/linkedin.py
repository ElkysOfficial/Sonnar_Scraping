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
import os
import random
import re
import sys
import urllib.parse

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from variavel import get_active_stacks  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from src.utils.http_session import HttpSession  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


# --- Sessao (httpx compartilhado) ----------------------------------------

_SESSION = HttpSession()


async def get_session():
    return await _SESSION.get_client()


def reset_session() -> None:
    _SESSION.reset()


# --- Configuracao ---------------------------------------------------------

# Concorrencia do detail-fetch. LinkedIn rate-limita agressivamente quando
# o numero de requests guest sobe rapido - 429 medido empiricamente apos ~50
# fetches em paralelo=8. Mantemos 3 + sleep aleatorio (0.8-1.5s) para um
# throughput sustentavel de ~2 req/s.
_DETAIL_CONCURRENCY = int(os.getenv("LINKEDIN_DETAIL_CONCURRENCY", "3"))

# Apos N respostas 429 consecutivas, abortamos o enriquecimento pra nao
# desperdicar tempo - as vagas restantes ficam com seed do listing apenas.
_RATELIMIT_THRESHOLD = 5

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


async def get_linkedin_links() -> list[dict]:
    """Coleta seeds (link + dados parciais) de todas as stacks ativas."""
    seeds: list[dict] = []
    seen: set[str] = set()
    client = await get_session()

    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        for start in range(0, 100, 10):
            url = (
                "https://br.linkedin.com/jobs/api/seeMoreJobPostings/search"
                f"?keywords={encoded}&location=Brasil&geoId=106057199&start={start}"
            )
            try:
                response = await client.get(url)
            except Exception:
                continue
            if response.status_code != 200:
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
                new_in_page += 1

            if new_in_page == 0:
                break  # pagina so com duplicatas - resultset esgotou

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


def _format_jsonld_location(jp: dict) -> list:
    """Compoe ``[cidade, UF]`` a partir do ``jobLocation`` do JSON-LD.

    LinkedIn em vagas BR: ``addressCountry='BR'`` + ``addressLocality='Sao Paulo'``;
    ``addressRegion`` frequentemente vem null. Devolvemos ``[locality]`` ou
    ``[locality, region]``.
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
    if locality and region:
        return [locality, region]
    if locality:
        return [locality]
    return []


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


async def _fetch_detail(seed: dict, sem: asyncio.Semaphore, client,
                        state: dict) -> dict:
    """Busca a pagina canonica e devolve dict de enriquecimento.

    Best-effort: campos ausentes voltam vazios; erros sao silenciosos.
    Mutate ``state`` para counting global de 429s; quando o threshold
    eh atingido o fetch passa a ser no-op (apenas seed sera persistido).
    """
    out = {
        "description": "",
        "skills": [],
        "salary": "",
        "publication_date": "",
        "location": [],
        "hiring_regime": "",
    }
    if state.get("aborted"):
        return out
    async with sem:
        await asyncio.sleep(random.uniform(0.8, 1.5))
        try:
            r = await client.get(seed["link"], follow_redirects=True)
        except Exception:
            return out

        if r.status_code == 429:
            state["consec_429"] = state.get("consec_429", 0) + 1
            if state["consec_429"] >= _RATELIMIT_THRESHOLD:
                state["aborted"] = True
            return out
        # reset contador apos sucesso
        state["consec_429"] = 0

        if r.status_code != 200 or len(r.text) < 1000:
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

    return out


def _merge_detail_over_seed(seed: dict, detail: dict) -> list:
    """Monta a lista canonica de 10 campos preferindo detail sobre seed."""
    return [
        seed["link"],
        seed["title"],
        seed["company"],
        detail.get("location") or seed["location"],
        seed["work_type"],
        detail.get("hiring_regime") or seed["hiring_regime"],
        detail.get("salary") or "",
        detail.get("publication_date") or seed["publication_date"],
        detail.get("skills") or [],
        detail.get("description") or "",
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
    state: dict = {"consec_429": 0, "aborted": False}

    async def _resolve(seed: dict) -> None:
        detail = await _fetch_detail(seed, sem, client, state)
        parsed = apply_description_fallbacks(_merge_detail_over_seed(seed, detail))
        jobs.append(parsed)
        if on_job is not None:
            try:
                await on_job(parsed)
            except Exception:
                pass

    await asyncio.gather(*(_resolve(s) for s in seeds))

    enriched = sum(1 for j in jobs if len(j[9]) > 200)
    suffix = " (rate-limit detectado, fallback pro seed)" if state["aborted"] else ""
    print(
        f"Foram obtidas {len(jobs)} vagas do site LinkedIn "
        f"({enriched} com descricao completa){suffix}"
    )
    return jobs


# --- Modo debug ------------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_linkedin_jobs())[:10]:
        print(j)

"""
Engine RemoteOK - API JSON pública (uma chamada cobre tudo).

A API devolve **todas** as vagas em uma única resposta. Filtramos client-side
contra ``variavel.stacks`` + um conjunto tech amplo de fallback. Por isso esta
engine **não usa batching** - uma chamada já cobre o catálogo inteiro.
"""
from __future__ import annotations

import asyncio
import os
import sys

from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import stacks  # noqa: E402
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.utils.http_session import fetch_sync  # noqa: E402
from src.utils.job_enrichment import enrich_canonical  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


# v3.10.1 (2026-05-30): para de hardcodear location=[] e hiring_regime
# fixo. A API do RemoteOK expoe `location` em ~93% das vagas (cobre
# country_code/state_code apos normalize) e expoe regime via tags
# ("full time" / "part time" / "contract" / "internship").
PARSER_VERSION = "remoteok-2026.05.30"


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


# --- Configuração ---------------------------------------------------------

# Tech keywords genéricos - fallback para quando o lote ativo é muito restrito
# (ex.: stack ``{Python}`` sozinha filtraria várias vagas tech relevantes que
# usam tags como ``backend``, ``engineer``, ``devops``).
_TECH_FALLBACK = {
    "dev", "developer", "engineer", "engineering", "software", "backend",
    "frontend", "fullstack", "full-stack", "mobile", "web", "devops",
    "sre", "data", "ml", "ai", "machine learning", "cloud", "security",
    "qa", "testing", "design", "ux", "ui", "product", "sysadmin",
}


# --- Helpers privados -----------------------------------------------------

def _is_relevant(haystack_terms: set, stacks_lower: set) -> bool:
    """``True`` se a vaga bate com alguma stack ativa OU com o tech fallback.

    Args:
        haystack_terms: set de tokens normalizados (tags + título + descrição).
        stacks_lower: set de stacks ativas em lowercase.
    """
    for stack in stacks_lower:
        if any(word in haystack_terms for word in stack.split()):
            return True
    return bool(haystack_terms & _TECH_FALLBACK)


def _format_salary(salary_min, salary_max) -> str:
    """Formata salary_min/max do RemoteOK como ``USD X`` ou ``USD X - Y``."""
    if salary_min and salary_max:
        if salary_min == salary_max:
            return f"USD {salary_min}"
        return f"USD {salary_min} - {salary_max}"
    if salary_min:
        return f"USD {salary_min}"
    return ""


def _parse_iso_date(date_str: str) -> str:
    """``'2026-04-29T00:00:00'`` -> ``'29/04/2026'``."""
    if not date_str:
        return ""
    date_raw = date_str[:10]
    if len(date_raw) == 10 and "-" in date_raw:
        parts = date_raw.split("-")
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return date_raw


def _infer_regime_from_tags(tags_lower: set) -> str:
    """Infere ``hiring_regime`` a partir das tags da API.

    Tags do RemoteOK incluem keywords de jornada ("full time", "part time",
    "contract", "internship"). Default Full-time quando nenhuma bate.
    """
    if "part time" in tags_lower or "part-time" in tags_lower:
        return "Part-time"
    if "contract" in tags_lower or "contractor" in tags_lower:
        return "Contractor"
    if "intern" in tags_lower or "internship" in tags_lower:
        return "Internship"
    return "Full-time"


def _parse_job_item(item: dict, stacks_lower: set) -> list | None:
    """Converte um item da API RemoteOK em lista canônica.

    Returns:
        Lista canônica de 10 campos, ou ``None`` se a vaga não for relevante
        (filtro contra ``stacks_lower`` + ``_TECH_FALLBACK``).
    """
    tags_raw = item.get("tags", []) or []
    tags = [str(t).lower() for t in tags_raw]
    tags_lower = set(tags)
    position = (item.get("position") or "").lower()
    description = (item.get("description") or "").lower()[:500]
    haystack_terms = tags_lower | set(position.split()) | set(description.split())

    if not _is_relevant(haystack_terms, stacks_lower):
        return None

    link = item.get("url", "")
    job_title = item.get("position", "")
    company = item.get("company", "")

    # v3.10.1: a API expoe `location` em ~93% das vagas (city/country).
    # Quando vazio, fallback "Worldwide" — vaga remota sem ancoragem.
    # Normalizamos pra string (controller aceita str ou list).
    location_raw = (item.get("location") or "").strip()
    location = location_raw if location_raw else "Worldwide"
    work_type = "Remoto"
    hiring_regime = _infer_regime_from_tags(tags_lower)

    salary = _format_salary(item.get("salary_min"), item.get("salary_max"))
    publication_date = _parse_iso_date(item.get("date", ""))

    description = strip_html(item.get("description", ""))
    # Une skills extraídas da descrição com ``tags`` da API que coincidam
    # com o catálogo (preserva ordem, sem duplicatas).
    skills = extract_skills(description) if description else []
    if tags_raw:
        seen = {s.lower() for s in skills}
        catalog = {s.lower(): s for s in stacks}
        for t in tags_raw:
            t_low = str(t).lower()
            if t_low in catalog and t_low not in seen:
                skills.append(catalog[t_low])
                seen.add(t_low)

    return apply_description_fallbacks([
        link, job_title, company, location, work_type,
        hiring_regime, salary, publication_date,
        skills, description,
    ])


# --- Função pública -------------------------------------------------------

async def get_remoteok_jobs(on_job=None) -> list:
    """Extrai vagas do RemoteOK via API JSON pública.

    Particularidade: a API devolve **todas** as vagas em uma única chamada,
    e filtramos client-side. Por isso esta engine **não usa batching** - o
    lote ativo seria irrelevante (uma chamada cobre tudo).

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                relevante - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos.
    """
    session = get_session()

    try:
        response = await fetch_sync(session, "https://remoteok.com/api", timeout=30)

        if response is None or response.status_code != 200:
            status = response.status_code if response is not None else "circuit/retry"
            print(f"Erro ao acessar API RemoteOK: {status}")
            return []

        data = response.json()
        if not data or len(data) < 2:
            print("Nenhuma vaga encontrada na API RemoteOK")
            return []

        # Stacks ativas em variavel.py - fonte primária de relevância
        stacks_lower = {s.lower().replace("_", " ").replace("-", " ") for s in stacks}

        jobs = []
        seen_ids = set()
        for item in data[1:]:        # data[0] é metadata
            job_id = item.get("id")
            if not job_id or job_id in seen_ids:
                continue
            parsed = _parse_job_item(item, stacks_lower)
            if parsed is None:
                continue
            # Pipeline de enriquecimento (epico v3.0.0). RemoteOK e EN-only.
            # v3.6.0: se enrichment falha, descarta a vaga em vez de gravar
            # texto estrangeiro no banco. Politica: banco so contem PT.
            try:
                parsed = await enrich_canonical(parsed, hint_lang="en")
            except Exception as exc:
                logger.warning("[remoteok] skip job=%s: enrichment falhou: %s", job_id, exc)
                continue
            seen_ids.add(job_id)
            tracker.discover(parsed[0], engine="remoteok")
            jobs.append(parsed)
            if on_job is not None:
                try:
                    await on_job(parsed)
                except Exception:
                    pass

        print(f"Foram obtidas {len(jobs)} vagas do site RemoteOK")
        return jobs

    except Exception:
        return []


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    jobs = asyncio.run(get_remoteok_jobs())
    print(f"Total: {len(jobs)}")
    for j in jobs[:10]:
        print(j)

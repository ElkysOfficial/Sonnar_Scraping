"""
Engine Remotive - API pública por categoria (sem batching).

O Remotive é 100% remoto e expõe ``/api/remote-jobs?category=<slug>`` que
devolve até centenas de vagas por categoria. Iteramos a lista fixa de 13
categorias - o lote ativo de stacks é irrelevante aqui.
"""
from __future__ import annotations

import asyncio
import os
import sys

from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import stacks  # noqa: E402
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


# --- Configuração ---------------------------------------------------------

# Categorias do Remotive (slugs aceitos pela API).
REMOTIVE_CATEGORIES = [
    "software-dev",
    "data",
    "design",
    "product",
    "customer-support",
    "marketing",
    "sales",
    "devops-sysadmin",
    "finance-legal",
    "hr",
    "qa",
    "writing",
    "all-others",
]


# --- Helpers privados -----------------------------------------------------

def _extract_hiring_regime(job_type: str) -> str:
    """Mapeia o ``job_type`` da API Remotive para o vocabulário interno.

    Default ``Full-time`` quando o campo está vazio ou não bate.
    """
    if not job_type:
        return "Full-time"
    jt_lower = job_type.lower()
    if "contract" in jt_lower:
        return "Contractor"
    if "part" in jt_lower:
        return "Part-time"
    if "intern" in jt_lower:
        return "Internship"
    return "Full-time"


def _parse_iso_date(date_str: str) -> str:
    """``'2026-04-29T00:00:00'`` -> ``'29/04/2026'``."""
    if not date_str:
        return ""
    date_raw = date_str[:10]
    if len(date_raw) == 10 and "-" in date_raw:
        parts = date_raw.split("-")
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return date_raw


def _parse_job_item(item: dict) -> list | None:
    """Converte um item da resposta JSON do Remotive em lista canônica.

    Returns:
        Lista canônica de 8 campos, ou ``None`` se faltar link/título.
    """
    link = item.get("url", "")
    if not link:
        return None
    job_title = item.get("title", "")
    if not job_title:
        return None

    company = item.get("company_name", "")
    location: list = []           # 100% remoto
    work_type = "Remoto"
    hiring_regime = _extract_hiring_regime(item.get("job_type", ""))
    salary = item.get("salary", "")
    publication_date = _parse_iso_date(item.get("publication_date", ""))

    description = strip_html(item.get("description", ""))
    skills = extract_skills(description) if description else []
    # Mescla com ``tags`` da API que estão no catálogo (preserva ordem)
    tags_raw = item.get("tags") or []
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

async def get_remotive_jobs(on_job=None) -> list:
    """Coleta vagas do Remotive iterando todas as categorias da API.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                emitida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico ``[link, title, company, location,
        work_type, hiring_regime, salary, publication_date]``.
    """
    jobs = []
    seen_ids = set()
    session = get_session()

    for category in REMOTIVE_CATEGORIES:
        try:
            url = f"https://remotive.com/api/remote-jobs?category={category}"
            response = await asyncio.to_thread(session.get, url, timeout=30)
            if response.status_code != 200:
                continue

            for item in response.json().get("jobs", []):
                try:
                    job_id = item.get("id")
                    if not job_id or job_id in seen_ids:
                        continue
                    parsed = _parse_job_item(item)
                    if parsed is None:
                        continue
                    seen_ids.add(job_id)
                    jobs.append(parsed)
                    if on_job is not None:
                        try:
                            await on_job(parsed)
                        except Exception:
                            pass
                except Exception:
                    continue

            await asyncio.sleep(0.3)

        except Exception:
            continue

    print(f"Foram obtidas {len(jobs)} vagas do site Remotive")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_remotive_jobs())[:10]:
        print(j)

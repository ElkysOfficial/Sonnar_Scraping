"""
Engine WeWorkRemotely - consome múltiplos feeds RSS oficiais.

Como o site é 100% focado em vagas remotas, todos os jobs viram
``work_type='Remoto'`` automaticamente. Não há paginação por stack - os
feeds RSS já segmentam por categoria (programming, devops, design, etc.).

Por que não usa batching?
    Os feeds são chamadas baratas (XML estático) e a lista de feeds é
    pequena (9 categorias). Iterar tudo em um único passe é OK.
"""
from __future__ import annotations

import asyncio
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime

from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_batch_key  # noqa: E402
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.persistence.progress_tracker import progress  # noqa: E402
from src.utils.http_session import fetch_sync  # noqa: E402
from src.utils.job_enrichment import enrich_canonical  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402

import logging
logger = logging.getLogger("scraper.engine.weworkremotely")
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


# 2026-05-23 (v2.22.0): pipeline central de enriquecimento. WWR e EN.
PARSER_VERSION = "weworkremotely-2026.05.23"


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

# Keywords pra filtrar só vagas de tech (alguns feeds têm marketing/design não-tech).
TECH_KEYWORDS = {
    "developer", "engineer", "programmer", "software", "frontend", "backend",
    "full stack", "fullstack", "devops", "data", "python", "java", "javascript",
    "react", "node", "angular", "vue", "aws", "cloud", "mobile", "ios", "android",
    "flutter", "kotlin", "swift", "go", "rust", "php", "ruby", "rails", ".net",
    "c#", "typescript", "design", "ux", "ui", "product", "qa", "test", "security",
    "machine learning", "ml", "ai", "blockchain", "web3", "defi",
}

# Feeds RSS - cobertura ampla por categoria.
RSS_FEEDS = [
    "https://weworkremotely.com/remote-jobs.rss",
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
    "https://weworkremotely.com/categories/remote-design-jobs.rss",
    "https://weworkremotely.com/categories/remote-product-jobs.rss",
    "https://weworkremotely.com/categories/remote-data-jobs.rss",
    "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
]


# --- Helpers privados -----------------------------------------------------

def _parse_rfc822_date(text: str) -> str:
    """``'Wed, 15 Jan 2026 00:00:00 +0000'`` -> ``'15/01/2026'``."""
    if not text:
        return ""
    text = text.strip()
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y"):
        try:
            return datetime.strptime(
                text[:31] if "%H" in fmt else text[:16], fmt
            ).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return ""


def _extract_hiring_regime(title_lower: str) -> str:
    """Heurística de regime baseada no título (RSS não tem campo estruturado)."""
    if "contract" in title_lower or "contractor" in title_lower:
        return "Contractor"
    if "part-time" in title_lower or "part time" in title_lower:
        return "Part-time"
    if "intern" in title_lower:
        return "Internship"
    return "Full-time"


def _parse_job_item(item: ET.Element) -> list | None:
    """Extrai uma vaga de um ``<item>`` RSS.

    Returns:
        Lista canônica de 8 campos, ou ``None`` se o título não bater com
        ``TECH_KEYWORDS`` ou faltar título/link.
    """
    title_el = item.find("title")
    job_title = title_el.text.strip() if title_el is not None and title_el.text else ""
    if not job_title:
        return None

    title_lower = job_title.lower()
    if not any(kw in title_lower for kw in TECH_KEYWORDS):
        return None

    link_el = item.find("link")
    link = link_el.text.strip() if link_el is not None and link_el.text else ""
    if not link:
        return None

    # Empresa: WeWorkRemotely usa ``"Company: Job Title"`` no <title>.
    company = ""
    if ":" in job_title:
        parts = job_title.split(":", 1)
        company = parts[0].strip()
        job_title = parts[1].strip()

    pub_el = item.find("pubDate")
    publication_date = _parse_rfc822_date(pub_el.text) if pub_el is not None and pub_el.text else ""

    desc_el = item.find("description")
    description = strip_html(desc_el.text) if desc_el is not None and desc_el.text else ""
    skills = extract_skills(description) if description else []

    return [
        link, job_title, company,
        [],                              # location vazia - site é 100% remoto
        "Remoto",                        # work_type
        _extract_hiring_regime(title_lower),
        "",                              # salary não disponível no RSS
        publication_date,
        skills, description,
    ]


# --- Função pública -------------------------------------------------------

async def get_weworkremotely_jobs(on_job=None) -> list:
    """Busca vagas em todos os feeds RSS, filtra por tech e devolve a lista.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                emitida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos.
    """
    jobs: list = []
    seen: set[str] = set()
    session = get_session()

    # ---- Checkpoint -----------------------------------------------------
    batch_key = get_active_batch_key()
    cursor = await progress.resume("weworkremotely", batch_key) if batch_key else None
    resume_feed = (cursor or {}).get("feed")
    resume_idx = 0
    if cursor:
        try:
            resume_idx = RSS_FEEDS.index(resume_feed) if resume_feed else 0
        except ValueError:
            cursor = None
    if cursor:
        logger.info("weworkremotely_resume", extra={
            "batch_key": batch_key, "feed": resume_feed, "feed_idx": resume_idx,
        })

    for feed_idx, rss_url in enumerate(RSS_FEEDS):
        if feed_idx < resume_idx:
            continue
        if batch_key:
            progress.set_cursor("weworkremotely", batch_key, {
                "feed_idx": feed_idx, "feed": rss_url,
            })
        response = await fetch_sync(session, rss_url, timeout=30)
        if response is None or response.status_code != 200:
            continue

        try:
            root = ET.fromstring(response.content)
        except ET.ParseError:
            continue

        for item in root.findall(".//item"):
            try:
                parsed = _parse_job_item(item)
            except Exception:
                continue
            if not parsed:
                continue
            link = parsed[0]
            if link in seen:
                continue
            seen.add(link)
            tracker.discover(link, engine="weworkremotely")
            parsed = apply_description_fallbacks(parsed)
            try:
                parsed = await enrich_canonical(parsed, hint_lang="en")
            except Exception:
                pass
            jobs.append(parsed)
            if on_job is not None:
                try:
                    await on_job(parsed)
                except Exception:
                    pass

        await asyncio.sleep(0.3)

    if batch_key:
        await progress.clear("weworkremotely", batch_key)

    print(f"Foram obtidas {len(jobs)} vagas do site WeWorkRemotely")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_weworkremotely_jobs())[:10]:
        print(j)

"""
Engine ZipRecruiter UK - listing HTML paginado por stack.

Para cada stack do lote ativo, percorre ate 10 paginas do listing
``ziprecruiter.co.uk/jobs/search``. Sem fetch de detalhe - todas as
informacoes vem do card do listing (`div.jobList-introWrap`).

Layout do card (validado em 2026-05):

    <div class="jobList-introWrap">
      <div class="jobList-intro">
        <a class="jobList-title job-link" href="...alertsclk.com/ekn/...">
          <strong>{job_title}</strong>
        </a>
        <ul class="jobList-introMeta">
          <li><i class="fa-building"></i>{company}</li>
          <li><i class="fa-map-marker-alt"></i>{location}</li>  # ex: "London, ENG, GB"
          <li><i class="fa-clock"></i>{posted_ago}</li>          # opcional
        </ul>
        <div class="jobList-description">{snippet}</div>
      </div>
    </div>

O link de cada vaga e um redirect (alertsclk.com) - aceito como `job_url`
canonico porque eh o destino real ao qual o usuario chegaria.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta

from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_batch_key, get_active_stacks  # noqa: E402
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.persistence.progress_tracker import progress  # noqa: E402
from src.utils.http_session import fetch_sync  # noqa: E402
from src.utils.job_enrichment import enrich_canonical  # noqa: E402

import logging
logger = logging.getLogger("scraper.engine.ziprecruiter")


# v3.10.0 (2026-05): reescrita do parser apos mudanca de DOM do site.
# Card do listing agora carrega description-snippet — passamos pelo
# enrich_canonical pra extrair `responsibilities` e detectar idioma.
PARSER_VERSION = "ziprecruiter-2026.05.30"


# --- Sessao ---------------------------------------------------------------

_session = None


def get_session():
    """Retorna a sessao global, criando-a sob demanda (impersonate Chrome)."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome")
    return _session


def reset_session() -> None:
    """Descarta a sessao atual (use apos bloqueios em sequencia)."""
    global _session
    _session = None


# --- Helpers privados -----------------------------------------------------

def _parse_relative_date(date_text: str) -> str:
    """Converte datas relativas em ingles para ``DD/MM/YYYY``."""
    if not date_text:
        return ""

    date_text = date_text.lower().strip()
    today = datetime.now()

    if "today" in date_text or "just" in date_text or "now" in date_text:
        return today.strftime("%d/%m/%Y")
    if "yesterday" in date_text:
        return (today - timedelta(days=1)).strftime("%d/%m/%Y")

    days_match = re.search(r"(\d+)\s*d(ays?)?(\s*ago)?", date_text)
    if days_match:
        return (today - timedelta(days=int(days_match.group(1)))).strftime("%d/%m/%Y")

    weeks_match = re.search(r"(\d+)\s*w(eeks?)?(\s*ago)?", date_text)
    if weeks_match:
        return (today - timedelta(weeks=int(weeks_match.group(1)))).strftime("%d/%m/%Y")

    months_match = re.search(r"(\d+)\s*m(onths?)?(\s*ago)?", date_text)
    if months_match:
        return (today - timedelta(days=int(months_match.group(1)) * 30)).strftime("%d/%m/%Y")

    hours_match = re.search(r"(\d+)\s*h(ours?)?(\s*ago)?", date_text)
    if hours_match:
        return today.strftime("%d/%m/%Y")

    return ""


def _meta_value(meta_ul, icon_keyword: str) -> str:
    """Retorna o texto do <li> cujo <i> contem ``icon_keyword`` no class."""
    if not meta_ul:
        return ""
    for li in meta_ul.find_all("li"):
        icon = li.find("i")
        if not icon:
            continue
        classes = " ".join(icon.get("class", []))
        if icon_keyword in classes:
            text = li.get_text(" ", strip=True)
            if text:
                return text
    return ""


def _infer_work_type(title: str, location: str) -> str:
    """Heuristica: 'remote'/'hybrid' no titulo ou location."""
    blob = f"{title} {location}".lower()
    if "remote" in blob:
        return "Remoto"
    if "hybrid" in blob:
        return "Hibrido"
    return "Presencial"


def _infer_regime(title: str) -> str:
    """Heuristica por palavras-chave no titulo (default Full-time)."""
    t = title.lower()
    if "part-time" in t or "part time" in t:
        return "Part-time"
    if "contract" in t or "contractor" in t:
        return "Contractor"
    if "intern" in t or "internship" in t:
        return "Internship"
    return "Full-time"


def parse_card(wrap, today: datetime | None = None) -> dict | None:
    """Extrai os campos canonicos de um ``div.jobList-introWrap``.

    Args:
        wrap: elemento BeautifulSoup do card.
        today: data corrente injetada (usada como fallback de publication_date
            quando o card nao expoe data). Util pra testes deterministicos.

    Returns:
        dict com chaves ``link``, ``title``, ``company``, ``location_raw``,
        ``work_type``, ``hiring_regime``, ``salary``, ``publication_date``,
        ``description``. ``None`` se o card nao tem titulo ou link.
    """
    today = today or datetime.now()

    title_a = wrap.find("a", class_="jobList-title")
    if not title_a:
        return None

    link = title_a.get("href", "").strip()
    if not link:
        return None
    if not link.startswith("http"):
        link = f"https://www.ziprecruiter.co.uk{link}"

    title = title_a.get_text(" ", strip=True)
    if not title:
        return None

    meta = wrap.find("ul", class_="jobList-introMeta")
    company = _meta_value(meta, "fa-building")
    location_raw = _meta_value(meta, "fa-map-marker-alt")

    # data publicacao: pode vir como <li> com fa-clock ou regex no <ul>
    posted_text = _meta_value(meta, "fa-clock")
    if not posted_text and meta:
        ago = re.search(
            r"(today|yesterday|\d+\s*(?:d|day|hour|h|week|w|month|mo)s?\s*ago)",
            meta.get_text(" ", strip=True),
            re.I,
        )
        if ago:
            posted_text = ago.group(0)
    publication_date = _parse_relative_date(posted_text) if posted_text else today.strftime("%d/%m/%Y")

    description = ""
    desc_el = wrap.find("div", class_="jobList-description")
    if desc_el:
        description = desc_el.get_text(" ", strip=True)

    return {
        "link": link,
        "title": title,
        "company": company,
        "location_raw": location_raw,
        "work_type": _infer_work_type(title, location_raw),
        "hiring_regime": _infer_regime(title),
        "salary": "",
        "publication_date": publication_date,
        "description": description,
    }


# --- Funcao publica -------------------------------------------------------

async def get_ziprecruiter_jobs(on_job=None) -> list:
    """Coleta vagas do ZipRecruiter UK paginando ate 10 paginas por stack."""
    jobs = []
    seen_links = set()
    session = get_session()

    stacks_list = list(get_active_stacks())
    batch_key = get_active_batch_key()
    cursor = await progress.resume("ziprecruiter", batch_key) if batch_key else None
    resume_stack = (cursor or {}).get("stack")
    resume_page = int((cursor or {}).get("page", 1))
    resume_stack_idx = 0
    if cursor:
        try:
            resume_stack_idx = stacks_list.index(resume_stack) if resume_stack else 0
        except ValueError:
            cursor = None
            resume_page = 1
    if cursor:
        logger.info("ziprecruiter_resume", extra={
            "batch_key": batch_key, "stack": resume_stack,
            "stack_idx": resume_stack_idx, "page": resume_page,
        })

    for stack_idx, stack in enumerate(stacks_list):
        if stack_idx < resume_stack_idx:
            continue
        encoded = urllib.parse.quote(stack)
        start_page = resume_page if stack_idx == resume_stack_idx else 1
        for page in range(start_page, 11):
            if batch_key:
                progress.set_cursor("ziprecruiter", batch_key, {
                    "stack_idx": stack_idx, "stack": stack, "page": page,
                })
            try:
                url = f"https://www.ziprecruiter.co.uk/jobs/search?q={encoded}&l=&page={page}"
                response = await fetch_sync(session, url, timeout=30)
                if response is None or response.status_code != 200:
                    break

                soup = BeautifulSoup(response.text, "html.parser")
                wraps = soup.find_all("div", class_="jobList-introWrap")
                if not wraps:
                    break

                for wrap in wraps:
                    try:
                        parsed = parse_card(wrap)
                        if not parsed:
                            continue
                        if parsed["link"] in seen_links:
                            continue
                        seen_links.add(parsed["link"])
                        tracker.discover(parsed["link"], engine="ziprecruiter")

                        job = [
                            parsed["link"],
                            parsed["title"],
                            parsed["company"],
                            [parsed["location_raw"]] if parsed["location_raw"] else [],
                            parsed["work_type"],
                            parsed["hiring_regime"],
                            parsed["salary"],
                            parsed["publication_date"],
                            [],  # skills — enrich nao adiciona; o vocab_match no controller cuida
                            parsed["description"],
                        ]
                        try:
                            job = await enrich_canonical(job, hint_lang="en")
                        except Exception as exc:
                            logger.warning(
                                "[ziprecruiter] skip job=%s: enrichment falhou: %s",
                                parsed["link"], exc,
                            )
                            continue
                        jobs.append(job)
                        if on_job is not None:
                            try:
                                await on_job(job)
                            except Exception:
                                pass
                    except Exception:
                        continue

                await asyncio.sleep(0.3)

            except Exception:
                break

    if batch_key:
        await progress.clear("ziprecruiter", batch_key)

    print(f"Foram obtidas {len(jobs)} vagas do site ZipRecruiter")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_ziprecruiter_jobs())[:10]:
        print(j)

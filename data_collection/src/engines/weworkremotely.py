"""
Engine WeWorkRemotely — consome múltiplos feeds RSS oficiais.

Como o site é 100% focado em vagas remotas, todos os jobs viram
``work_type='Remoto'`` automaticamente. Não há paginação por stack — os
feeds RSS já segmentam por categoria (programming, devops, design, etc.).

Por que não usa batching?
    Os feeds são chamadas baratas (XML estático) e a lista de feeds é
    pequena (9 categorias). Iterar tudo em um único passe é OK.
"""
from __future__ import annotations

import asyncio
import xml.etree.ElementTree as ET
from datetime import datetime

from curl_cffi import requests


# Sessão global (curl_cffi → impersonate Chrome para bypass de filtros básicos)
_session = None


def get_session():
    """Sessão reutilizável; criada na primeira chamada."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome")
    return _session


def reset_session() -> None:
    global _session
    _session = None


# Keywords pra filtrar só vagas de tech (alguns feeds têm marketing/design não-tech)
TECH_KEYWORDS = {
    "developer", "engineer", "programmer", "software", "frontend", "backend",
    "full stack", "fullstack", "devops", "data", "python", "java", "javascript",
    "react", "node", "angular", "vue", "aws", "cloud", "mobile", "ios", "android",
    "flutter", "kotlin", "swift", "go", "rust", "php", "ruby", "rails", ".net",
    "c#", "typescript", "design", "ux", "ui", "product", "qa", "test", "security",
    "machine learning", "ml", "ai", "blockchain", "web3", "defi",
}

# Feeds RSS — cobertura ampla por categoria
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


def _parse_pub_date(text: str) -> str:
    """RFC822 (ex.: ``Wed, 15 Jan 2026 00:00:00 +0000``) → ``DD/MM/YYYY``."""
    if not text:
        return ""
    text = text.strip()
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y"):
        try:
            return datetime.strptime(text[:31] if "%H" in fmt else text[:16], fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return ""


def _classify_regime(title_lower: str) -> str:
    """Heurística de regime baseada no título (RSS não tem campo estruturado)."""
    if "contract" in title_lower or "contractor" in title_lower:
        return "Contractor"
    if "part-time" in title_lower or "part time" in title_lower:
        return "Part-time"
    if "intern" in title_lower:
        return "Internship"
    return "Full-time"


def _parse_item(item: ET.Element) -> list | None:
    """Extrai uma vaga de um <item> RSS. Devolve None se não passar no filtro tech."""
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

    # Empresa: WeWorkRemotely usa "Company: Job Title" no <title>
    company = ""
    if ":" in job_title:
        parts = job_title.split(":", 1)
        company = parts[0].strip()
        job_title = parts[1].strip()

    pub_el = item.find("pubDate")
    publication_date = _parse_pub_date(pub_el.text) if pub_el is not None and pub_el.text else ""

    return [
        link, job_title, company,
        [],                # location vazia — site é 100% remoto
        "Remoto",          # work_type
        _classify_regime(title_lower.lower()),
        "",                # salary não disponível no RSS
        publication_date,
    ]


async def get_weworkremotely_jobs(on_job=None) -> list:
    """
    Busca vagas em todos os feeds RSS, filtra por tech e devolve a lista.

    Args:
        on_job: callback opcional invocado a cada vaga emitida.
    """
    jobs: list = []
    seen: set[str] = set()
    session = get_session()

    for rss_url in RSS_FEEDS:
        try:
            response = await asyncio.to_thread(session.get, rss_url, timeout=30)
        except Exception:
            continue
        if response.status_code != 200:
            continue

        try:
            root = ET.fromstring(response.content)
        except ET.ParseError:
            continue

        for item in root.findall(".//item"):
            try:
                parsed = _parse_item(item)
            except Exception:
                continue
            if not parsed:
                continue
            link = parsed[0]
            if link in seen:
                continue
            seen.add(link)
            jobs.append(parsed)
            if on_job is not None:
                try:
                    await on_job(parsed)
                except Exception:
                    pass

        await asyncio.sleep(0.3)

    print(f"Foram obtidas {len(jobs)} vagas do site WeWorkRemotely")
    return jobs


if __name__ == "__main__":
    result = asyncio.run(get_weworkremotely_jobs())
    for j in result[:5]:
        print(j)

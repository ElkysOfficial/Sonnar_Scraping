"""
Engine Michael Page Brasil - listing por categoria pré-definida.

O Michael Page **não suporta busca por texto livre** - só lista por
categoria (slugs em ``MICHAELPAGE_CATEGORIES``). Por isso esta engine não
participa do batching de stacks: sempre cobre as mesmas 8 categorias.

Cada listing entrega cards com link ``/job-detail/...``. O site não publica
JSON-LD nas listagens, então parseamos diretamente o DOM dos cards.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from src.utils.http_session import HttpSession, fetch  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


# --- Sessão (padrão httpx compartilhado) ---------------------------------

_HEADERS_EXTRA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
}

_SESSION = HttpSession(headers=_HEADERS_EXTRA)


async def get_session():
    return await _SESSION.get_client()


def reset_session() -> None:
    _SESSION.reset()


# --- Configuração ---------------------------------------------------------

# Categorias válidas do Michael Page Brasil (slugs pré-definidos).
MICHAELPAGE_CATEGORIES = [
    "ti-tecnologia",
    "engenharia",
    "financas-contabilidade",
    "vendas",
    "marketing",
    "recursos-humanos",
    "supply-chain",
    "juridico",
]

MP_FETCH_DETAIL = os.getenv("MICHAELPAGE_FETCH_DETAIL", "1") == "1"
MP_DETAIL_CONCURRENCY = int(os.getenv("MICHAELPAGE_DETAIL_CONCURRENCY", "5"))

# Mapeamento employmentType (schema.org) → vocabulário interno.
# Os 5 valores documentados pelo Michael Page (e schema.org JobPosting):
#   FULL_TIME  → "Permanente" no UI da MP → CLT
#   PART_TIME  → "Meio período"           → Meio Período
#   CONTRACTOR → "Contratação por projeto"→ PJ
#   INTERN     → "Estágio"                → Estágio
#   TEMPORARY  → "Temporário"             → Temporário
_EMPLOYMENT_TYPE_MAP = {
    "FULL_TIME": "CLT",
    "PART_TIME": "Meio Período",
    "CONTRACTOR": "PJ",
    "INTERN": "Estágio",
    "TEMPORARY": "Temporário",
}

# JSON-LD da Michael Page contém control chars (\x00-\x1F) que quebram json.loads
_RE_JSONLD = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
_RE_CTRL_CHARS = re.compile(r"[\x00-\x1F\x7F-\x9F]")


# --- Helpers de detalhe --------------------------------------------------

def _parse_jsonld_jobposting(html: str) -> dict | None:
    """Extrai bloco JSON-LD ``@type=JobPosting`` do HTML, com strip de control chars."""
    for blk in _RE_JSONLD.finditer(html):
        cleaned = _RE_CTRL_CHARS.sub("", blk.group(1))
        try:
            data = json.loads(cleaned)
        except (json.JSONDecodeError, ValueError):
            continue
        cands = data if isinstance(data, list) else [data]
        for c in cands:
            if isinstance(c, dict) and c.get("@type") == "JobPosting":
                return c
    return None


def _parse_employment_type(jp: dict) -> str:
    """Mapeia ``employmentType`` (string ou lista) para vocabulário interno."""
    et = jp.get("employmentType") or ""
    if isinstance(et, list):
        for v in et:
            if v in _EMPLOYMENT_TYPE_MAP:
                return _EMPLOYMENT_TYPE_MAP[v]
        return ""
    return _EMPLOYMENT_TYPE_MAP.get(et, "")


def _format_jsonld_location(jp: dict) -> str:
    """Compõe ``"Cidade, Region, CC"`` do JSON-LD para o location_normalizer.

    Nota MP: ``addressRegion`` costuma vir como ``'Brazil'`` (não UF). O
    normalizer ignora valores desconhecidos no slot do estado e devolve
    ``(None, 'BR')`` quando a cidade não está no mapa de capitais.
    """
    loc = jp.get("jobLocation") or {}
    if isinstance(loc, list):
        loc = loc[0] if loc else {}
    addr = loc.get("address") if isinstance(loc, dict) else None
    if not isinstance(addr, dict):
        return ""
    parts = [
        addr.get("addressLocality") or "",
        addr.get("addressRegion") or "",
        addr.get("addressCountry") or "",
    ]
    parts = [p.strip() for p in parts if p and isinstance(p, str) and p.strip()]
    return ", ".join(parts)


def _format_jsonld_date(jp: dict) -> str:
    """``'2025-12-09'`` → ``'09/12/2025'`` (vazio se ausente)."""
    raw = (jp.get("datePosted") or "")[:10]
    if len(raw) == 10 and "-" in raw:
        y, m, d = raw.split("-")
        return f"{d}/{m}/{y}"
    return ""


async def _fetch_job_detail(link: str, client, semaphore: asyncio.Semaphore) -> dict:
    """Busca detalhe e devolve enriquecimentos. Vazio se falhar."""
    async with semaphore:
        response = await fetch(client, link)
        if response is None or response.status_code != 200:
            return {}
        try:
            jp = _parse_jsonld_jobposting(response.text)
            if not jp:
                return {}
            description = strip_html(jp.get("description", ""))
            return {
                "description": description,
                "skills": extract_skills(description) if description else [],
                "publication_date": _format_jsonld_date(jp),
                "location_str": _format_jsonld_location(jp),
                "hiring_regime": _parse_employment_type(jp),
            }
        except Exception:
            return {}


# --- Função pública -------------------------------------------------------

async def get_michaelpage_jobs(on_job=None) -> list:
    """Extrai vagas do Michael Page Brasil por categoria pré-definida.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                emitida - usado pelo controller pra persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos. ``publication_date`` fica
        vazio (o listing do Michael Page não expõe data).
    """
    jobs = []
    seen_links = set()

    client = await get_session()
    for category in MICHAELPAGE_CATEGORIES:
        try:
            url = f"https://www.michaelpage.com.br/jobs/{category}"
            response = await fetch(client, url)

            if response is not None and response.status_code == 200:
                soup = BeautifulSoup(response.text, "html.parser")

                # ESTRATÉGIA PRINCIPAL: links /job-detail/ no DOM.
                # O Michael Page não usa JSON-LD nas listagens.
                all_links = soup.find_all("a", href=True)
                job_detail_links = [
                    a for a in all_links
                    if "/job-detail/" in a.get("href", "")
                ]

                for link_elem in job_detail_links:
                    try:
                        href = link_elem.get("href", "")
                        if not href:
                            continue

                        if href.startswith("/"):
                            link = f"https://www.michaelpage.com.br{href}"
                        else:
                            link = href

                        if link in seen_links:
                            continue
                        seen_links.add(link)

                        job_title = link_elem.get_text(strip=True)
                        if not job_title or len(job_title) < 3:
                            continue

                        company = "Michael Page"

                        parent = link_elem.find_parent("div")
                        location_raw = ""
                        work_type = "Presencial"
                        hiring_regime = ""
                        salary = ""

                        if parent:
                            parent_text = parent.get_text(strip=True).lower()
                            if "são paulo" in parent_text:
                                location_raw = "São Paulo"
                            elif "rio de janeiro" in parent_text:
                                location_raw = "Rio de Janeiro"
                            if "home office" in parent_text or "remoto" in parent_text:
                                work_type = "Remoto"
                            elif "híbrido" in parent_text or "hibrido" in parent_text:
                                work_type = "Híbrido"
                            if "permanent" in parent_text or "efetivo" in parent_text:
                                hiring_regime = "CLT"
                            elif "temporár" in parent_text:
                                hiring_regime = "Temporário"

                        title_lower = job_title.lower()
                        if work_type == "Remoto":
                            location = []
                        elif location_raw:
                            location = [location_raw]
                        else:
                            location = []

                        if "remoto" in title_lower or "remote" in title_lower:
                            work_type = "Remoto"
                            location = []
                        elif "híbrido" in title_lower or "hibrido" in title_lower:
                            work_type = "Híbrido"

                        publication_date = ""

                        # 10 campos canônicos: skills/description começam vazios e
                        # são preenchidos pelo fetch_detail abaixo (best-effort).
                        job = [link, job_title, company, location, work_type,
                               hiring_regime, salary, publication_date, [], ""]
                        jobs.append(job)

                    except Exception:
                        continue

        except Exception:
            continue

        await asyncio.sleep(0.5)

    # Enriquecimento via JSON-LD da página de detalhe (best-effort, em paralelo).
    # Sobrescreve heurísticas do listing com fontes mais confiáveis: location_raw
    # real, hiring_regime via employmentType, datePosted, description e skills.
    if MP_FETCH_DETAIL and jobs:
        semaphore = asyncio.Semaphore(MP_DETAIL_CONCURRENCY)

        async def _enrich(job: list) -> None:
            extra = await _fetch_job_detail(job[0], client, semaphore)
            if not extra:
                if on_job is not None:
                    try:
                        await on_job(job)
                    except Exception:
                        pass
                return
            if extra.get("location_str"):
                job[3] = extra["location_str"]
            if extra.get("hiring_regime"):
                job[5] = extra["hiring_regime"]
            if extra.get("publication_date"):
                job[7] = extra["publication_date"]
            if extra.get("skills"):
                job[8] = extra["skills"]
            if extra.get("description"):
                job[9] = extra["description"]
            # Pos-processamento: minera campos vazios da descricao.
            apply_description_fallbacks(job)
            if on_job is not None:
                try:
                    await on_job(job)
                except Exception:
                    pass

        await asyncio.gather(*(_enrich(j) for j in jobs))
    elif on_job is not None:
        # MP_FETCH_DETAIL desligado: emite o que veio do listing
        for j in jobs:
            apply_description_fallbacks(j)
            try:
                await on_job(j)
            except Exception:
                pass

    print(f"Foram obtidas {len(jobs)} vagas do site MichaelPage")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_michaelpage_jobs())[:10]:
        print(j)

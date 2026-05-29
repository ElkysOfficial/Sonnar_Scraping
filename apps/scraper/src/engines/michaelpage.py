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
from variavel import get_active_batch_key  # noqa: E402
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.persistence.progress_tracker import progress  # noqa: E402
from src.utils.http_session import HttpSession, fetch  # noqa: E402

import logging
logger = logging.getLogger("scraper.engine.michaelpage")


# 2026-05-23 (v2.23.0): pipeline central. MichaelPage e sempre PT.
PARSER_VERSION = "michaelpage-2026.05.23"
from src.utils.job_enrichment import enrich_canonical  # noqa: E402
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

# Categorias do Michael Page focadas em TI. Combinamos as duas slugs que
# o proprio site mantem (PT e EN) - elas tem listas parcialmente diferentes
# e o dedup por URL garante que vagas em ambas nao sao contadas duas vezes.
# Outras categorias (engenharia/financas/vendas/marketing/RH/supply/juridico)
# trazem ~90% de ruido non-dev e sao excluidas.
# 'information-technology' tende a ser mais limpa (sem "Gerente de Vendas"
# nem "Gerente de Produtos" que ti-tecnologia inclui); 'ti-tecnologia'
# pega vagas em portugues que IT pode nao indexar.
MICHAELPAGE_CATEGORIES = [
    "ti-tecnologia",
    "information-technology",
]

# Padroes em titulo que indicam vaga non-tech mesmo quando o MP a coloca
# numa categoria de TI. Aplicado como filtro defensivo - se bater, a vaga
# eh descartada antes de persistir. Ex.: "Gerente de Vendas - Canal Indireto"
# aparece em /jobs/ti-tecnologia mas e vaga de comercial.
_NON_TECH_TITLE_PATTERNS = re.compile(
    r"(?<![\w])("
    # Vendas / Comercial
    r"vendedor(?:a)?|executivo(?:a)?\s+de\s+(?:vendas|neg[óo]cios)|"
    r"gerente\s+(?:de\s+)?vendas|gerente\s+comercial|"
    r"gerente\s+de\s+produtos?|gerente\s+de\s+contas|"
    r"key\s+account\s+manager|sales\s+representative|"
    r"representante\s+de\s+vendas|consultor\s+de\s+vendas|"
    r"assistente\s+comercial|coordenador\s+comercial|"
    r"analista\s+(?:de\s+)?performance\s+comercial|"
    r"coordenador\s+de\s+opera[çc][õo]es\s+comerciais|"
    r"analista\s+de\s+ouvidoria|"
    # Finanças / Contabilidade
    r"gerente\s+(?:de\s+)?(?:contabil|cont[áa]bil|contabilidade|tribut[áa]rio|fiscal|"
    r"controladoria|financeir[ao]|adm(?:inistrativo)?|tesouraria|loja|"
    r"agr[íi]cola|manuten[çc][ãa]o|pcp|opera[çc][õo]es\s+industri|"
    r"departamento\s+pessoal)|"
    r"plant\s+manager|finance\s+manager(?:\s+pj|\s+accountant)?|"
    r"controller\s+financeiro|head\s+de\s+finan[çc]as|"
    r"contador|contabilista|especialista\s+cont[áa]bil|"
    r"analista\s+(?:cont[áa]bil|fiscal|de\s+fp&?a|tribut[áa]rio|de\s+fluxo)|"
    r"fx[\s-]+specialist|forex|trade\s+finance|po[\s-]+trade|fp&?a|pricing|"
    r"especialista\s+de\s+pricing|page\s+interim\s+especialista\s+de\s+contas?|"
    # Engenharia (não-software)
    r"engenheiro(?:a)?\s+(?:mec[âa]nico|agr[íi]cola|civil|el[ée]trico|"
    r"eletrico|qu[íi]mico|industrial|de\s+aplica|de\s+implementos|"
    r"de\s+manuten|calculista|de\s+gest[ãa]o\s+de\s+ativos|"
    r"de\s+instala[çc][ãa]o)|"
    r"supervisor\s+de\s+manuten[çc][ãa]o|gerente\s+de\s+manuten[çc][ãa]o|"
    r"comissionamento|"
    r"autodesk\s+bim|coordena[çc][ãa]o\s+de\s+modelo\s+bim|"
    r"or[çc]amentista\s+bim|"
    # Marketing / Comunicação / Branding / Design
    r"gerente\s+(?:de\s+)?(?:marketing|comunica[çc][ãa]o|trade\s+marketing|marca)|"
    r"analista\s+(?:de\s+)?(?:marketing|comunica[çc][ãa]o|trade\s+marketing)|"
    r"especialista\s+(?:de\s+)?marketing|"
    r"brand\s+(?:embassador|ambassador)|paid\s+media|"
    # RH / Talents
    r"recursos\s+humanos|tech\s+recruiter|talent\s+acquisition|"
    r"coordenador\s+de\s+gest[ãa]o\s+de\s+talentos|"
    r"analista\s+s[êe]nior\s+de\s+hris|hris|total\s+rewards|"
    # Outros non-tech
    r"coordenador\s+jur[íi]dico|coord(?:enador)?\s+de\s+facilities|"
    r"bdr\b|business\s+development\s+representative|"
    r"agency\s+development\s+manager|"
    r"analista\s+de\s+conv[êe]nios|"
    r"head\s+business\s+development|head\s+comercial|"
    r"pesquisador\s+em\s+biologia|biologia\s+sint[ée]tica|"
    r"engenharia\s+gen[ée]tica|bioenergy|energy\s+transition|"
    r"coordenador\s+de\s+cart[ãa]o\s+de\s+benef[íi]cios|"
    r"coordenador\s+de\s+m[íi]dia|"
    r"coordenador\s+de\s+estrat[ée]gia\s+de\s+desenvolvimento\s+de\s+neg[óo]cio"
    r")(?![\w])",
    re.IGNORECASE,
)


def _is_non_tech_title(title: str) -> bool:
    """True se o titulo bater com padroes non-tech conhecidos."""
    if not title:
        return False
    return bool(_NON_TECH_TITLE_PATTERNS.search(title))

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


def _detect_work_type(jp: dict, location_str: str, title: str) -> str:
    """Heuristica de modalidade.

    MP entrega ``jobLocationType='TELECOMMUTE'`` quando remoto. Caso
    contrario, busca pistas ('home office', 'remoto', 'híbrido') no
    texto da localidade e do titulo.
    """
    jlt = (jp.get("jobLocationType") or "").upper()
    if jlt == "TELECOMMUTE":
        return "Remoto"
    blob = (location_str + " " + title).lower()
    if "home office" in blob or "remoto" in blob or "remote" in blob:
        return "Remoto"
    if "híbrido" in blob or "hibrido" in blob or "hybrid" in blob:
        return "Híbrido"
    return "Presencial"


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
            location_str = _format_jsonld_location(jp)
            title = (jp.get("title") or "").strip()
            ho = jp.get("hiringOrganization") or {}
            company = ""
            if isinstance(ho, dict):
                company = (ho.get("name") or "").strip()
            return {
                "title": title,
                "company": company,
                "description": description,
                "skills": extract_skills(description) if description else [],
                "publication_date": _format_jsonld_date(jp),
                "location_str": location_str,
                "hiring_regime": _parse_employment_type(jp),
                "work_type": _detect_work_type(jp, location_str, title),
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

    # ---- Checkpoint -----------------------------------------------------
    batch_key = get_active_batch_key()
    cursor = await progress.resume("michaelpage", batch_key) if batch_key else None
    resume_category = (cursor or {}).get("category")
    resume_idx = 0
    if cursor:
        try:
            resume_idx = (
                MICHAELPAGE_CATEGORIES.index(resume_category)
                if resume_category else 0
            )
        except ValueError:
            cursor = None
    if cursor:
        logger.info("michaelpage_resume", extra={
            "batch_key": batch_key, "category": resume_category,
            "category_idx": resume_idx,
        })

    for cat_idx, category in enumerate(MICHAELPAGE_CATEGORIES):
        if cat_idx < resume_idx:
            continue
        if batch_key:
            progress.set_cursor("michaelpage", batch_key, {
                "category_idx": cat_idx, "category": category,
            })
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
                        tracker.discover(link, engine="michaelpage")

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
            # Filtro defensivo: titulo non-tech mesmo na categoria TI. Cobre
            # casos como "Gerente de Vendas - Canal Indireto" que aparecem em
            # /jobs/ti-tecnologia. Apos esse return, a vaga nem chega a
            # persistencia - on_job nao e chamado.
            extracted_title = extra.get("title") or job[1]
            if _is_non_tech_title(extracted_title):
                return
            # Title/company: detail-first quando JSON-LD trouxer (sempre traz
            # em vagas reais). Fallback para o que veio do listing card.
            if extra.get("title"):
                job[1] = extra["title"]
            if extra.get("company"):
                job[2] = extra["company"]
            if extra.get("location_str"):
                job[3] = extra["location_str"]
            if extra.get("work_type"):
                job[4] = extra["work_type"]
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
            # v3.6.0: skip vaga se enrichment falha — sentinela `clear()`
            # marca o slot pra remocao apos o gather (banco so contem PT).
            # v3.6.0: sem hint_lang — Michael Page Brasil tem vagas EN.
            try:
                enriched = await enrich_canonical(job)
                if enriched is not job:
                    job.clear()
                    job.extend(enriched)
            except Exception as exc:
                logger.warning("[michaelpage] skip job=%s: enrichment falhou: %s", job[0] if job else "?", exc)
                job.clear()
                return
            if on_job is not None:
                try:
                    await on_job(job)
                except Exception:
                    pass

        await asyncio.gather(*(_enrich(j) for j in jobs))
        # Remove vagas que tiveram enrichment falhado (job.clear() = vazia).
        jobs[:] = [j for j in jobs if j]
    elif on_job is not None:
        # MP_FETCH_DETAIL desligado: emite o que veio do listing
        for j in jobs:
            apply_description_fallbacks(j)
            try:
                await on_job(j)
            except Exception:
                pass

    if batch_key:
        await progress.clear("michaelpage", batch_key)

    print(f"Foram obtidas {len(jobs)} vagas do site MichaelPage")
    return jobs


async def refetch_one(url: str) -> list | None:
    """Reprocessa uma URL específica do Michael Page (passe de reenrichment).

    Popula title/company/work_type direto do JSON-LD - antes o reenrichment
    sobrescrevia o jobs.json com esses campos vazios, zerando vagas que ja
    tinham sido extraidas corretamente no listing.
    """
    client = await get_session()
    sem = asyncio.Semaphore(1)
    detail = await _fetch_job_detail(url, client, sem)
    if not detail or not detail.get("description"):
        return None
    # Filtro defensivo: titulo non-tech bloqueia reenrichment. Devolve None
    # para o tracker marcar como descartada e nao reaparecer no jobs.json.
    if _is_non_tech_title(detail.get("title", "")):
        return None
    location_str = detail.get("location_str", "")
    parsed = [
        url,
        detail.get("title", ""),
        detail.get("company", ""),
        [location_str] if location_str else [],
        detail.get("work_type", ""),
        detail.get("hiring_regime", ""),
        "",
        detail.get("publication_date", ""),
        detail.get("skills", []),
        detail.get("description", ""),
    ]
    return apply_description_fallbacks(parsed)


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_michaelpage_jobs())[:10]:
        print(j)

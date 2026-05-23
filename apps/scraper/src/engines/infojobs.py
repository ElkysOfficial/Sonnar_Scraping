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
import re
import sys
import urllib.parse

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_batch_key, get_active_stacks  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from src.persistence.progress_tracker import progress  # noqa: E402

import logging
logger = logging.getLogger("scraper.engine.infojobs")
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.utils.http_session import HttpSession, fetch  # noqa: E402


PARSER_VERSION = "infojobs-2026.05.08"


_MIN_USEFUL_DESCRIPTION = 200


def is_partial(job_data: dict) -> bool:
    """Decide se uma vaga InfoJobs deve ficar em ``partial``.

    A InfoJobs entrega description sempre via JSON-LD da pagina de detalhe.
    Quando o texto chega com tamanho razoavel a vaga esta no estado mais
    completo possivel para o que a fonte oferece. Campos opcionais que NAO
    devem disparar reenrichment:

    * ``salary`` vazio - cerca de metade das vagas InfoJobs nao publica
      ``baseSalary`` no JSON-LD (o anunciante pode marcar "a combinar"
      no formulario). Refetch nao melhora porque o site nao tem o dado.

    Sinal real: ``description`` ausente/trivial (< 200 chars). Refetch
    pode resolver quando a primeira passada bateu numa pagina servida
    sem JSON-LD ou com erro.
    """
    description = (job_data.get("description") or "").strip()
    return len(description) < _MIN_USEFUL_DESCRIPTION
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


# --- Sessão (padrão httpx compartilhado) ---------------------------------

_SESSION = HttpSession()


async def get_session():
    return await _SESSION.get_client()


def reset_session() -> None:
    _SESSION.reset()


# --- Configuração --------------------------------------------------------

_FETCH_CONCURRENCY = 8

# Paginacao do listing. InfoJobs usa ``Page=N`` (case-sensitive!) - lowercase
# ``page=N`` e silenciosamente ignorado e devolve sempre a primeira pagina.
# 20 paginas x 20 vagas = ate 400 por stack, cobrindo stacks populares
# (Python, Java) com folga. Stacks de cauda longa nao pagam o custo - o
# early-stop encerra assim que vier pagina vazia ou so com duplicatas.
_LISTING_MAX_PAGES = 20


# Patterns de combinacao: vagas que aceitam multiplos regimes ("PJ ou
# Cooperado", "CLT ou PJ"). Aplicados em ambos current+description e tem
# precedencia sobre patterns individuais - assim 11595873 (oficial="Cooperado",
# descricao="PJ ou Cooperado") vira "PJ/Cooperado", nao "Cooperado".
_INFOJOBS_COMBINATION_PATTERNS = [
    ("PJ/Cooperado", re.compile(
        r"\b(?:PJ|pessoa\s+jur[ií]dica|prestador\s+de\s+servi[çc]os?)\s*"
        r"(?:ou|e|/|,)\s*cooperad[oa]?|"
        r"\bcooperad[oa]?\s*(?:ou|e|/|,)\s*"
        r"(?:PJ|pessoa\s+jur[ií]dica|prestador\s+de\s+servi[çc]os?)",
        re.IGNORECASE,
    )),
    ("CLT/PJ", re.compile(
        r"\bCLT\s*(?:ou|e|/|,)\s*PJ\b|\bPJ\s*(?:ou|e|/|,)\s*CLT\b|"
        r"\befetivo\s*(?:ou|e|/|,)\s*PJ\b",
        re.IGNORECASE,
    )),
]


# Patterns individuais. Ordem importa - primeiro match vence. Cooperado vem
# antes de PJ; CLT vem por ultimo entre os fortes pra nao mascarar formas
# mais especificas (estagio, trainee, aprendiz).
_INFOJOBS_MODALITY_PATTERNS = [
    ("Cooperado", re.compile(
        r"\bcooperad[oa]s?\b|\bcooperativ[ao]\b|"
        r"(?:modalidade|regime\s+de\s+contrata[çc][ãa]o(?:\s+de\s+tipo)?)"
        r"\s*[:\-]?\s*cooperad",
        re.IGNORECASE,
    )),
    ("Estágio", re.compile(
        r"\b(?:est[áa]gio|estagi[áa]ri[oa]|intern(?:ship)?)\b|"
        r"regime\s+de\s+contrata[çc][ãa]o\s+(?:de\s+)?tipo\s+est[áa]gio",
        re.IGNORECASE,
    )),
    ("Aprendiz", re.compile(
        r"\b(?:jovem\s+aprendiz|aprendiz\s+legal|menor\s+aprendiz)\b|"
        r"regime\s+de\s+contrata[çc][ãa]o\s+(?:de\s+)?tipo\s+aprendiz",
        re.IGNORECASE,
    )),
    ("Trainee", re.compile(
        r"\btrainee\b|"
        r"regime\s+de\s+contrata[çc][ãa]o\s+(?:de\s+)?tipo\s+trainee",
        re.IGNORECASE,
    )),
    ("Temporário", re.compile(
        r"\b(?:tempor[áa]ri[oa]|fixed[-\s]?term)\b|"
        r"regime\s+de\s+contrata[çc][ãa]o\s+(?:de\s+)?tipo\s+tempor[áa]ri",
        re.IGNORECASE,
    )),
    ("Freelancer", re.compile(r"\bfreelanc(?:e|er)\b", re.IGNORECASE)),
    ("Autônomo", re.compile(r"\baut[ôo]nomo\b", re.IGNORECASE)),
    ("Voluntário", re.compile(r"\bvolunt[áa]ri[oa]\b", re.IGNORECASE)),
    ("PJ", re.compile(
        r"\b(?:PJ|pessoa\s+jur[ií]dica|prestador\s+de\s+servi[çc]os?)\b|"
        r"(?:modalidade|regime\s+de\s+contrata[çc][ãa]o(?:\s+de\s+tipo)?)"
        r"\s*[:\-]?\s*(?:PJ|pessoa\s+jur)",
        re.IGNORECASE,
    )),
    # CLT por ultimo entre os "fortes": "Efetivo" e termo da InfoJobs para CLT.
    ("CLT", re.compile(
        r"\bCLT\b|carteira\s+assinada|regime\s+celetista|\befetivo\b|"
        r"(?:modalidade|regime\s+de\s+contrata[çc][ãa]o(?:\s+de\s+tipo)?)"
        r"\s*[:\-]?\s*(?:CLT|efetivo)",
        re.IGNORECASE,
    )),
]


def _match_canonical_regime(text: str) -> str:
    """Devolve o primeiro label canonico cujo pattern bate em ``text``,
    ou string vazia. Aplicado tanto ao bloco oficial quanto a descricao.
    """
    if not text:
        return ""
    for label, pat in _INFOJOBS_MODALITY_PATTERNS:
        if pat.search(text):
            return label
    return ""


def _match_combination_regime(*texts: str) -> str:
    """Verifica patterns de combinacao (PJ/Cooperado, CLT/PJ) em todos os
    textos passados. Combinacao em qualquer texto vence individuais.
    """
    blob = " \n ".join(t for t in texts if t)
    if not blob:
        return ""
    for label, pat in _INFOJOBS_COMBINATION_PATTERNS:
        if pat.search(blob):
            return label
    return ""


def _refine_hiring_regime(current: str, description: str) -> str:
    """Devolve um label canonico (CLT/PJ/Cooperado/CLT/PJ/PJ/Cooperado/...) ou vazio.

    Estrategia:
      1. Combinacao explicita em current OU descricao -> ganha (mais especifico).
         Ex.: oficial="Cooperado" + descricao="PJ ou Cooperado" -> "PJ/Cooperado".
      2. Senao, normaliza ``current`` para um label canonico individual
         ("Efetivo - CLT" -> "CLT", "Trainee - Noturno" -> "Trainee").
      3. Se ``current`` nao mapeia, minera a descricao.
      4. Se nada bater, retorna "" (preferimos vazio a valor cru/duvidoso).
    """
    combo = _match_combination_regime(current, description)
    if combo:
        return combo
    canon = _match_canonical_regime(current)
    if canon:
        return canon
    return _match_canonical_regime(description)


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

    description = strip_html(data.get("description", ""))
    skills = extract_skills(description) if description else []

    # Quando "Tipo de contrato" vem "Outros" ou vazio, minera modalidade
    # explicita ("Modalidade de contratacao: PJ", "Cooperado") da descricao.
    hiring_regime = _refine_hiring_regime(hiring_regime, description)

    return apply_description_fallbacks([
        link, title, company, location, work_type, hiring_regime, salary, publication_date,
        skills, description,
    ])


# --- Fase 1: coleta de links ---------------------------------------------

async def get_infojobs_links() -> list[str]:
    """Coleta links unicos de vaga, paginando ate ``_LISTING_MAX_PAGES`` por stack.

    Para cada stack, itera ``page=1..N`` e para assim que uma pagina nao
    trouxer nenhum link novo (sinal de que esgotou o resultset). Evita
    requests desnecessarios em stacks com poucos resultados.
    """
    links: list[str] = []
    seen: set[str] = set()

    client = await get_session()

    # ---- Checkpoint -----------------------------------------------------
    stacks_list = list(get_active_stacks())
    batch_key = get_active_batch_key()
    cursor = await progress.resume("infojobs", batch_key) if batch_key else None
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
        logger.info("infojobs_resume", extra={
            "batch_key": batch_key, "stack": resume_stack,
            "stack_idx": resume_stack_idx, "page": resume_page,
        })

    for stack_idx, stack in enumerate(stacks_list):
        if stack_idx < resume_stack_idx:
            continue
        encoded = urllib.parse.quote(stack)
        start_page = resume_page if stack_idx == resume_stack_idx else 1
        for page in range(start_page, _LISTING_MAX_PAGES + 1):
            if batch_key:
                progress.set_cursor("infojobs", batch_key, {
                    "stack_idx": stack_idx, "stack": stack, "page": page,
                })
            # ``Page`` com P maiusculo: o lowercase eh ignorado pelo backend.
            url = (
                f"https://www.infojobs.com.br/empregos.aspx"
                f"?palabra={encoded}&Page={page}"
            )
            response = await fetch(client, url)
            if response is None or response.status_code != 200:
                break

            soup = BeautifulSoup(response.text, "html.parser")
            cells = soup.find_all("div", class_="js_vacancyLoad")
            if not cells:
                break  # paginacao esgotou

            new_count = 0
            for cell in cells:
                href = cell.get("data-href")
                if not href:
                    continue
                # InfoJobs entrega URLs no formato vaga-de-{titulo}-em-{cidade}__{id}.
                # Quando a cidade vem vazia, a URL fica vaga-de-X-em-__id.aspx;
                # essas paginas existem (HTTP 200) mas o site nao serve JSON-LD
                # nelas (versao degradada). Sem JSON-LD o parser nao consegue
                # extrair nada e a URL vira refetch_empty no proximo passe.
                # Descartar no listing economiza requests + tira ruido do tracker.
                if "-em-__" in href or "_em-__" in href:
                    continue
                full = f"https://www.infojobs.com.br{href}"
                if full not in seen:
                    seen.add(full)
                    tracker.discover(full, engine="infojobs")
                    links.append(full)
                    new_count += 1
            if new_count == 0:
                break  # pagina so com duplicatas - resultset esgotou

    if batch_key:
        await progress.clear("infojobs", batch_key)

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
            client = await get_session()
            response = await fetch(client, link)
            if response is None or response.status_code != 200:
                return None
            parsed = _parse_job_detail(response.text, link)
            if parsed is not None and on_job is not None:
                try:
                    await on_job(parsed)
                except Exception as exc:
                    import logging
                    logging.getLogger("scraper.engine.infojobs").exception(
                        "on_job_error", extra={"url": link, "errorMessage": str(exc)}
                    )
            return parsed

    results = await asyncio.gather(*(_fetch(l) for l in links))
    jobs = [r for r in results if r is not None]
    print(f"Foram obtidas {len(jobs)} vagas do site InfoJobs")
    return jobs


async def refetch_one(url: str) -> list | None:
    """Reprocessa uma URL específica do InfoJobs (passe de reenrichment)."""
    client = await get_session()
    response = await fetch(client, url)
    if response is None or response.status_code != 200:
        return None
    return _parse_job_detail(response.text, url)


# --- Modo debug ----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_infojobs_jobs())[:10]:
        print(j)

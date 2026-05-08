"""
Engine Gupy - usa a API pública ``portal.api.gupy.io/api/v1/jobs``.

Fluxo simples: para cada stack do lote ativo, faz uma chamada à API
filtrando por ``jobName``. A API devolve até 1000 vagas em uma resposta -
não há paginação no nosso lado.

A normalização (mapeamento de ``workplaceType`` e ``type``) usa dicts
explícitos para o leitor entender o domínio sem ler a docs da Gupy.
"""
from __future__ import annotations

import os
import sys
import urllib.parse
from urllib.parse import urlparse, urlunparse

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from variavel import get_active_stacks  # noqa: E402
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.utils.http_session import HttpSession, fetch  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


PARSER_VERSION = "gupy-2026.05.08"


def is_partial(job_data: dict) -> bool:
    """Gupy nunca fica em ``partial``.

    Toda a coleta vem da API publica ``portal.api.gupy.io/api/v1/jobs`` em
    uma chamada por stack. Nao existe pagina de detalhe a refetchar - o
    payload da API e o estado mais completo possivel da vaga. Por isso a
    engine nao expoe ``refetch_one``.

    Campos vazios (salary, skills) sao naturais quando a vaga Gupy nao
    publica - refetch nao traria nada.
    """
    return False


# --- Sessão (padrão httpx compartilhado) ---------------------------------

_SESSION = HttpSession()


async def get_session():
    return await _SESSION.get_client()


def reset_session() -> None:
    _SESSION.reset()


# --- Mapeamentos do domínio Gupy → vocabulário interno --------------------

WORK_TYPES = {
    "remote": "Remoto",
    "hybrid": "Híbrido",
    "on-site": "Presencial",
}

REGIME_TYPES = {
    "vacancy_type_effective": "Efetivo",
    "vacancy_legal_entity": "Pessoa Jurídica",
    "vacancy_type_associate": "Associado",
    "vacancy_type_talent_pool": "Banco de Talentos",
    "vacancy_type_lecturer": "Docente",
    "vacancy_type_autonomous": "Autônomo",
    "vacancy_type_temporary": "Temporário",
    "vacancy_type_internship": "Estágio",
}


# --- Helpers privados -----------------------------------------------------

def _normalize_job_url(url: str) -> str:
    """Conserta URLs com ``&`` no host (bug ocasional da Gupy).

    Exemplo: ``empresa&etc.gupy.io`` → ``empresa.gupy.io``.
    """
    if not url:
        return url
    if not url.startswith("http"):
        url = f"https://{url}"
    parsed = urlparse(url)
    host = parsed.netloc
    if host.endswith(".gupy.io") and "&" in host:
        host = host.split("&", 1)[0] + ".gupy.io"
        parsed = parsed._replace(netloc=host)
        return urlunparse(parsed)
    return url


def _parse_job_item(item: dict) -> list:
    """Converte um item da API Gupy no formato canônico das engines.

    Args:
        item: dict bruto vindo do array ``data`` da resposta da API.

    Returns:
        Lista canônica de 8 campos.
    """
    link = _normalize_job_url(item.get("jobUrl", ""))
    title = item.get("name", "")
    company = item.get("careerPageName", "")

    work_type_raw = item.get("workplaceType", "")
    work_type = WORK_TYPES.get(work_type_raw, work_type_raw) if work_type_raw else ""

    regime_raw = item.get("type", "")
    hiring_regime = REGIME_TYPES.get(regime_raw, regime_raw) if regime_raw else ""

    city = item.get("city") or ""
    state = item.get("state") or ""
    if city and state:
        location = f"{city} - {state}"
    else:
        location = city or state

    # Data ISO → DD/MM/YYYY
    date_raw = (item.get("publishedDate") or "")[:10]
    if len(date_raw) == 10 and "-" in date_raw:
        y, m, d = date_raw.split("-")
        publication_date = f"{d}/{m}/{y}"
    else:
        publication_date = date_raw

    # A API listing já devolve a descrição completa em ``description`` -
    # texto sem tags na maioria das vagas, mas com entidades HTML eventuais
    # (``&nbsp;``); ``strip_html`` resolve via BeautifulSoup.
    description = strip_html(item.get("description", ""))
    skills = extract_skills(description) if description else []

    return apply_description_fallbacks([
        link, title, company, location, work_type, hiring_regime, "", publication_date,
        skills, description,
    ])


# --- Função pública -------------------------------------------------------

async def get_gupy_jobs(on_job=None) -> list:
    """Busca vagas na API da Gupy para cada stack do lote ativo.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga.
                Quando definido (modo controller), a engine emite as vagas em
                streaming - útil pra persistir antes de a engine terminar.

    Returns:
        Lista no formato canônico ``[link, title, company, location,
        work_type, hiring_regime, salary, publication_date]``.
    """
    jobs: list = []
    seen: set[str] = set()

    client = await get_session()
    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        url = f"https://portal.api.gupy.io/api/v1/jobs?jobName={encoded}&limit=1000"
        response = await fetch(client, url)
        if response is None or response.status_code != 200:
            continue

        for item in response.json().get("data", []):
            parsed = _parse_job_item(item)
            job_url = parsed[0]
            if not job_url or job_url in seen:
                continue
            seen.add(job_url)
            tracker.discover(job_url, engine="gupy")
            jobs.append(parsed)
            if on_job is not None:
                try:
                    await on_job(parsed)
                except Exception:
                    pass

    print(f"Foram obtidas {len(jobs)} vagas do site Gupy")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    import asyncio

    for j in asyncio.run(get_gupy_jobs())[:10]:
        print(j)

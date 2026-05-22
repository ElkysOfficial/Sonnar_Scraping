"""
Engine Careerjet Brasil - API oficial de busca (search.api.careerjet.net/v4).

Substitui o antigo scraping de HTML do site careerjet.com.br pela API v4
autenticada. A API devolve as vagas ja estruturadas em JSON, entao nao ha
fase de "fetch de detalhe": cada item do response e uma vaga completa.

Autenticacao
------------
Basic Auth onde o *usuario* e a chave de API e a *senha* e uma string vazia.
A chave esta vinculada a um IP autorizado (o IP do VPS) - chamadas de outro
IP falham. Configure ``CAREERJET_API_KEY`` no .env.

Foco PT-BR
----------
* ``locale_code=pt_BR`` restringe ao indice brasileiro.
* Cobertura geografica: para cada stack roda-se uma busca nacional (sem
  ``location`` - captura as vagas marcadas como "Brasil"/remoto e o pais
  inteiro) MAIS uma busca por cada uma das 27 UFs. Assim os estados de
  baixo volume nao sao ofuscados pelos grandes (SP/RJ/MG) no ranking por
  data. Vagas repetidas entre variantes sao unidas por dedup de URL. Ver
  ``_LOCATION_VARIANTS``.
* ``_looks_portuguese()`` descarta anuncios cujo conteudo esta claramente
  em ingles (vagas remotas internacionais que vazam no indice BR).

A API entrega ``description`` como *excerto* (parametro ``fragment_size``),
nao o texto integral - por isso esta engine e listing-only (sem
``refetch_one``) e ``is_partial`` sempre devolve False, igual ao Jooble.
"""
from __future__ import annotations

import asyncio
import os
import sys
from email.utils import parsedate_to_datetime

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_stacks  # noqa: E402
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402

# Em modo standalone (python -m src.engines.careerjet) o .env ainda nao foi
# carregado pelo scrapy.py - garante a chave de API tambem nesse cenario.
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


PARSER_VERSION = "careerjet-api-2026.05.22"


# --- Configuracao --------------------------------------------------------

_API_URL = "https://search.api.careerjet.net/v4/query"

# Chave de API (Basic Auth: usuario=chave, senha=vazia). Vinculada ao IP
# autorizado do VPS - definir no .env como CAREERJET_API_KEY.
_API_KEY = os.getenv("CAREERJET_API_KEY", "")

# locale do indice. pt_BR = Brasil / portugues (foco atual do projeto).
_LOCALE_CODE = os.getenv("CAREERJET_LOCALE", "pt_BR")

# IP autorizado para a chave + user agent: ambos sao parametros GET
# OBRIGATORIOS da API. O IP precisa ser o mesmo que a chave autoriza.
_USER_IP = os.getenv("CAREERJET_USER_IP", "82.25.68.106")
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)
# Header Referer e obrigatorio: a pagina de onde a chamada se origina.
_REFERER = os.getenv("CAREERJET_REFERER", "https://elkys.com.br/find-jobs/")

# Paginacao: a API devolve 20 vagas por pagina (o parametro page_size e
# ignorado nesta chave) e aceita 'page' de 1 a 10. _MAX_PAGES define quantas
# paginas buscar por stack/UF - cada pagina = +20 vagas, ordenadas por data.
# Variantes de baixo volume (estados pequenos) param sozinhas na 1a pagina.
_MAX_PAGES = int(os.getenv("CAREERJET_MAX_PAGES", "3"))
# Tamanho do excerto da descricao (default da API e so 120 chars).
_FRAGMENT_SIZE = int(os.getenv("CAREERJET_FRAGMENT_SIZE", "2000"))

# Variantes de busca por localidade aplicadas a cada stack. A primeira
# ("" = sem parametro 'location') e a busca NACIONAL: cobre o pais inteiro
# e as vagas marcadas apenas como "Brasil" (remoto/nacional). As demais sao
# as 27 UFs - garantem que estados de menor volume entrem na coleta mesmo
# quando o ranking nacional por data e dominado por SP/RJ/MG. Estados sem
# vagas para a stack simplesmente devolvem 0 (uma request barata).
_LOCATION_VARIANTS = (
    "",  # busca nacional (inclui "Brasil"/remoto)
    "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará",
    "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso",
    "Mato Grosso do Sul", "Minas Gerais", "Pará", "Paraíba", "Paraná",
    "Pernambuco", "Piauí", "Rio de Janeiro", "Rio Grande do Norte",
    "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina",
    "São Paulo", "Sergipe", "Tocantins", "Distrito Federal",
)

# Retry para falhas transitorias (5xx / timeout).
_MAX_RETRIES = 3


class _CareerjetConfigError(RuntimeError):
    """Erro irrecuperavel de configuracao (credenciais, locale, IP)."""


def is_partial(job_data: dict) -> bool:
    """Careerjet (API) nunca fica em ``partial``.

    A API ja entrega cada vaga estruturada no response - nao existe pagina
    de detalhe canonica para reenriquecer (``url`` e um redirect
    ``jobviewtrack.com`` para o site de origem). Campos vazios (salary,
    hiring_regime) sao naturais quando o anunciante nao os informou.
    """
    return False


# --- Filtro de idioma (foco PT-BR) ---------------------------------------

# Marcadores de portugues: palavras funcionais entre espacos (para casar
# como palavra inteira) e termos de conteudo tipicos de anuncios de vaga.
_PT_MARKERS = (
    " de ", " da ", " do ", " das ", " dos ", " para ", " com ", " em ",
    " que ", " uma ", " um ", " na ", " no ", " ou ", " voce ", " você ",
    "experiência", "experiencia", "conhecimento", "desenvolvedor", "vaga",
    "requisitos", "atividades", "responsabilidades", "trabalho", "salário",
    "benefícios", "empresa", "área", "equipe", "nível", "atuação",
)
# Marcadores de ingles equivalentes.
_EN_MARKERS = (
    " the ", " and ", " for ", " with ", " you ", " we ", " our ", " are ",
    " will ", " your ", " job ", " role ", " team ", " of ", " to ",
    "experience", "requirements", "responsibilities", "developer",
    "knowledge", "benefits", "company", "skills", "looking for",
)
# Diacriticos praticamente exclusivos do portugues - sinal forte.
_PT_DIACRITICS = "ãõçáàâêéíóôú"


def _looks_portuguese(text: str) -> bool:
    """Heuristica: a vaga aparenta estar escrita em portugues?

    Conservadora de proposito - so devolve False quando o texto tem massa
    clara de marcadores ingleses superando os portugueses. Texto curto ou
    ambiguo cai em True (mantem), ja que ``locale_code`` ja e ``pt_BR``.
    """
    if not text:
        return True
    low = " " + text.lower() + " "
    pt = sum(low.count(m) for m in _PT_MARKERS)
    en = sum(low.count(m) for m in _EN_MARKERS)
    if any(ch in low for ch in _PT_DIACRITICS):
        pt += 3
    # Ingles so "vence" com vantagem clara e massa minima de marcadores.
    if en >= 3 and en > pt:
        return False
    return True


# --- Helpers de parsing --------------------------------------------------

def _parse_date(raw: str) -> str:
    """``'Wed,15 Nov 2025 19:13:43 GMT'`` -> ``'15/11/2025'``.

    Devolve string vazia se a data nao puder ser interpretada.
    """
    if not raw:
        return ""
    try:
        dt = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return ""
    return dt.strftime("%d/%m/%Y") if dt is not None else ""


def _build_salary(job: dict) -> str:
    """Monta a string de salario a partir dos campos da API.

    Prefere o campo ``salary`` ja formatado; senao reconstroi de
    ``salary_min``/``salary_max``/``salary_currency_code``. A normalizacao
    fina (``process_salary``) acontece depois, no pipeline do controller.
    """
    salary = (job.get("salary") or "").strip()
    if salary:
        return salary
    currency = job.get("salary_currency_code") or "BRL"
    mn = job.get("salary_min")
    mx = job.get("salary_max")
    if mn and mx:
        return f"{currency} {mn}" if mn == mx else f"{currency} {mn} - {mx}"
    if mn:
        return f"{currency} {mn}"
    return ""


def _build_location(raw: str) -> list:
    """``'São Paulo - SP'`` / ``'Recife, PE'`` -> ``['cidade', 'UF']``.

    A API usa ``' - '`` (ou virgula) como separador cidade/UF.
    ``'Brasil'`` (nivel pais) ou vazio -> lista vazia: nao e localidade
    util e o ``apply_description_fallbacks`` pode minerar algo melhor.
    """
    if not raw:
        return []
    cleaned = raw.strip()
    if cleaned.lower() in ("brasil", "brazil"):
        return []
    cleaned = cleaned.replace(" - ", ",")
    parts = [p.strip() for p in cleaned.split(",") if p.strip()]
    return parts[:2]


def _work_type(title: str, location: list) -> str:
    """Modalidade derivada do titulo + localidade.

    Sem campo dedicado na API - o ``apply_description_fallbacks`` ainda
    pode promover para Remoto/Hibrido a partir da descricao.
    """
    blob = title.lower()
    if "remoto" in blob or "remote" in blob or "home office" in blob or "home-office" in blob:
        return "Remoto"
    if "híbrido" in blob or "hibrido" in blob or "hybrid" in blob:
        return "Híbrido"
    if location:
        return "Presencial"
    return "Remoto"


def _parse_job(job: dict, seen: set) -> list | None:
    """Converte um item da API na lista canonica de 10 campos.

    Returns:
        Lista canonica, ou ``None`` se for duplicata, faltar url/titulo, ou
        o conteudo nao aparentar estar em portugues.
    """
    url = (job.get("url") or "").strip()
    if not url or url in seen:
        return None

    title = (job.get("title") or "").strip()
    if not title:
        return None

    description = strip_html(job.get("description") or "")

    # Filtro PT-BR: descarta vagas cujo conteudo esta claramente em ingles.
    if not _looks_portuguese(f"{title} {description}"):
        return None

    seen.add(url)

    company = (job.get("company") or "").strip()
    location = _build_location(job.get("locations") or "")
    work_type = _work_type(title, location)
    salary = _build_salary(job)
    publication_date = _parse_date(job.get("date") or "")
    skills = extract_skills(description) if description else []

    return apply_description_fallbacks([
        url, title, company, location, work_type,
        "", salary, publication_date,
        skills, description,
    ])


# --- Chamada a API -------------------------------------------------------

async def _fetch_page(
    client: httpx.AsyncClient, stack: str, page: int, location: str,
) -> tuple:
    """Faz uma chamada a API para ``stack``/``location``/``page``.

    Args:
        location: UF a filtrar, ou string vazia para busca nacional.

    Returns:
        Tupla ``(jobs, total_pages)``. ``jobs`` e ``None`` se a chamada
        falhou apos os retries; lista vazia se a busca nao casou (ex.: modo
        LOCATIONS) ou nao trouxe vagas.

    Raises:
        _CareerjetConfigError: em HTTP 400/403 (locale invalido, credenciais
            ou parametros obrigatorios ausentes) - inutil continuar.
    """
    params = {
        "locale_code": _LOCALE_CODE,
        "keywords": stack,
        "sort": "date",
        "page": page,
        "fragment_size": _FRAGMENT_SIZE,
        "user_ip": _USER_IP,
        "user_agent": _USER_AGENT,
    }
    if location:
        params["location"] = location
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            resp = await client.get(
                _API_URL, params=params, headers={"Referer": _REFERER},
            )
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt == _MAX_RETRIES:
                return None, 0
            await asyncio.sleep(2.0 * attempt)
            continue

        if resp.status_code in (400, 403):
            raise _CareerjetConfigError(
                f"HTTP {resp.status_code}: {resp.text[:200]}"
            )
        if resp.status_code != 200:
            if attempt == _MAX_RETRIES:
                return None, 0
            await asyncio.sleep(2.0 * attempt)
            continue

        try:
            data = resp.json()
        except ValueError:
            return None, 0

        # type=LOCATIONS (busca ambigua / sem correspondencia de localidade)
        # nao traz vagas - apenas seguimos para a proxima variante.
        if data.get("type") != "JOBS":
            return [], 0

        return data.get("jobs") or [], int(data.get("pages") or 1)

    return None, 0


# --- Funcao publica ------------------------------------------------------

async def get_careerjet_jobs(on_job=None) -> list:
    """Coleta vagas do Careerjet via API oficial, por stack do lote ativo.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                emitida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canonico de 10 campos.
    """
    if not _API_KEY:
        print("[careerjet] CAREERJET_API_KEY ausente no .env - engine ignorada")
        return []

    jobs: list = []
    seen: set[str] = set()
    auth = httpx.BasicAuth(_API_KEY, "")
    timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=5.0)

    async with httpx.AsyncClient(auth=auth, timeout=timeout) as client:
        for stack in get_active_stacks():
            for location in _LOCATION_VARIANTS:
                total_pages = 1
                page = 1
                while page <= min(total_pages, _MAX_PAGES):
                    try:
                        page_jobs, total_pages = await _fetch_page(
                            client, stack, page, location,
                        )
                    except _CareerjetConfigError as exc:
                        print(f"[careerjet] erro de configuracao, abortando: {exc}")
                        print(f"Foram obtidas {len(jobs)} vagas do site careerjet")
                        return jobs

                    if not page_jobs:
                        break

                    for raw in page_jobs:
                        try:
                            parsed = _parse_job(raw, seen)
                        except Exception:
                            continue
                        if parsed is None:
                            continue
                        tracker.discover(parsed[0], engine="careerjet")
                        jobs.append(parsed)
                        if on_job is not None:
                            try:
                                await on_job(parsed)
                            except Exception:
                                pass

                    page += 1
                    await asyncio.sleep(0.25)

    print(f"Foram obtidas {len(jobs)} vagas do site careerjet")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    found = asyncio.run(get_careerjet_jobs())
    print(f"Total: {len(found)}")
    for j in found[:10]:
        print(j)

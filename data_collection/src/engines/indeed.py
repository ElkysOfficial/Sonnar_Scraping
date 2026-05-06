"""
Engine Indeed Brasil - listing → fetch detalhe (JSON-LD) por vaga.

Fluxo:
    1. ``get_indeed_links()`` - paginação (2 páginas × 50 vagas) por stack
       do lote ativo, acumulando ``data-jk`` únicos.
    2. ``get_indeed_jobs()`` - resolve cada link em paralelo (semáforo=5)
       parseando o JSON-LD ``JobPosting`` (com fallback HTML, e fallback
       final de Playwright via ``utils.browser_fetch`` quando o curl_cffi
       é bloqueado).

Por que ``curl_cffi`` e não ``utils.http_session``: o Indeed bloqueia clientes
HTTP "comuns" (httpx, requests) com 403 ou desafio JavaScript. O TLS-fingerprint
de ``impersonate='chrome120'`` é o que mantém o listing acessível. Quando ainda
assim cai 403/blocked, recorremos ao Playwright (``utils.browser_fetch``).
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import re
import sys
import urllib.parse

from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_stacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


# --- Sessão ---------------------------------------------------------------

_session = None


def get_session():
    """Retorna a sessão global, criando-a sob demanda.

    IMPORTANTE: não adicionamos headers personalizados.
    ``impersonate='chrome120'`` já configura todos os headers corretos -
    headers extras conflitam e causam 403.
    """
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome120")
    return _session


def reset_session() -> None:
    """Descarta a sessão atual (use após bloqueios em sequência)."""
    global _session
    _session = None


# --- Configuração --------------------------------------------------------

_REGIME_MAP = {
    "FULL_TIME": "CLT",
    "PART_TIME": "Meio Período",
    "CONTRACTOR": "PJ",
    "TEMPORARY": "Temporário",
    "INTERN": "Estágio",
}

# Inferência de regime a partir do texto livre (título + descrição) quando
# o JSON-LD não traz ``employmentType``. Ordem de preferência: combinações
# explícitas (CLT/PJ) → CLT → PJ → Estágio → Temporário → Meio Período.
# Ordem de prioridade: combinações explícitas primeiro, depois sinais
# fortes (CLT/PJ explícito), depois sinais derivados (Job Type: X, Tempo
# integral, etc.). "Aprendiz" antes de "Estágio" pra evitar "estágio" matchar
# em "estágio probatório de aprendiz". "Meio Período" antes de CLT pra Indeed
# distinguir "Tempo parcial" de "Tempo integral" antes de mapear pra CLT.
_REGIME_PATTERNS = [
    ("CLT/PJ", re.compile(r"\b(CLT\s*[/ou]+\s*PJ|PJ\s*[/ou]+\s*CLT)\b", re.IGNORECASE)),
    ("CLT", re.compile(r"\bCLT\b|\bcarteira\s+assinada\b|\bregime\s+celetista\b", re.IGNORECASE)),
    ("PJ", re.compile(
        r"\bPJ\b|\bpessoa\s+jur[ií]dica\b|contrata[çc][ãa]o\s+(?:no\s+modelo\s+)?PJ|"
        r"job\s*type\s*:\s*contractor|\bcontractor\b|freelanc(?:e|er)|self[-\s]?employed|"
        # "Full-time Contract", "Position type: Contract", "Contract Position",
        # "Fixed-term contract" - tudo PJ/contractor mesmo que diga "full-time"
        r"\b(?:full[\s\-]?time\s+contract|contract\s+(?:position|role|engagement)|"
        r"position\s*type\s*:\s*(?:full[\s\-]?time\s+)?contract|fixed[\s\-]?term\s+contract|"
        r"contract\s+(?:short|long)\s+term|short[\s\-]?term\s+contract|long[\s\-]?term\s+contract)\b",
        re.IGNORECASE,
    )),
    ("Aprendiz", re.compile(r"\b(jovem\s+aprendiz|aprendiz\s+legal)\b", re.IGNORECASE)),
    ("Estágio", re.compile(
        r"\b(est[áa]gio|estagi[áa]ri[oa]|intern(?:ship)?|job\s*type\s*:\s*intern)\b",
        re.IGNORECASE,
    )),
    ("Temporário", re.compile(
        r"\b(tempor[áa]ri[oa]|contrato\s+tempor[áa]rio|temporary|fixed[-\s]?term)\b",
        re.IGNORECASE,
    )),
    ("Meio Período", re.compile(
        r"\b(meio\s+per[íi]odo|tempo\s+parcial|part[\s\-]?time|"
        r"job\s*type\s*:\s*part[\s\-]?time)\b",
        re.IGNORECASE,
    )),
    # "Tempo integral"/Full-time costuma indicar CLT no Indeed BR (a maioria).
    # Coloca por último pra não preempt CLT/PJ explícito ou estágio.
    ("CLT", re.compile(
        r"\b(tempo\s+integral|full[\s\-]?time|job\s*type\s*:\s*full[\s\-]?time|"
        r"effective[-\s]hire|efetiv(?:o|a))\b",
        re.IGNORECASE,
    )),
]


def _infer_regime_from_text(*texts: str) -> str:
    """Detecta regime de contratação a partir de qualquer texto livre.

    Olha apenas sinais EXPLÍCITOS (o usuário escreveu CLT, PJ, contractor,
    estágio, tempo integral, etc). Para sinais derivados (benefícios, moeda)
    e default por ``work_type``, ver ``_infer_regime_with_heuristics``.
    """
    blob = " \n ".join(t for t in texts if t)
    if not blob:
        return ""
    for label, pat in _REGIME_PATTERNS:
        if pat.search(blob):
            return label
    return ""


# Sinais fortes de CLT no Brasil: benefícios trabalhistas. Empresa que
# oferece ≥ 2 desses na descrição quase certamente é vínculo celetista.
_CLT_BENEFIT_RE = re.compile(
    r"\b(vale\s+(?:refei[çc][ãa]o|alimenta[çc][ãa]o|transporte)|"
    r"\bVR\b|\bVA\b|\bVT\b|plano\s+de\s+sa[úu]de|plano\s+odontol[óo]gico|"
    r"f[ée]rias\s+(?:remunerada|anuais)|13[ºo°]\s*sal[áa]rio|d[ée]cimo\s+terceiro|"
    r"FGTS|seguro\s+de\s+vida)\b",
    re.IGNORECASE,
)

# Salário em moeda estrangeira ou anualizado → quase sempre PJ/Contractor
# para vaga BR. Filtra "USD" e padrões "$X,000/year", "annual salary".
_PJ_CURRENCY_RE = re.compile(
    r"\b(USD|US\$|\$\s*\d|annual\s+salary|per\s+annum|/\s*year|/\s*hr|hourly\s+rate)\b",
    re.IGNORECASE,
)


def _infer_regime_with_heuristics(
    title: str,
    description: str,
    work_type: str,
    *,
    enable_default: bool = True,
) -> str:
    """Pipeline em 3 camadas para inferir ``hiring_regime``.

    1. Sinais explícitos (CLT, PJ, contractor, estágio, ...) - ver
       ``_infer_regime_from_text``.
    2. Sinais derivados:
         - 2+ benefícios trabalhistas (VR/VA/VT/plano/13º/FGTS) → CLT.
         - Moeda estrangeira ou salário anualizado → PJ.
    3. Default por ``work_type`` (se ``enable_default``):
         - Presencial / Híbrido sem sinal → CLT (padrão legal BR).
         - Remoto sem sinal → vazio (ambíguo, prefere honesto a chutar).

    Returns:
        Rótulo do regime ou ``""`` se nada se aplicar.
    """
    explicit = _infer_regime_from_text(title, description)
    if explicit:
        return explicit

    blob = (title or "") + " \n " + (description or "")

    benefit_matches = len(_CLT_BENEFIT_RE.findall(blob))
    if benefit_matches >= 2:
        return "CLT"

    if _PJ_CURRENCY_RE.search(blob):
        return "PJ"

    if not enable_default:
        return ""

    wt = (work_type or "").lower()
    if wt in ("presencial", "híbrido", "hibrido"):
        return "CLT"
    return ""


# Tokens de país já presentes na string de localidade. Quando ``city.name``
# do JSON-LD vier com país embutido (raro no Indeed BR, comum em multi-país),
# evita-se anexar "Brasil" cego e duplicar a informação.
_COUNTRY_TOKEN_RE = re.compile(
    r"\b(brasil|brazil|portugal|estados\s+unidos|united\s+states|usa|"
    r"argentina|chile|m[eé]xico|mexico|colombia|col[oô]mbia|peru|"
    r"reino\s+unido|united\s+kingdom|canada|canad[aá])\b",
    re.IGNORECASE,
)


def _has_country_token(text: str) -> bool:
    return bool(_COUNTRY_TOKEN_RE.search(text or ""))


# Detecção de bloqueio:
#   - Título da pagina e o sinal mais confiavel - paginas de challenge tem
#     ``<title>Security Check</title>``, ``Just a moment...``, etc.
#   - HTML curto + captcha → interstitial.
# O snippet ``/cdn-cgi/challenge-platform/`` aparece em TODA pagina
# Cloudflare-protegida (JS de telemetria), inclusive nas que passaram - logo
# nao serve como sinal de bloqueio.
_BLOCK_TITLE_RE = re.compile(
    r"<title[^>]*>\s*(security\s+check|just\s+a\s+moment|attention\s+required|"
    r"access\s+denied|please\s+verify|verificando|verifying\s+you\s+are\s+human|"
    r"acessar\s*\|\s*contas\s+indeed|sign\s+in|cloudflare|"
    r"checking\s+your\s+browser)",
    re.IGNORECASE,
)

# Frases de challenge mesmo fora do <title> (corpo da pagina).
_BLOCK_BODY_RE = re.compile(
    r"(verifying\s+you\s+are\s+human|please\s+complete\s+the\s+security|"
    r"checking\s+your\s+browser\s+before|enable\s+javascript\s+and\s+cookies)",
    re.IGNORECASE,
)


def _looks_blocked(html: str) -> bool:
    if not html:
        return True
    if len(html) < 3000 and "captcha" in html.lower():
        return True
    if _BLOCK_TITLE_RE.search(html):
        return True
    if _BLOCK_BODY_RE.search(html):
        return True
    return False


# Defesa em profundidade: titulos de vaga que sao na verdade textos de
# challenge / login / erro. Se o parser extrair qualquer um desses como
# ``job_title``, descartamos a vaga inteira em vez de salvar lixo.
_INVALID_TITLE_RE = re.compile(
    r"^\s*(security\s+check|just\s+a\s+moment|attention\s+required|"
    r"access\s+denied|verificando|verifying|cloudflare|sign\s+in|"
    r"acessar|forbidden|not\s+found|404|403|503|page\s+not\s+available|"
    r"erro|error|please\s+verify)\s*\.?\s*$",
    re.IGNORECASE,
)


def _is_invalid_title(title: str) -> bool:
    """True quando ``title`` claramente nao e um titulo de vaga real."""
    if not title or len(title.strip()) < 3:
        return True
    return bool(_INVALID_TITLE_RE.match(title.strip()))


# --- Helpers privados ----------------------------------------------------

def _parse_jsonld_jobposting(soup) -> dict | None:
    """Extrai dados estruturados do bloco ``<script type=application/ld+json>``.

    Returns:
        Dict com chaves ``title``, ``company``, ``location``, ``work_type``,
        ``hiring_regime``, ``salary``, ``publication_date`` - ou ``None`` se
        não houver JSON-LD válido.
    """
    script = soup.find("script", type="application/ld+json")
    if not script:
        return None

    try:
        data = json.loads(script.text)
    except Exception:
        return None

    job_title = data.get("title", "")
    if not job_title or _is_invalid_title(job_title):
        return None

    hiring_org = data.get("hiringOrganization", {})
    company = hiring_org.get("name", "") if isinstance(hiring_org, dict) else ""

    # ``jobLocation`` pode vir como dict OU lista de dicts (vagas multi-cidade).
    job_location = data.get("jobLocation", {})
    if isinstance(job_location, list):
        job_location = job_location[0] if job_location else {}
    address = job_location.get("address", {}) if isinstance(job_location, dict) else {}
    locality = address.get("addressLocality", "") or ""
    region = address.get("addressRegion", "") or ""
    country_iso = (address.get("addressCountry") or "")
    if isinstance(country_iso, dict):
        country_iso = country_iso.get("name") or ""
    country_iso = str(country_iso).strip().upper()

    job_location_type = data.get("jobLocationType", "")
    loc_lower = locality.lower()
    data_str = str(data).lower()

    is_remote = (
        job_location_type == "TELECOMMUTE"
        or loc_lower in ("remoto", "remote")
        or "remoto" in loc_lower
        or "remote" in loc_lower
    )

    if is_remote:
        # Indeed BR (br.indeed.com) sempre é Brasil. Mantemos um sentinel
        # legível ("Remoto - Brasil") para o location_normalizer extrair
        # ``country_code='BR'`` sem inventar uma UF inexistente.
        location = ["Remoto", "Brasil"]
        work_type = "Remoto"
    else:
        if region:
            location = [locality, region]
        elif locality:
            location = [locality]
        else:
            location = []
        # Garante que ``country_code`` seja resolvido mesmo sem UF na string:
        # adiciona "Brasil" quando o JSON-LD confirmar BR e a string não
        # contiver UF/país. O normalizer já trata duplicação de país via
        # match por substring, então o append é seguro.
        if country_iso == "BR" and location and not _has_country_token(" ".join(location)):
            location.append("Brasil")

        if "híbrido" in loc_lower or "hibrido" in loc_lower or "hybrid" in data_str:
            work_type = "Híbrido"
        else:
            work_type = "Presencial"

    employment_type = data.get("employmentType", "")
    if isinstance(employment_type, list):
        employment_type = employment_type[0] if employment_type else ""
    hiring_regime = _REGIME_MAP.get(employment_type, "") if employment_type else ""

    # Salário
    salary = ""
    base_salary = data.get("baseSalary")
    if base_salary and isinstance(base_salary, dict):
        currency = base_salary.get("currency", "BRL")
        value = base_salary.get("value", {})
        if isinstance(value, dict):
            min_val = value.get("minValue", value.get("value", ""))
            max_val = value.get("maxValue", min_val)
            if min_val and max_val and min_val != max_val:
                salary = f"{currency} {min_val} - {max_val}"
            elif min_val:
                salary = f"{currency} {min_val}"
        elif value:
            salary = f"{currency} {value}"

    # Data ISO -> DD/MM/YYYY
    date_posted = data.get("datePosted", "")
    date_raw = date_posted[:10] if date_posted else ""
    if date_raw and len(date_raw) == 10 and "-" in date_raw:
        parts = date_raw.split("-")
        publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
    else:
        publication_date = date_raw

    description = strip_html(data.get("description", ""))
    skills = extract_skills(description) if description else []

    # Pipeline de inferência (explícito → benefícios → moeda → default por
    # work_type). Sobrescreve o ``employmentType`` genérico do JSON-LD apenas
    # quando o texto trouxer um regime mais específico (ex.: PJ explícito).
    inferred = _infer_regime_with_heuristics(job_title, description, work_type)
    if inferred and (not hiring_regime or inferred in ("CLT/PJ", "PJ", "Estágio", "Aprendiz", "Temporário", "Meio Período")):
        if not hiring_regime or inferred != "CLT":
            hiring_regime = inferred
    if not hiring_regime and inferred:
        hiring_regime = inferred

    return {
        "title": job_title,
        "company": company,
        "location": location,
        "work_type": work_type,
        "hiring_regime": hiring_regime,
        "salary": salary,
        "publication_date": publication_date,
        "skills": skills,
        "description": description,
    }


def _parse_html_fallback(soup) -> dict | None:
    """Fallback de parsing direto do HTML quando o JSON-LD está ausente.

    Captura título (meta), empresa (data-attr) e localização (page title).
    """
    title_meta = soup.find("meta", {"id": "indeed-share-message"})
    job_title = title_meta.get("content", "") if title_meta else ""
    if not job_title:
        page_title = soup.find("title")
        if page_title:
            job_title = page_title.text.split(" - ")[0].strip()
    if not job_title or _is_invalid_title(job_title):
        return None

    # Empresa
    company_div = soup.find("div", attrs={"data-company-name": True})
    if company_div:
        company = company_div.get("data-company-name", "")
        if company == "true" or not company:
            company = company_div.get_text(strip=True)
    else:
        company = ""

    # Localização (vinda do <title> da página)
    location: list = []
    page_title = soup.find("title")
    if page_title:
        parts = page_title.text.split(" - ")
        if len(parts) >= 2:
            location_part = parts[-2].strip()
            if location_part.lower() != "indeed.com":
                if "," in location_part:
                    city, state = location_part.rsplit(",", 1)
                    location = [city.strip(), state.strip()]
                elif location_part.lower() != "remoto":
                    location = [location_part]

    page_text = soup.get_text().lower()
    title_text = job_title.lower() if job_title else ""

    if "remoto" in title_text or "remote" in title_text or "remoto" in str(location).lower():
        work_type = "Remoto"
        # Sentinel para o normalizer detectar BR (br.indeed.com).
        location = ["Remoto", "Brasil"]
    elif "híbrido" in page_text or "hibrido" in page_text or "hybrid" in page_text:
        work_type = "Híbrido"
        if location and not _has_country_token(" ".join(location)):
            location.append("Brasil")
    else:
        work_type = "Presencial"
        if location and not _has_country_token(" ".join(location)):
            location.append("Brasil")

    # Fallback: extrai descrição do bloco principal e roda extract_skills
    description = ""
    desc_block = soup.find("div", id="jobDescriptionText")
    if desc_block:
        description = strip_html(str(desc_block))
    skills = extract_skills(description) if description else []

    hiring_regime = _infer_regime_with_heuristics(job_title, description, work_type)

    return {
        "title": job_title,
        "company": company,
        "location": location,
        "work_type": work_type,
        "hiring_regime": hiring_regime,
        "salary": "",
        "publication_date": "",
        "skills": skills,
        "description": description,
    }


async def _try_browser_fetch(url: str) -> str | None:
    """Import lazy de ``utils.browser_fetch`` — Playwright é dependência opcional.

    Sem Playwright instalado, devolve ``None`` silenciosamente (caímos no
    comportamento legado: a vaga é descartada quando curl_cffi for bloqueado).
    """
    try:
        from src.utils.browser_fetch import fetch_html  # noqa: WPS433 (import dentro da função)
    except Exception:
        return None
    try:
        return await fetch_html(url, wait_until="domcontentloaded", timeout_ms=30000)
    except Exception:
        return None


async def _fetch_html_with_fallback(url: str, *, timeout: int = 30) -> str | None:
    """Busca HTML via curl_cffi; em 403/429/bloqueio, recorre ao Playwright.

    O Playwright (``utils.browser_fetch.fetch_html``) é caro (renderização),
    então só é usado quando o ``curl_cffi`` falha — o caminho rápido (TLS
    fingerprint Chrome) cobre a maior parte do tráfego.
    """
    session = get_session()
    try:
        response = await asyncio.to_thread(session.get, url, timeout=timeout)
        status = response.status_code
        text = response.text or ""
        if status == 200 and not _looks_blocked(text):
            return text
        if status in (403, 429) or _looks_blocked(text):
            html = await _try_browser_fetch(url)
            if html and not _looks_blocked(html):
                return html
        return None
    except Exception:
        html = await _try_browser_fetch(url)
        return html if html and not _looks_blocked(html) else None


async def _fetch_job_detail(link: str, semaphore: asyncio.Semaphore) -> list | None:
    """Busca a página de detalhe e devolve a lista canônica.

    Tenta JSON-LD primeiro; se falhar, faz fallback de parsing direto no HTML.
    """
    async with semaphore:
        await asyncio.sleep(random.uniform(0.3, 0.8))
        html = await _fetch_html_with_fallback(link, timeout=30)
        if not html:
            return None

        try:
            soup = BeautifulSoup(html, "html.parser")
            data = _parse_jsonld_jobposting(soup) or _parse_html_fallback(soup)
            if not data:
                return None

            return [
                link,
                data["title"],
                data["company"],
                data["location"],
                data["work_type"],
                data["hiring_regime"],
                data["salary"],
                data["publication_date"],
                data.get("skills", []),
                data.get("description", ""),
            ]
        except Exception:
            return None


# --- Fase 1: coleta de links ---------------------------------------------

# O Indeed BR exige login na pagina 2 (`start=50` redireciona pra /Acessar).
# Como compensacao, fazemos varias buscas por stack com filtros diferentes -
# cada uma devolve sua propria "primeira pagina" com conteudo distinto.
#
# Mantemos so 3 variantes ortogonais pra economizar rate-budget pro detail
# fetch (que tambem e bloqueado se gastarmos demais no listing). Trade-off:
# menos buckets no listing -> mais % de vagas resolvidas no detalhe.
_LISTING_VARIANTS = [
    "&sort=date",         # mais recentes (baixo overlap com relevancia)
    "&jt=fulltime",       # CLT/efetivos
    "&jt=contract",       # PJ/contractors
]


async def _fetch_listing(url: str, seen: set, links: list) -> bool:
    """Busca um listing e adiciona JKs novos a ``links`` (in-place).

    Returns:
        True se obteve resposta valida; False se a pagina caiu em login/erro
        (sinal pra abortar o loop daquela variante).
    """
    html = await _fetch_html_with_fallback(url, timeout=30)
    if not html:
        return False

    soup = BeautifulSoup(html, "html.parser")
    title = soup.find("title")
    if title and "acessar" in title.text.lower():
        return False  # Indeed pediu login, descartamos

    # Selectors de fallback - Indeed alterna entre eles dependendo do A/B test.
    cells = soup.find_all("div", class_="job_seen_beacon")
    if not cells:
        cells = soup.select("[data-testid*='jobCard']") or [soup]

    found = 0
    # Busca todos os data-jk (independente de wrapper) - mais robusto contra
    # mudancas no DOM do listing.
    for link_elem in soup.find_all("a", attrs={"data-jk": True}):
        jk = link_elem.get("data-jk")
        if jk and jk not in seen:
            seen.add(jk)
            links.append(f"https://br.indeed.com/viewjob?jk={jk}")
            found += 1
    return found > 0 or bool(cells)


# Regex que captura o blob ``window.mosaic.providerData['mosaic-provider-jobcards']``
# do listing - tras todas as ~15 vagas do resultset com title/company/location/
# snippet/jobkey/salary ja resolvidos. Eliminar o detail-fetch para o caminho
# rapido: cada vaga e construida 100% a partir do listing.
_MOSAIC_BLOB_RE = re.compile(
    r"window\.mosaic\.providerData\[[\"']mosaic-provider-jobcards[\"']\]\s*=\s*(\{.+?\})\s*;",
    re.DOTALL,
)


def _parse_jobcards(html: str) -> list[dict]:
    """Extrai a lista de vagas do JSON embutido no listing do Indeed.

    Returns:
        Lista de dicts, um por vaga, com todos os campos canonicos ja
        resolvidos (title/company/location/work_type/regime/skills/snippet).
        Lista vazia se o blob nao existir ou parse falhar.
    """
    m = _MOSAIC_BLOB_RE.search(html)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except Exception:
        return []
    results = (
        data.get("metaData", {})
        .get("mosaicProviderJobCardsModel", {})
        .get("results", [])
    )

    out: list[dict] = []
    for r in results:
        title = (r.get("title") or "").strip()
        if _is_invalid_title(title):
            continue
        jk = r.get("jobkey")
        if not jk:
            continue

        company = (r.get("company") or "").strip()

        # location: jobLocationCity + jobLocationState. Indeed marca remoto via
        # ``remoteLocation: true`` (sem cidade) ou ``formattedLocation = "Remoto"``.
        is_remote = bool(r.get("remoteLocation")) or (
            (r.get("formattedLocation") or "").lower() in ("remoto", "remote")
        )
        city = (r.get("jobLocationCity") or "").strip()
        state = (r.get("jobLocationState") or "").strip()
        if is_remote:
            location = ["Remoto", "Brasil"]
            work_type = "Remoto"
        else:
            location = [p for p in (city, state) if p]
            if location:
                location.append("Brasil")
            work_type = "Presencial"
            # detecta hibrido pelos taxoAttributes / formattedLocation
            fl = (r.get("formattedLocation") or "").lower()
            if "híbrido" in fl or "hibrido" in fl or "hybrid" in fl:
                work_type = "Híbrido"

        # employmentType vem em jobTypes (lista de strings normalizadas)
        job_types = r.get("jobTypes") or []
        regime = ""
        if isinstance(job_types, list) and job_types:
            jt = str(job_types[0]).upper()
            regime = _REGIME_MAP.get(jt, "")

        # snippet (HTML curto com bullets) - usado pra extrair skills e tambem
        # vai pro campo description como fallback quando detail-fetch falhar.
        snippet_html = r.get("snippet") or ""
        snippet_text = strip_html(snippet_html)

        # Reforca regime via texto se jobTypes nao trouxe nada definitivo
        inferred = _infer_regime_with_heuristics(title, snippet_text, work_type)
        if inferred and (not regime or inferred in ("CLT/PJ", "PJ", "Estágio", "Aprendiz", "Temporário", "Meio Período")):
            if not regime or inferred != "CLT":
                regime = inferred
        if not regime and inferred:
            regime = inferred

        # salario do snippet structurado
        salary = ""
        ss = r.get("salarySnippet") or {}
        if isinstance(ss, dict):
            salary = (ss.get("text") or ss.get("salary") or "").strip()

        # publication_date
        pub_date = ""
        try:
            ts_ms = r.get("pubDate")
            if ts_ms:
                from datetime import datetime, timezone as _tz
                dt = datetime.fromtimestamp(int(ts_ms) / 1000, tz=_tz.utc)
                pub_date = dt.strftime("%d/%m/%Y")
        except Exception:
            pass

        out.append({
            "url": f"https://br.indeed.com/viewjob?jk={jk}",
            "title": title,
            "company": company,
            "location": location,
            "work_type": work_type,
            "hiring_regime": regime,
            "salary": salary,
            "publication_date": pub_date,
            "skills": extract_skills(snippet_text) if snippet_text else [],
            "description": snippet_text,
        })
    return out


async def get_indeed_links() -> list:
    """Extrai links unicos de vaga combinando varias buscas por stack.

    Para cada stack ativa, roda os filtros em ``_LISTING_VARIANTS`` e
    acumula JKs unicos. A pagina 2 e abandonada (Indeed exige login),
    entao a multi-query compensa o limite de ~50 por busca.
    """
    links: list = []
    seen_jks: set = set()

    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        before = len(links)
        for variant in _LISTING_VARIANTS:
            await asyncio.sleep(random.uniform(0.4, 1.0))
            url = f"https://br.indeed.com/empregos?q={encoded}{variant}"
            try:
                ok = await _fetch_listing(url, seen_jks, links)
                if not ok:
                    # se uma variante caiu em login, reseta a sessao - pode ser
                    # rate-limit acumulado e a proxima variante funcionar.
                    reset_session()
                    await asyncio.sleep(random.uniform(1.0, 2.0))
            except Exception:
                continue
        gained = len(links) - before
        # Reset entre stacks pra evitar rate-limit acumulado em sessao longa.
        if gained == 0:
            reset_session()

    return links


# --- Fase 2 / Função pública ---------------------------------------------

# Concorrencia do enriquecimento de detalhe. Indeed bloqueia >2 simultaneas
# do mesmo IP. Nao e gargalo em throughput porque o listing ja traz tudo
# critico - detail e best-effort pra description completa + skills.
_DETAIL_CONCURRENCY = 2

# Limite de tentativas de detail-fetch antes de desistir e marcar a sessao
# como rate-limited (paramos de tentar pelo resto do ciclo).
_DETAIL_MAX_FAILURES = 8


async def _enrich_with_detail(card: dict, sem: asyncio.Semaphore, state: dict) -> None:
    """Tenta substituir ``description`` (snippet) e ``skills`` pela versao completa
    do detail-fetch. Falha silenciosa - mantem o snippet em caso de bloqueio.

    Mutate ``state['failures']`` pra contar bloqueios consecutivos. Quando
    excede ``_DETAIL_MAX_FAILURES``, desabilita o enriquecimento pro resto
    do ciclo (``state['disabled'] = True``) - economiza tempo e respeita
    o rate-limit.
    """
    if state.get("disabled"):
        return

    raw = await _fetch_job_detail(card["url"], sem)
    if not raw:
        state["failures"] = state.get("failures", 0) + 1
        if state["failures"] >= _DETAIL_MAX_FAILURES:
            state["disabled"] = True
        return

    # raw[9] e a description completa, raw[8] sao skills extraidas do texto cheio
    full_desc = raw[9] if len(raw) > 9 else ""
    full_skills = raw[8] if len(raw) > 8 else []

    # Aceita apenas se o detail trouxe descricao significativamente maior
    # que o snippet. Caso contrario, melhor manter o snippet limpo.
    if full_desc and len(full_desc) > len(card.get("description", "")) + 100:
        card["description"] = full_desc
    if full_skills:
        # mescla, preservando ordem e sem duplicatas
        seen = set(s.lower() for s in card.get("skills", []))
        merged = list(card.get("skills", []))
        for s in full_skills:
            if s.lower() not in seen:
                merged.append(s); seen.add(s.lower())
        card["skills"] = merged

    # reset contador apos um sucesso (rate-limit pode ter sido transitorio)
    state["failures"] = 0


async def get_indeed_jobs(on_job=None) -> list:
    """Coleta vagas do Indeed em duas camadas:

    1. **Listing JSON** (caminho rapido, 100% sucesso): extrai title, company,
       location, work_type, regime, salary, pubdate e snippet do blob
       ``mosaic-provider-jobcards`` - 1 request → ~15 vagas.

    2. **Detail enrichment** (best-effort): substitui o snippet pela
       descricao completa da pagina de detalhe e re-extrai skills do texto
       integral. Concorrencia baixa (2). Se acumular ``_DETAIL_MAX_FAILURES``
       bloqueios, desabilita o enriquecimento pro resto do ciclo - mantem
       o snippet como fallback aceitavel.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                ja enriquecida (ou com snippet, se enriquecimento falhar).

    Returns:
        Lista no formato canonico de 10 campos.
    """
    seen_jks: set = set()
    jobs: list = []
    detail_sem = asyncio.Semaphore(_DETAIL_CONCURRENCY)
    detail_state: dict = {"failures": 0, "disabled": False}

    async def _emit(card: dict) -> None:
        # tenta enriquecer description+skills com detail-fetch
        await _enrich_with_detail(card, detail_sem, detail_state)
        parsed = [
            card["url"], card["title"], card["company"], card["location"],
            card["work_type"], card["hiring_regime"], card["salary"],
            card["publication_date"], card["skills"], card["description"],
        ]
        jobs.append(parsed)
        if on_job is not None:
            try:
                await on_job(parsed)
            except Exception:
                pass

    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        for variant in _LISTING_VARIANTS:
            await asyncio.sleep(random.uniform(0.4, 1.0))
            url = f"https://br.indeed.com/empregos?q={encoded}{variant}"
            try:
                html = await _fetch_html_with_fallback(url, timeout=30)
            except Exception:
                continue
            if not html:
                reset_session()
                await asyncio.sleep(random.uniform(1.0, 2.0))
                continue

            cards = _parse_jobcards(html)
            new_cards = []
            for c in cards:
                jk = c["url"].rsplit("=", 1)[-1]
                if jk in seen_jks:
                    continue
                seen_jks.add(jk)
                new_cards.append(c)

            # Enriquecimento em paralelo (bounded pelo semaforo).
            await asyncio.gather(*(_emit(c) for c in new_cards))

    enriched = sum(1 for j in jobs if len(j[9]) > 400)
    print(
        f"Foram obtidas {len(jobs)} vagas do site Indeed "
        f"({enriched} com descricao completa, {len(jobs)-enriched} com snippet)"
    )
    return jobs


# Detail-fetch ainda existe para enriquecimento manual ou repair scripts -
# nao e mais usado no caminho default por causa do rate-limit do Cloudflare.
async def _legacy_get_indeed_jobs(on_job=None) -> list:  # pragma: no cover
    """Versao antiga (listing → links → detail-fetch). Mantida pra debugging."""
    jobs = []
    job_links = await get_indeed_links()
    semaphore = asyncio.Semaphore(2)

    async def _fetch_and_emit(link):
        """Resolve uma vaga e emite via callback (se configurado)."""
        parsed = await _fetch_job_detail(link, semaphore)
        if parsed is not None and on_job is not None:
            try:
                await on_job(parsed)
            except Exception:
                pass
        return parsed

    job_details = await asyncio.gather(*[_fetch_and_emit(l) for l in job_links])
    for job in job_details:
        if job is not None:
            jobs.append(job)

    print(f"Foram obtidas {len(jobs)} vagas do site Indeed")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_indeed_jobs())[:10]:
        print(j)

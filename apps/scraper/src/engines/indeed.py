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
from variavel import get_active_batch_key, get_active_stacks  # noqa: E402
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.persistence.progress_tracker import progress  # noqa: E402
from src.utils.http_session import fetch_sync  # noqa: E402
from src.utils.job_enrichment import enrich_canonical  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402

import logging
logger = logging.getLogger("scraper.engine.indeed")


# 2026-05-23 (v2.23.0): pipeline central. Indeed BR e sempre PT (so extracao).
PARSER_VERSION = "indeed-2026.05.23"


_MIN_USEFUL_DESCRIPTION = 200


def is_partial(job_data: dict) -> bool:
    """Decide se uma vaga Indeed deve ficar em ``partial``.

    A Indeed fornece description sempre via JSON-LD da pagina de detalhe;
    quando ela chega com tamanho razoavel a coleta esta no estado mais
    completo possivel. Campos opcionais que NAO devem disparar reenrichment:

    * ``salary`` vazio - apenas ~10% das vagas Indeed BR trazem ``baseSalary``
      (recrutadores raramente publicam faixa). Refetch nao melhora.
    * ``hiring_regime`` ausente - quando ``employmentType`` nao vem no
      JSON-LD, a engine cai em fallbacks por descricao; se ainda assim
      ficar vazio, e que o texto nao deu sinal forte (refetch nao ajuda).
    * ``skills`` vazio - mineradas da descricao; pode ficar curto quando
      o anuncio nao usa termos canonicos.

    Sinal real: ``description`` ausente/trivial (< 200 chars) - significa
    que JSON-LD e fallbacks DOM falharam. Ai sim refetch (incluindo o
    Playwright) pode salvar a coleta.
    """
    description = (job_data.get("description") or "").strip()
    return len(description) < _MIN_USEFUL_DESCRIPTION


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


# Extracao de localidade a partir do texto da descricao - usado como
# fallback quando o JSON-LD nao tem `addressLocality`/`addressRegion`.
# Padrao tipico no Indeed BR: "Local de Trabalho: Sao Paulo - SP",
# "Local: Curitiba/PR", "Cidade: Belo Horizonte", "Localizacao: Recife".
_DESC_LOCATION_RE = re.compile(
    r"\b(?:local(?:iza[çc][ãa]o)?(?:\s+da\s+vaga|\s+de\s+trabalho)?|cidade)\s*[:\-]\s*"
    r"([A-Za-zÀ-ÿ][\wÀ-ÿ\s\-']{2,60}?)"
    r"(?:\s*[/\-,]\s*([A-Z]{2}|[A-ZÀ-Ú][a-zA-ZÀ-ÿ\s]{2,30}?))?"
    r"(?=[\.\n;]|$)",
    re.IGNORECASE,
)


# Salario embutido na descricao - usado como fallback quando o JSON-LD nao
# tem ``baseSalary``. Padroes tipicos no Indeed BR:
#   "R$ 5.000,00 a R$ 7.500,00"
#   "Salario: R$ 5.000"
#   "Faixa salarial: R$ 4.000 - R$ 6.000"
#   "USD 60,000 - USD 90,000 / year"
_DESC_SALARY_BRL_RE = re.compile(
    r"R\$\s*([\d.,]+)\s*(?:a|at[ée]|[-–])\s*R\$\s*([\d.,]+)",
    re.IGNORECASE,
)
_DESC_SALARY_BRL_SINGLE_RE = re.compile(
    r"(?:sal[áa]rio|faixa\s+salarial|remunera[çc][ãa]o)\s*[:\-]\s*R\$\s*([\d.,]+)",
    re.IGNORECASE,
)
_DESC_SALARY_USD_RE = re.compile(
    r"(?:USD|US\$)\s*([\d.,]+)\s*(?:to|[-–])\s*(?:USD|US\$)?\s*([\d.,]+)",
    re.IGNORECASE,
)


def _extract_salary_from_description(description: str) -> str:
    """Minera faixa salarial do texto. Vazio se nada confiavel.

    Prefere range (X a Y) sobre valor unico. Conservador: ignora numeros
    soltos sem prefixo "R$" ou "USD" (evita pegar "200 vagas", anos, etc).
    """
    if not description:
        return ""
    m = _DESC_SALARY_BRL_RE.search(description)
    if m:
        return f"R$ {m.group(1).strip()} - R$ {m.group(2).strip()}"
    m = _DESC_SALARY_USD_RE.search(description)
    if m:
        return f"USD {m.group(1).strip()} - USD {m.group(2).strip()}"
    m = _DESC_SALARY_BRL_SINGLE_RE.search(description)
    if m:
        return f"R$ {m.group(1).strip()}"
    return ""


# Datas relativas no corpo da pagina ("Publicada ha 5 dias", "ha 2 horas").
# Convertemos pra DD/MM/YYYY usando a data atual de execucao.
_RELATIVE_DATE_RE = re.compile(
    r"h[áa]\s+(\d+)\s*\+?\s*(hora|h\b|dia|semana|m[êe]s|mes|ano)s?",
    re.IGNORECASE,
)


def _extract_relative_date(text: str) -> str:
    """Converte 'ha N dias/semanas/meses' em DD/MM/YYYY. Vazio se nada bater."""
    if not text:
        return ""
    m = _RELATIVE_DATE_RE.search(text)
    if not m:
        return ""
    from datetime import datetime as _dt, timedelta as _td
    n = int(m.group(1))
    unit = m.group(2).lower()
    if unit.startswith("h"):
        delta = _td(hours=n)
    elif unit.startswith("d"):
        delta = _td(days=n)
    elif unit.startswith("s"):
        delta = _td(weeks=n)
    elif unit.startswith("m"):
        delta = _td(days=30 * n)
    else:  # ano
        delta = _td(days=365 * n)
    pub = _dt.utcnow() - delta
    return pub.strftime("%d/%m/%Y")


def _extract_location_from_description(description: str) -> list:
    """Minera cidade/UF a partir da descricao quando o JSON-LD falhar.

    Retorna lista no formato [cidade] ou [cidade, UF]. Lista vazia se nada
    confiavel for encontrado. Conservador: prefere devolver vazio a chutar.
    """
    if not description:
        return []
    match = _DESC_LOCATION_RE.search(description)
    if not match:
        return []
    city = (match.group(1) or "").strip(" ,;:-/")
    state = (match.group(2) or "").strip(" ,;:-/")
    if len(city) < 3 or len(city) > 60:
        return []
    out = [city]
    if state and 2 <= len(state) <= 30:
        out.append(state)
    return out


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

    # work_type e location sao sinais ortogonais: uma vaga remota PODE ter
    # cidade-base (Home Office baseado em Recife). Antes da correcao, o
    # ``is_remote=True`` descartava ``locality``/``region`` e gravava o
    # sentinel "Remoto - Brasil". Agora preservamos a cidade quando vier.
    loc_parts: list = []
    if locality and locality.lower() not in ("remoto", "remote"):
        loc_parts.append(locality)
    if region:
        loc_parts.append(region)

    if is_remote:
        work_type = "Remoto"
    elif "híbrido" in loc_lower or "hibrido" in loc_lower or "hybrid" in data_str:
        work_type = "Híbrido"
    else:
        work_type = "Presencial"

    if loc_parts:
        location = loc_parts
        # ``country_code`` so eh resolvido pelo normalizer se a string contiver
        # token de pais/UF. Adicionamos "Brasil" quando o JSON-LD confirmar BR
        # e a string nao contiver pais. O normalizer ja deduplica por substring.
        if country_iso == "BR" and not _has_country_token(" ".join(location)):
            location.append("Brasil")
    elif is_remote:
        # Genuinamente sem cidade-base: sentinel para o normalizer extrair
        # country_code=BR sem inventar UF.
        location = ["Remoto", "Brasil"]
    else:
        location = []
        # Fallback: minera "Local de Trabalho: ..." da descricao quando o
        # JSON-LD nao trouxe locality/region nem flag de remoto.
        description_preview = strip_html(data.get("description", "") or "")
        mined = _extract_location_from_description(description_preview)
        if mined:
            location = mined
            if country_iso == "BR" and not _has_country_token(" ".join(location)):
                location.append("Brasil")

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

    # Fallbacks de campos que o JSON-LD costuma deixar vazio no Indeed BR.
    if not salary:
        salary = _extract_salary_from_description(description)
    if not publication_date:
        publication_date = _extract_relative_date(description)

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

    # Quando o <title> nao deu cidade, tenta minerar da descricao.
    if not location and description:
        mined = _extract_location_from_description(description)
        if mined:
            location = mined
            if not _has_country_token(" ".join(location)):
                location.append("Brasil")

    hiring_regime = _infer_regime_with_heuristics(job_title, description, work_type)

    # Salario e data: minera da descricao + texto bruto da pagina (Indeed
    # mostra "ha N dias" fora do bloco de descricao em alguns layouts).
    salary = _extract_salary_from_description(description)
    publication_date = _extract_relative_date(description) or _extract_relative_date(page_text)

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
        response = await fetch_sync(session, url, timeout=timeout)
        if response is None:
            html = await _try_browser_fetch(url)
            return html if html and not _looks_blocked(html) else None
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


async def fetch_indeed_detail(url: str) -> dict | None:
    """Busca a pagina /viewjob e devolve dict com os campos da vaga.

    Camadas (do mais confiavel pro mais frouxo):
      1. JSON-LD ``JobPosting`` (preferido - schema.org oficial).
      2. Parser HTML direto (selectors estaveis: ``#jobDescriptionText``,
         ``meta#indeed-share-message``, ``[data-company-name]``).
      3. Mineracao da descricao para preencher ``location`` e ``hiring_regime``
         quando o JSON-LD vem com cidade/regime vazios.

    Retorna ``None`` quando o HTML esta bloqueado (challenge/login) ou nao
    contem JSON-LD nem estrutura HTML reconhecivel - sinal pra o caller
    resetar a sessao.
    """
    html = await _fetch_html_with_fallback(url, timeout=30)
    if not html:
        return None
    try:
        soup = BeautifulSoup(html, "html.parser")
        return _parse_jsonld_jobposting(soup) or _parse_html_fallback(soup)
    except Exception:
        return None


async def _fetch_job_detail(link: str, semaphore: asyncio.Semaphore) -> list | None:
    """Wrapper legado (lista canonica). Mantido pelo ``_legacy_get_indeed_jobs``."""
    async with semaphore:
        await asyncio.sleep(random.uniform(0.3, 0.8))
        data = await fetch_indeed_detail(link)
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


# --- Fase 1: coleta de links ---------------------------------------------

# O Indeed BR redireciona ``start=N`` pra /Acessar (login obrigatorio na
# pagina 2). Como nao da pra paginar, expandimos via variantes ortogonais:
# cada filtro devolve a "primeira pagina" do recorte respectivo, e a uniao
# (com dedup por jobkey) cobre 2-3x mais vagas que uma busca unica.
#
# Volume medido com q=Python (mai/2026): 8 variantes -> ~120 vagas unicas
# vs 45 com 3 variantes. Variantes inclusas foram selecionadas por novelty
# real (>4 vagas novas em medicao); descartadas: explvl_mid/senior, salary,
# radius_100 (todas com 0 novas vs baseline).
#
# Trade-off: mais variantes = mais requests de listing = mais chance de
# rate-limit do Cloudflare antes do detail-fetch. 8 e o sweet spot atual -
# acima disso o Cloudflare costuma bloquear o detail.
_LISTING_VARIANTS = [
    "&sort=date",            # mais recentes (baseline ortogonal a relevancia)
    "&jt=fulltime",          # CLT/efetivos
    "&jt=contract",          # PJ/contractors
    "&jt=internship",        # estagios
    "&jt=parttime",          # meio-periodo
    "&jt=temporary",         # temporarios
    "&fromage=1",            # ultimas 24h (alta novidade vs baseline)
    "&explvl=entry_level",   # junior (corte demografico nao coberto pelos jt)
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
            url_v = f"https://br.indeed.com/viewjob?jk={jk}"
            tracker.discover(url_v, engine="indeed")
            links.append(url_v)
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

# Concorrencia do detail-fetch. Indeed bloqueia >2 simultaneas do mesmo IP;
# este limite e o teto seguro observado empiricamente.
_DETAIL_CONCURRENCY = 2

# Soft-block detection: quantos detail-fetches consecutivos podem falhar
# antes de fazer reset da sessao + cooldown. Padrao espelhado da engine
# da Catho (3 falhas -> reset + dorme 15-25s).
_SOFTBLOCK_THRESHOLD = 3
_SOFTBLOCK_COOLDOWN_SEC = (15.0, 25.0)


# Pre-filtro de relevancia tech: descarta vagas obviamente fora de TI antes
# de gastar request no detail. Espelha a estrategia da Catho - whitelist no
# titulo aceita direto; blacklist no titulo (sem whitelist) rejeita; default
# permissivo (mantem a vaga em duvida).
_TECH_WHITELIST_RE = re.compile(
    r"\b("
    r"desenvolved|programad|engenheir(?:o|a)\s+(?:de\s+)?(?:software|dados|computa|"
    r"sistema|machine|cloud|devops|sre|qa|teste|backend|frontend|fullstack|mobile)|"
    r"analista\s+(?:de\s+)?(?:sistem|dados|ti|tecnolog|qa|teste|seguran|"
    r"banco|infraestru|requisito|suporte|desenvolv|software)|"
    r"cientista\s+de\s+dados|arquitet[oa]\s+de\s+software|"
    r"dev(?:ops)?|qa\b|sre\b|dba\b|tech\s*lead|"
    r"back[- ]?end|front[- ]?end|full[- ]?stack|mobile\s+dev|"
    r"data\s+(?:scien|engin|analy)|machine\s+learning|"
    r"software|scrum\s+master|product\s+(?:manager|owner)|"
    r"php|python|javascript|typescript|laravel|django|flask|spring|"
    r"react|angular|vue|node|kotlin|swift|golang|ruby|rust|"
    r"\bsap\s+(?:abap|fiori|hana)|\bsalesforce\b"
    r")\b",
    re.IGNORECASE,
)

_TECH_BLACKLIST_RE = re.compile(
    r"\b("
    r"vendedor|atendente|operador\s+de\s+caixa|caixa\s+(?:de\s+)?(?:loja|supermerc)|"
    r"repositor|estoquista|a[çc]ougueiro|padeiro|confeiteir|"
    r"motoboy|motorista|"
    r"cozinheir|gar[çc]om|copeir|chapeir|"
    r"recepcionist|aux(?:iliar)?\s+administrativ|"
    r"pedreiro|servente|"
    r"enfermeir|t[ée]cnico\s+de\s+enfermag|farmac[êe]utic|"
    r"professor(?!\s+de\s+(?:tecnologia|inform[áa]tica|programac))|"
    r"servi[çc]o\s+de\s+limpeza|porteiro|"
    r"seguran[çc]a\s+patrimon|bab[áa]|cuidador|domestic"
    r")\b",
    re.IGNORECASE,
)


def _is_tech_relevant(title: str) -> bool:
    """True quando a vaga deve ser mantida; False rejeita.

    Whitelist explicita no titulo -> aceita. Blacklist sem whitelist -> rejeita.
    Sem match em nenhum -> aceita (default permissivo, evita falsos negativos
    em titulos genericos como "Analista de Sistemas Junior").
    """
    if not title:
        return True
    if _TECH_WHITELIST_RE.search(title):
        return True
    if _TECH_BLACKLIST_RE.search(title):
        return False
    return True


def _refine_work_type(current: str, title: str, description: str) -> str:
    """Re-avalia ``work_type`` apos ter a descricao completa do detail-fetch.

    Mantem o valor atual quando ja for ``Remoto``/``Hibrido`` (sinais fortes do
    JSON-LD nao devem ser sobrescritos). So promove ``Presencial`` -> ``Remoto``
    ou ``Hibrido`` quando a descricao trouxer evidencia clara.
    """
    if current in ("Remoto", "Híbrido"):
        return current
    blob = ((title or "") + " \n " + (description or "")).lower()
    if "100% remoto" in blob or "100% home office" in blob or "totalmente remoto" in blob:
        return "Remoto"
    if "trabalho remoto" in blob or "home office" in blob or "home-office" in blob:
        return "Remoto"
    if "híbrido" in blob or "hibrido" in blob or "modelo hibrido" in blob or "modelo híbrido" in blob:
        return "Híbrido"
    return current or "Presencial"


def _seed_to_canonical(seed: dict) -> list:
    """Converte um card do listing (seed) na lista canonica de 10 campos."""
    return [
        seed["url"], seed["title"], seed["company"], seed["location"],
        seed["work_type"], seed["hiring_regime"], seed["salary"],
        seed["publication_date"], seed.get("skills") or [],
        seed.get("description") or "",
    ]


def _merge_detail_over_seed(seed: dict, detail: dict) -> list:
    """Aplica os campos do detail-fetch sobre o seed do listing.

    O detail tem precedencia (descricao completa, JSON-LD oficial). O seed
    cobre lacunas - util quando o detail vem com campos vazios em A/B test
    do Indeed.
    """
    return [
        seed["url"],
        detail.get("title") or seed["title"],
        detail.get("company") or seed["company"],
        detail.get("location") or seed["location"],
        detail.get("work_type") or seed["work_type"],
        detail.get("hiring_regime") or seed["hiring_regime"],
        detail.get("salary") or seed["salary"],
        detail.get("publication_date") or seed["publication_date"],
        detail.get("skills") or seed.get("skills") or [],
        detail.get("description") or seed.get("description") or "",
    ]


async def get_indeed_jobs(on_job=None) -> list:
    """Coleta vagas do Indeed em duas fases distintas:

    1. **Coleta de links** (listing): roda os filtros de ``_LISTING_VARIANTS``
       para cada stack ativa e acumula jobkeys unicos. Quando o blob
       ``mosaic-provider-jobcards`` esta presente, ja preservamos os campos
       parciais (title/company/location/snippet) como *seed* - serve de
       fallback se o detail-fetch falhar.

    2. **Detail-fetch por link** (caminho principal): para cada jobkey, faz
       GET em ``/viewjob?jk=<JK>``, parseia o ``<script type=ld+json>`` e cai
       no parser HTML quando o JSON-LD esta ausente. A descricao completa do
       detail alimenta a inferencia de ``hiring_regime`` e a mineracao de
       ``location`` quando o JSON-LD vem com cidade vazia.

    Concorrencia baixa (``_DETAIL_CONCURRENCY``) para respeitar rate-limit do
    Cloudflare. Falhas individuais sao silenciosas: caimos no seed do listing.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                resolvida (streaming).

    Returns:
        Lista no formato canonico de 10 campos.
    """
    # Fase 1: coleta de links + seeds do listing
    seeds: dict = {}  # jk -> dict com dados parciais do listing

    # ---- Checkpoint: retomada do ponto exato apos restart -----------------
    #
    # Granularidade: por (stack, variant). Indeed nao tem paginacao (so
    # 1 pagina por variant) — entao o cursor inclui o variant_idx em vez
    # de page. Retomada por LABEL da stack: descarta cursor se a stack
    # salva nao esta no batch atual.
    stacks_list = list(get_active_stacks())
    batch_key = get_active_batch_key()
    cursor = await progress.resume("indeed", batch_key) if batch_key else None

    resume_stack = (cursor or {}).get("stack")
    resume_variant_idx = int((cursor or {}).get("variant_idx", 0))
    resume_stack_idx = 0
    if cursor:
        try:
            resume_stack_idx = stacks_list.index(resume_stack) if resume_stack else 0
        except ValueError:
            cursor = None
            resume_variant_idx = 0

    if cursor:
        logger.info("indeed_resume", extra={
            "batch_key": batch_key,
            "stack": resume_stack, "stack_idx": resume_stack_idx,
            "variant_idx": resume_variant_idx,
        })

    for stack_idx, stack in enumerate(stacks_list):
        if stack_idx < resume_stack_idx:
            continue
        encoded = urllib.parse.quote(stack)
        # variant_idx so eh respeitado para a stack onde paramos
        start_variant_idx = (
            resume_variant_idx if stack_idx == resume_stack_idx else 0
        )
        for variant_idx, variant in enumerate(_LISTING_VARIANTS):
            if variant_idx < start_variant_idx:
                continue

            # Salva cursor APONTANDO PRA ESTA combinacao antes de executa-la.
            if batch_key:
                progress.set_cursor("indeed", batch_key, {
                    "stack_idx": stack_idx, "stack": stack,
                    "variant_idx": variant_idx, "variant": variant,
                })

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

            for card in _parse_jobcards(html):
                jk = card["url"].rsplit("=", 1)[-1]
                if jk and jk not in seeds:
                    seeds[jk] = card

    # Pre-filtro tech: remove vagas obviamente fora de TI antes de gastar
    # request no detail (Indeed bloqueia rapido com >2 paralelos).
    relevant = {jk: s for jk, s in seeds.items() if _is_tech_relevant(s.get("title", ""))}
    skipped_irrelevant = len(seeds) - len(relevant)

    if not relevant:
        if batch_key:
            await progress.clear("indeed", batch_key)
        print(
            f"Foram obtidas 0 vagas do site Indeed (descartadas {skipped_irrelevant} "
            "irrelevantes pelo filtro tech)"
        )
        return []

    # Fase 2: detail-fetch sequencial (sequencial garante soft-block detection
    # confiavel - paralelo mascara o sinal de bloqueio em rajada). Concorrencia
    # via semaforo=2 ainda assim, pra acelerar quando o site coopera.
    sem = asyncio.Semaphore(_DETAIL_CONCURRENCY)
    jobs: list = []
    stats = {"detail_ok": 0, "seed_only": 0, "softblock_resets": 0}
    softblock_streak = 0

    async def _resolve(jk: str, seed: dict) -> None:
        nonlocal softblock_streak
        async with sem:
            await asyncio.sleep(random.uniform(0.4, 1.0))
            detail = await fetch_indeed_detail(seed["url"])

            if detail:
                # Refina work_type quando o detail trouxe descricao completa.
                detail["work_type"] = _refine_work_type(
                    detail.get("work_type", ""),
                    detail.get("title") or seed.get("title", ""),
                    detail.get("description") or "",
                )
                parsed = _merge_detail_over_seed(seed, detail)
                stats["detail_ok"] += 1
                softblock_streak = 0
            else:
                # Detail bloqueado/ausente: emite o seed do listing como fallback
                # e conta o soft-block. Apos N seguidos, reseta sessao + cooldown.
                parsed = _seed_to_canonical(seed)
                stats["seed_only"] += 1
                softblock_streak += 1
                if softblock_streak >= _SOFTBLOCK_THRESHOLD:
                    reset_session()
                    stats["softblock_resets"] += 1
                    softblock_streak = 0
                    await asyncio.sleep(random.uniform(*_SOFTBLOCK_COOLDOWN_SEC))

            # Pos-processamento universal: minera campos faltantes da
            # descricao (salary, location, hiring_regime, work_type).
            # Trata "a combinar" como vazio e roda os fallbacks compartilhados.
            parsed = apply_description_fallbacks(parsed)
            # v3.6.0: skip vaga se enrichment falha — banco so contem PT.
            # Sem hint_lang: Indeed BR pode ter vagas EN de multinacionais.
            # Deixa detect_lang descobrir e traduzir se necessario.
            try:
                parsed = await enrich_canonical(parsed)
            except Exception as exc:
                logger.warning("[indeed] skip job=%s: enrichment falhou: %s", parsed[0] if parsed else "?", exc)
                continue

            jobs.append(parsed)
            if on_job is not None:
                try:
                    await on_job(parsed)
                except Exception:
                    pass

    await asyncio.gather(*(_resolve(jk, seed) for jk, seed in relevant.items()))

    # Ciclo completo: limpa o cursor pra o proximo batch comecar do zero.
    if batch_key:
        await progress.clear("indeed", batch_key)

    print(
        f"Foram obtidas {len(jobs)} vagas do site Indeed "
        f"({stats['detail_ok']} via detail-fetch, {stats['seed_only']} so listing, "
        f"{skipped_irrelevant} descartadas pelo filtro tech, "
        f"{stats['softblock_resets']} resets por soft-block)"
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


async def refetch_one(url: str) -> list | None:
    """Reprocessa uma URL específica do Indeed (passe de reenrichment)."""
    detail = await fetch_indeed_detail(url)
    if not detail or not detail.get("description"):
        return None
    seed = {"url": url, "title": detail.get("title", ""),
            "company": "", "location": "", "snippet": "",
            "work_type": "", "salary_raw": "", "publication_date": ""}
    detail["work_type"] = _refine_work_type(
        detail.get("work_type", ""),
        detail.get("title") or "",
        detail.get("description") or "",
    )
    parsed = _merge_detail_over_seed(seed, detail)
    return apply_description_fallbacks(parsed)


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_indeed_jobs())[:10]:
        print(j)

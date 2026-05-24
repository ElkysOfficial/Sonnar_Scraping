"""
Engine Catho - listing + enriquecimento via página de detalhe (Next.js).

Fontes de dados
---------------
* **Listing** (``<article class="offer">``): título, empresa, localização,
  salário, data - suficiente como fallback.
* **Página de detalhe** (Next.js): ``<script id="__NEXT_DATA__">`` expõe
  ``props.pageProps.jobAdData`` com ``descricao``, ``regimeContrato``
  ("CLT (Efetivo)"), ``data`` (ISO), ``contratante.nome`` e ``vagas[]``.
  Fallback: JSON-LD ``JobPosting`` na variante SSR.

Filtro de relevância
--------------------
A Catho retorna lixo quando a busca tem termo curto/ambíguo (``R``, ``Go``,
``C#``, ``BI``…). Aplicamos um filtro de duas camadas no título + slug:

* **Whitelist** (termos tech) → aceita direto.
* **Blacklist** (varejo/serviços) sem whitelist → rejeita.
* Default → aceita (não somos agressivos).

Tunáveis (env vars)
-------------------
``CATHO_FETCH_DETAIL`` (default ``1``) - habilita o GET extra na página de
detalhe para extrair descrição + skills.
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import re
import sys
import urllib.parse
from datetime import date, datetime, timezone

from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_batch_key, get_active_stacks  # noqa: E402
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.persistence.progress_tracker import progress  # noqa: E402
from src.utils.http_session import fetch_sync  # noqa: E402
from src.utils.job_enrichment import enrich_canonical  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills  # noqa: E402

import logging
logger = logging.getLogger("scraper.engine.catho")


# 2026-05-23 (v2.23.0): pipeline central. Catho e sempre PT.
PARSER_VERSION = "catho-2026.05.23"


_MIN_USEFUL_DESCRIPTION = 200


def is_partial(job_data: dict) -> bool:
    """Decide se uma vaga Catho deve ficar em ``partial``.

    A Catho enriquece o listing com a pagina de detalhe quando
    ``CATHO_FETCH_DETAIL=1``. Quando o detail responde, description e skills
    chegam preenchidos. Campos que NAO disparam reenrichment porque sao
    intrinsicamente opcionais na fonte:

    * ``salary`` vazio - apenas ~10% das vagas Catho trazem faixa salarial;
      a maioria fica como "a combinar". Refetch nao melhora.
    * ``hiring_regime`` ausente - cai no fallback derivado da descricao
      quando ``regimeContrato`` nao vem.

    Sinal real de incompleto: ``description`` ausente ou trivial (< 200
    chars). Indica falha no detail-fetch ou que o site so devolveu o card
    do listing.
    """
    description = (job_data.get("description") or "").strip()
    return len(description) < _MIN_USEFUL_DESCRIPTION


# --- Sessão ---------------------------------------------------------------

_session = None


def get_session():
    """Retorna a sessão global, criando-a sob demanda (impersonate Chrome).

    Não fazemos warm-up: a Catho serve uma variante CSR sem ``__NEXT_DATA__``
    quando a sessão tem cookies prévios. Sem warm-up, a primeira chamada
    retorna o HTML hidratado completo.
    """
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome")
    return _session


def reset_session() -> None:
    """Descarta a sessão atual (use após 3 respostas vazias seguidas)."""
    global _session
    _session = None


# --- Filtro de relevância tech --------------------------------------------

# Whitelist: títulos que claramente pertencem ao domínio. Match no título
# (não no slug - slug é menos confiável e contém ruído de URL).
_TECH_WHITELIST = re.compile(
    r"\b("
    r"desenvolved|programad|engenheir|"  # engenheiro também (mecânica/civil às vezes pega ferramentas tech)
    r"analista\s+(?:de\s+)?(?:sistem|dados|ti|tecnolog|qa|teste|seguran|engenhar|"
    r"banco|infraestru|requisito|suporte|desenvolv|software)|"
    r"cientista\s+de\s+dados|arquitet[oa]\s+de\s+software|"
    r"dev(?:ops)?|qa\b|sre\b|dba\b|tech\s*lead|"
    r"back[- ]?end|front[- ]?end|full[- ]?stack|mobile|"
    r"data\s+(?:scien|engin|analy)|machine\s+learning|"
    r"cloud|infra(?:estrutura)?|"
    r"software|tecnologia\s+da\s+informacao|tecnologia\s+da\s+informa[çc][ãa]o|"
    r"scrum\s+master|product\s+(?:manager|owner)|"
    r"administrador\s+de\s+banco|"
    r"php|python|javascript|typescript|laravel|django|flask|spring|"
    r"react|angular|vue|node|kotlin|swift|golang|ruby"
    r")\b",
    re.IGNORECASE,
)

# Blacklist: termos que indicam clara vaga não-tech. Aplicado no slug E no
# título; só rejeita se a whitelist NÃO bateu.
_TECH_BLACKLIST = re.compile(
    r"\b("
    r"comercio\s+e\s+varejo|varejo|"
    r"auxiliar\s+de\s+loja|gerente\s+de\s+loja|"
    r"vendedor|atendente|operador\s+de\s+caixa|caixa\s+(?:de\s+)?(?:loja|supermerc)|"
    r"repositor|estoquista|a[çc]ougueiro|padeiro|confeiteir|"
    r"motoboy|motorista|"
    r"cozinheir|garcom|gar[çc]om|copeir|chapeir|"
    r"recepcionist|aux(?:iliar)?\s+administrativ|"
    r"pedreiro|servente|eletricist[ao](?!\s+de\s+(?:rede|telecom))|"  # eletricista de rede/telecom é OK
    r"enfermeir|t[ée]cnico\s+de\s+enfermag|farmac[êe]utic|"
    r"professor|"
    r"servico\s+de\s+limpeza|servi[çc]o\s+de\s+limpeza|porteiro|"
    r"seguranca\s+patrimon|seguran[çc]a\s+patrimon|"
    r"bab[áa]|cuidador|domestic"
    r")\b",
    re.IGNORECASE,
)


def _is_tech_relevant(title: str, slug: str) -> bool:
    """``True`` se a vaga deve ser mantida; ``False`` rejeita.

    Estratégia: whitelist no título → aceita. Senão, blacklist no slug+título → rejeita.
    Sem match em nenhum dos dois → aceita (default permissivo).
    """
    title = title or ""
    slug = slug or ""
    if _TECH_WHITELIST.search(title):
        return True
    if _TECH_BLACKLIST.search(slug) or _TECH_BLACKLIST.search(title):
        return False
    return True


# --- Helpers de parsing ---------------------------------------------------

_RE_DATE_BR = re.compile(r"(\d{2})/(\d{2})")


def _parse_date_card(text: str) -> str:
    """``'Publicada em 30/04'`` → ``'30/04/2026'`` (ano corrigido se for futuro)."""
    if not text:
        return ""
    m = _RE_DATE_BR.search(text)
    if not m:
        return ""
    today = date.today()
    dd, mm = m.group(1), m.group(2)
    year = today.year
    try:
        if int(mm) > today.month or (int(mm) == today.month and int(dd) > today.day):
            year = today.year - 1
    except ValueError:
        pass
    return f"{dd}/{mm}/{year}"


def _format_iso_date(iso: str) -> str:
    """``'2026-04-29T23:59:59Z'`` → ``'29/04/2026'``."""
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).strftime("%d/%m/%Y")
    except (ValueError, AttributeError):
        return ""


def _detect_work_type(title: str, description: str = "") -> str:
    """Heurística por palavras no título e (se vier) descrição."""
    t = ((title or "") + " " + (description or "")).lower()
    if "remoto" in t or "home office" in t or "home-office" in t or "100% home" in t:
        return "Remoto"
    if "híbrido" in t or "hibrido" in t or "hybrid" in t:
        return "Híbrido"
    return "Presencial"


# --- Página de detalhe (__NEXT_DATA__ + JSON-LD) --------------------------

_RE_NEXT_DATA = re.compile(
    r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL
)
_RE_JSONLD = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
# Endereço embutido na descrição: "Local: Rua X, 123 - Bairro - Cidade/UF"
_RE_LOCAL_LINE = re.compile(
    r"(?:Local|Endere[çc]o)\s*:\s*([^\n\r]{5,250})", re.IGNORECASE
)
# "Itupeva/SP" ou "Itupeva - SP" no fim de uma linha
_RE_CITY_UF = re.compile(r"([A-Za-zÀ-ÿ' .]{2,40})\s*[/-]\s*([A-Z]{2})\b")


def _extract_next_data(html: str) -> dict:
    """Extrai o blob ``__NEXT_DATA__`` (Next.js) e devolve o dict bruto."""
    m = _RE_NEXT_DATA.search(html)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


def _extract_jsonld_jobposting(html: str) -> dict:
    """Procura bloco JSON-LD com ``@type=JobPosting`` (variante SSR da Catho)."""
    for m in _RE_JSONLD.finditer(html):
        try:
            data = json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            continue
        candidates = data if isinstance(data, list) else [data]
        for entry in candidates:
            if isinstance(entry, dict) and entry.get("@type") == "JobPosting":
                return entry
    return {}


def _extract_address_from_text(text: str) -> tuple[str, str, str]:
    """Procura ``Local:|Endereço:`` na descrição e devolve ``(addr, city, uf)``.

    Útil quando o JSON-LD da Catho devolve só a cidade-sede da empresa em vez
    do endereço da vaga.
    """
    if not text:
        return "", "", ""
    m = _RE_LOCAL_LINE.search(text)
    if not m:
        return "", "", ""
    line = m.group(1).strip()
    city_uf = _RE_CITY_UF.search(line)
    city = city_uf.group(1).strip() if city_uf else ""
    uf = city_uf.group(2) if city_uf else ""
    return line, city, uf


def _strip_html_lite(text: str) -> str:
    """Remove tags HTML básicas e normaliza whitespace."""
    if not text:
        return ""
    text = re.sub(r"<\s*br\s*/?\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</\s*(?:p|li|ul|ol|div|h[1-6])\s*>", "\n", text, flags=re.IGNORECASE)
    text = BeautifulSoup(text, "html.parser").get_text("\n")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _parse_job_detail(html: str) -> dict | None:
    """Extrai campos enriquecidos do HTML da página de detalhe.

    A Catho serve duas variantes:
      * **CSR Next.js** - ``__NEXT_DATA__`` com ``jobAdData`` (cidade da vaga
        precisa, em ``vagas[0]``).
      * **SSR clássico** - JSON-LD ``JobPosting`` (cidade pode ser a sede da
        empresa, não a da vaga). Fallback.

    Em ambos os casos, refinamos ``city/uf`` extraindo o ``Local:`` da
    descrição quando presente - é a fonte mais confiável.

    Retorna ``None`` quando nenhuma das variantes está presente. Isso indica
    soft-block do Akamai (HTML 200 mas sem dados estruturados da vaga) e o
    caller usa esse sinal para resetar a sessão.
    """
    data = _extract_next_data(html)
    has_jobaddata = bool(
        data and data.get("props", {}).get("pageProps", {}).get("jobAdData")
    )
    jp_jsonld = _extract_jsonld_jobposting(html) if not has_jobaddata else None

    if not has_jobaddata and not jp_jsonld:
        return None

    out: dict = {
        "title": "",
        "company": "",
        "description": "",
        "regime": "",
        "publication_date": "",
        "city": "",
        "uf": "",
        "street_address": "",
    }

    # --- Camada 1: __NEXT_DATA__ (preferida) ---
    if has_jobaddata:
        job = data.get("props", {}).get("pageProps", {}).get("jobAdData") or {}
        if isinstance(job, dict):
            out["title"] = (job.get("titulo") or "").strip()
            out["description"] = _strip_html_lite(job.get("descricao") or "")
            out["regime"] = (job.get("regimeContrato") or "").strip()
            out["publication_date"] = _format_iso_date(job.get("data") or "")
            contr = job.get("contratante") or {}
            if isinstance(contr, dict) and not contr.get("confidencial"):
                out["company"] = (contr.get("nome") or "").strip()
            vagas = job.get("vagas") or []
            if isinstance(vagas, list) and vagas and isinstance(vagas[0], dict):
                v0 = vagas[0]
                out["city"] = (v0.get("cidade") or "").strip()
                out["uf"] = (v0.get("uf") or "").strip()

    # --- Camada 2: JSON-LD (fallback se __NEXT_DATA__ ausente/incompleto) ---
    if not out["title"] or not out["description"]:
        jp = jp_jsonld or _extract_jsonld_jobposting(html)
        if jp:
            if not out["title"]:
                out["title"] = (jp.get("title") or "").strip()
            if not out["description"]:
                out["description"] = _strip_html_lite(jp.get("description") or "")
            if not out["regime"]:
                emp = jp.get("employmentType")
                if isinstance(emp, list):
                    emp = " ".join(emp)
                out["regime"] = str(emp or "").strip()
            if not out["publication_date"]:
                out["publication_date"] = _format_iso_date(jp.get("datePosted") or "")
            if not out["company"]:
                org = jp.get("hiringOrganization") or {}
                if isinstance(org, dict):
                    out["company"] = (org.get("name") or "").strip()
            if not out["city"] or not out["uf"]:
                loc = jp.get("jobLocation")
                if isinstance(loc, list):
                    loc = loc[0] if loc else None
                if isinstance(loc, dict):
                    addr = loc.get("address") or {}
                    if isinstance(addr, dict):
                        out["city"] = out["city"] or (addr.get("addressLocality") or "").strip()
                        out["uf"] = out["uf"] or (addr.get("addressRegion") or "").strip()

    # --- Camada 3: refinamento via "Local:" na descrição ---
    addr, city_d, uf_d = _extract_address_from_text(out["description"])
    if addr:
        out["street_address"] = addr
        # Se a descrição traz cidade/UF e diferem dos dados estruturados,
        # confiamos na descrição (cidade real da vaga, não sede da empresa).
        if city_d and uf_d:
            out["city"] = city_d
            out["uf"] = uf_d

    return out


async def fetch_job_detail(url: str, session=None) -> dict | None:
    """Busca a página de detalhe e devolve dict de enriquecimento.

    Retorna ``None`` quando o HTML não tem ``__NEXT_DATA__`` nem ``JobPosting``
    JSON-LD - sinal de soft-block do Akamai. O caller usa isso para resetar
    a sessão.
    """
    session = session or get_session()
    try:
        response = await fetch_sync(session, url, timeout=30)
        if response is None or response.status_code != 200:
            return None
        return _parse_job_detail(response.text)
    except Exception:
        return None


# --- Listing (cards) + função pública -------------------------------------

def _slug_from_url(url: str) -> str:
    """``/vagas/<slug>/<id>/`` → ``<slug>``."""
    m = re.search(r"/vagas/([^/]+)/", url)
    return m.group(1) if m else ""


def _parse_job_card(article) -> list | None:
    """Extrai uma vaga de um ``<article class="offer">``.

    Retorna lista canônica de 8 elementos (sem skills/description), ou ``None``
    se não tiver dados mínimos. Os campos 9-10 são preenchidos depois pelo
    enriquecimento da página de detalhe.
    """
    title_el = article.select_one("h2.title_offer a")
    if not title_el or not title_el.get("href"):
        return None

    href = title_el.get("href")
    if href.startswith("/"):
        href = "https://www.catho.com.br" + href

    job_title = title_el.get("title") or title_el.get_text(strip=True)
    if not job_title:
        return None

    company_el = article.select_one("span.text-12")
    company = company_el.get_text(strip=True) if company_el else ""

    location_str = ""
    for p in article.find_all("p"):
        if p.find("span", class_="i_job_location"):
            text = p.get_text(" ", strip=True)
            text = re.sub(r"^\d+\s*vagas?\s*-?\s*", "", text, flags=re.I)
            text = re.sub(r"^\s*-\s*", "", text)
            location_str = text.strip()
            break

    salary = ""
    for p in article.find_all("p"):
        if p.find("span", class_="i_salary"):
            strong = p.find("strong")
            if strong:
                salary = strong.get_text(" ", strip=True)
            break
    if not salary:
        salary = "A combinar"

    pub_tag = article.select_one("span.tag.pub_ontem, span.tag[class*='pub_']")
    pub_date = _parse_date_card(pub_tag.get_text(" ", strip=True)) if pub_tag else ""

    work_type = _detect_work_type(job_title)
    location = [location_str] if location_str else []

    return [href, job_title, company, location, work_type, "CLT", salary, pub_date]


async def get_catho_jobs(on_job=None) -> list:
    """Coleta vagas da Catho navegando o listing por stack/página.

    Args:
        on_job: callback opcional ``async fn(parsed_job)`` invocado a cada
                vaga parseada (modo streaming).

    Returns:
        Lista de vagas no formato canônico de 10 campos quando o detail
        fetch está ligado; 8 campos quando desligado.
    """
    jobs: list = []
    seen: set[str] = set()
    session = get_session()
    fetch_detail = os.getenv("CATHO_FETCH_DETAIL", "1") == "1"

    empty_stack_streak = 0
    softblock_streak = 0  # detail fetches consecutivos sem dados estruturados
    max_pages = 5

    # ---- Checkpoint: retomada do ponto exato apos restart -----------------
    #
    # Granularidade: por (stack, page) — mesmo padrao do Dice. Cada stack
    # pode varrer ate 5 paginas; sem checkpoint de pagina, refariamos todas
    # no restart. Retomada por LABEL da stack: descarta cursor se a stack
    # salva nao esta no batch atual.
    stacks_list = list(get_active_stacks())
    batch_key = get_active_batch_key()
    cursor = await progress.resume("catho", batch_key) if batch_key else None

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
        logger.info("catho_resume", extra={
            "batch_key": batch_key,
            "stack": resume_stack, "stack_idx": resume_stack_idx,
            "page": resume_page,
        })

    for stack_idx, stack in enumerate(stacks_list):
        if stack_idx < resume_stack_idx:
            continue
        encoded = urllib.parse.quote(stack)
        page = resume_page if stack_idx == resume_stack_idx else 1
        consecutive_empty_pages = 0
        added_for_stack = 0

        while page <= max_pages and consecutive_empty_pages < 2:
            # Salva cursor APONTANDO PRA ESTA pagina antes de executa-la.
            if batch_key:
                progress.set_cursor("catho", batch_key, {
                    "stack_idx": stack_idx, "stack": stack,
                    "page": page,
                })
            try:
                if page > 1:
                    await asyncio.sleep(random.uniform(0.5, 1.2))

                url = f"https://www.catho.com.br/vagas/{encoded}/?page={page}"
                response = await fetch_sync(session, url, timeout=30)

                if response is None or response.status_code != 200:
                    consecutive_empty_pages += 1
                    page += 1
                    continue

                soup = BeautifulSoup(response.text, "html.parser")
                articles = soup.find_all("article", class_="offer")

                if not articles:
                    consecutive_empty_pages += 1
                    page += 1
                    continue

                added_this_page = 0
                for art in articles:
                    parsed = _parse_job_card(art)
                    if not parsed:
                        continue
                    url_key = parsed[0]
                    if url_key in seen:
                        continue
                    seen.add(url_key)
                    tracker.discover(url_key, engine="catho")

                    # Filtro de relevância: rejeita varejo/serviços antes
                    # mesmo de gastar request na página de detalhe.
                    title = parsed[1]
                    slug = _slug_from_url(url_key)
                    if not _is_tech_relevant(title, slug):
                        continue

                    skills: list = []
                    description = ""
                    if fetch_detail:
                        detail = await fetch_job_detail(url_key, session)
                        if detail is None:
                            # Soft-block do Akamai: HTML 200 sem dados.
                            # Após 3 seguidos, reset agressivo e cooldown.
                            softblock_streak += 1
                            if softblock_streak >= 3:
                                reset_session()
                                session = get_session()
                                softblock_streak = 0
                                await asyncio.sleep(random.uniform(15, 25))
                        else:
                            softblock_streak = 0
                            if detail.get("description"):
                                description = detail["description"]
                                skills = extract_skills(description)
                            if detail.get("regime"):
                                parsed[5] = detail["regime"]
                            if detail.get("publication_date"):
                                parsed[7] = detail["publication_date"]
                            if detail.get("company") and not parsed[2]:
                                parsed[2] = detail["company"]
                            if detail.get("city") and detail.get("uf"):
                                parsed[3] = [f"{detail['city']} - {detail['uf']}"]
                            # work_type pode mudar agora que temos descrição
                            parsed[4] = _detect_work_type(title, description)
                        await asyncio.sleep(random.uniform(1.0, 2.0))

                    parsed_full = apply_description_fallbacks(parsed + [skills, description])
                    try:
                        parsed_full = await enrich_canonical(parsed_full, hint_lang="pt")
                    except Exception:
                        pass
                    jobs.append(parsed_full)
                    added_this_page += 1
                    added_for_stack += 1
                    if on_job is not None:
                        try:
                            await on_job(parsed_full)
                        except Exception:
                            pass

                consecutive_empty_pages = 0 if added_this_page else consecutive_empty_pages + 1
                page += 1

            except Exception:
                consecutive_empty_pages += 1
                page += 1

        if added_for_stack == 0:
            empty_stack_streak += 1
            if empty_stack_streak >= 3:
                reset_session()
                session = get_session()
                empty_stack_streak = 0
                await asyncio.sleep(random.uniform(8, 15))
        else:
            empty_stack_streak = 0

        await asyncio.sleep(random.uniform(0.8, 1.5))

    # Ciclo completo: limpa o cursor pra o proximo batch comecar do zero.
    if batch_key:
        await progress.clear("catho", batch_key)

    print(f"Foram obtidas {len(jobs)} vagas do site Catho")
    return jobs


async def refetch_one(url: str) -> list | None:
    """Reprocessa uma URL específica via fetch_job_detail.

    Usado pelo passe de reenrichment quando ``PARSER_VERSION`` muda.
    """
    session = get_session()
    detail = await fetch_job_detail(url, session)
    if not detail:
        return None
    description = detail.get("description") or ""
    skills = extract_skills(description) if description else []
    location_parts = []
    if detail.get("city"):
        location_parts.append(detail["city"])
    if detail.get("uf"):
        location_parts.append(detail["uf"])
    return apply_description_fallbacks([
        url,
        detail.get("title", ""),
        detail.get("company", ""),
        location_parts,
        _detect_work_type(detail.get("title", "")),
        detail.get("regime") or "CLT",
        "",
        detail.get("publication_date", ""),
        skills,
        description,
    ])


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    # Modo debug: passa URLs para testar parsing de detalhe.
    if len(sys.argv) > 1:
        async def _debug():
            session = get_session()
            for u in sys.argv[1:]:
                d = await fetch_job_detail(u, session)
                print(f"\n=== {u} ===")
                if d is None:
                    print("  (soft-block: HTML sem __NEXT_DATA__ nem JSON-LD)")
                    continue
                print(f"  title    : {d.get('title')}")
                print(f"  company  : {d.get('company')}")
                print(f"  city/uf  : {d.get('city')} / {d.get('uf')}")
                print(f"  regime   : {d.get('regime')}")
                print(f"  pub_date : {d.get('publication_date')}")
                desc = d.get("description", "")
                print(f"  desc     : {desc[:250]}{'...' if len(desc) > 250 else ''}")
                skills = extract_skills(desc)
                print(f"  skills   : {skills}")
                slug = _slug_from_url(u)
                print(f"  relevant : {_is_tech_relevant(d.get('title',''), slug)} (slug={slug})")
        asyncio.run(_debug())
    else:
        result = asyncio.run(get_catho_jobs())
        for j in result[:10]:
            print(j)

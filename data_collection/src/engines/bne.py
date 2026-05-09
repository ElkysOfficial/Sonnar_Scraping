"""
Engine BNE - listing → fetch detalhe (JSON-LD) por vaga, via cloudscraper.

A BNE usa proteção anti-bot que ``httpx`` não passa. Usamos ``cloudscraper``
que resolve o desafio JavaScript da Cloudflare-like.

Particularidade: a BNE **não suporta busca por texto livre** - apenas filtros
por área hardcoded. O site tem 28 áreas no total e somente ``informatica``
é tech. Por isso esta engine não participa do batching de stacks - cobre
sempre a mesma área e ganha volume via paginação profunda.

Fluxo:
    1. ``get_bne_job_ids()`` - pagina ``BNE_AREA`` até ``BNE_MAX_PAGES``,
       coletando job_ids únicos.
    2. ``get_bne_jobs()`` - resolve cada ID em paralelo (semáforo=10),
       parseando o ``<script type=application/ld+json>`` JobPosting.

Tunáveis (env vars):
    ``BNE_MAX_PAGES`` (default 50) - paginação máxima por área. Em medição
    empírica (mai/2026), Page=500 ainda devolve vagas distintas, mas o
    cutoff de 90 dias da camada de persistência derruba as antigas. 50
    páginas ≈ 950 vagas únicas, cobrindo confortavelmente vagas recentes.
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import re

import cloudscraper
from bs4 import BeautifulSoup

from ..persistence.extraction_tracker import tracker
from ..utils.http_session import fetch_sync
from ..utils.job_fallbacks import apply_description_fallbacks
from ..utils.text_utils import extract_skills, strip_html


PARSER_VERSION = "bne-2026.05.08"


# Tamanho minimo de descricao para considerar a vaga *coletada por completo*.
# A BNE entrega descricoes que variam de ~200 a ~1700 chars (depende de a empresa
# ter preenchido requisitos+atribuicoes ou apenas o resumo). Abaixo de 80 chars
# o JSON-LD tipicamente nao trouxe nada util e a vaga deve voltar pelo
# reenrichment. Acima disso, mesmo que curta, e o que o site oferece.
_MIN_USEFUL_DESCRIPTION = 80


def is_partial(job_data: dict) -> bool:
    """Decide se uma vaga BNE deve ficar em ``partial`` (volta pelo reenrichment).

    Vaga BNE e considerada *completa* (mesmo que alguns campos venham vazios)
    quando a descricao chegou. Campos que o site frequentemente nao publica
    e que NAO disparam reenrichment:

    * ``skills`` vazio - skills sao mineradas da descricao; quando o texto
      e curto/generico, a lista vem ``[]``. Refetch nao traz mais skills.
    * ``salary_min/max`` vazios - parte das vagas vem sem ``baseSalary`` no
      JSON-LD, e quando vem, costuma ser uma faixa generica do site (ex.
      "R$ 1000 - R$ 10000"). Refetch nao melhora.
    * ``hiring_regime`` ausente - quando ``employmentType`` falta no JSON-LD,
      caimos no default "Efetivo". Refetch traz a mesma coisa.

    Sinal real de vaga incompleta: descricao ausente ou trivial. Reenrichment
    pode ajudar quando o DOM mudou (ex.: layout A vs B) ou quando o fetch
    inicial bateu numa pagina de erro.
    """
    description = (job_data.get("description") or "").strip()
    return len(description) < _MIN_USEFUL_DESCRIPTION


# --- Sessão ---------------------------------------------------------------

_scraper_session = None


def _create_scraper():
    """Cria uma sessão do ``cloudscraper`` simulando Chrome no Windows."""
    return cloudscraper.create_scraper(
        browser={
            "browser": "chrome",
            "platform": "windows",
            "desktop": True,
        }
    )


def get_scraper():
    """Retorna a sessão global, criando-a sob demanda (Chrome/Windows)."""
    global _scraper_session
    if _scraper_session is None:
        _scraper_session = _create_scraper()
    return _scraper_session


def reset_session() -> None:
    """Descarta a sessão atual (use após bloqueios em sequência)."""
    global _scraper_session
    _scraper_session = None


# --- Configuração --------------------------------------------------------

# Slug oficial da única área tech do BNE. Verificado empiricamente em
# mai/2026: as áreas "Tecnologia", "Desenvolvimento", "Programador" e
# "Software" usadas anteriormente devolvem 0 vagas (não existem no
# catálogo do site). O slug é case-insensitive mas sem acento; com acento
# (``Inform%C3%A1tica``) o backend retorna um subconjunto reduzido.
BNE_AREA = "informatica"

# Limite de paginação por execução. Configurável via env var.
BNE_MAX_PAGES = int(os.getenv("BNE_MAX_PAGES", "50"))

def _extract_full_description(soup) -> str:
    """Extrai a descricao completa do DOM da pagina de detalhe da BNE.

    Estrategia (em ordem de preferencia):
      1. ``.requisitos__vaga`` + ``.atribuicoes__vaga`` quando presentes -
         vagas detalhadas dividem o texto nestes dois blocos e ele e mais
         completo que o resumo abaixo.
      2. ``.descricao__vaga`` - vagas simples colocam tudo num bloco unico.

    Retorna string vazia se nenhum dos blocos existir - o caller deve cair
    no JSON-LD truncado (fallback).
    """
    parts = []
    req = soup.select_one('.requisitos__vaga')
    if req:
        parts.append(req.get_text('\n', strip=True))
    atr = soup.select_one('.atribuicoes__vaga')
    if atr:
        parts.append(atr.get_text('\n', strip=True))
    if parts:
        return '\n\n'.join(p for p in parts if p)

    desc_node = soup.select_one('.descricao__vaga')
    if desc_node:
        return desc_node.get_text('\n', strip=True)
    return ''


_REGIME_MAP = {
    "CONTRACTOR": "Autônomo",
    "PART_TIME": "Meio Período",
    "INTERN": "Estágio",
    "TEMPORARY": "Temporário",
    "FULL_TIME": "Efetivo",
}


# --- Curadoria tech ------------------------------------------------------
#
# A area "informatica" do BNE e contaminada por vagas que usam termos
# tech no titulo mas pertencem a outras areas:
#   - "programador" CNC/torno (manufatura)
#   - "auxiliar de servicos de internet" (operacional de loja)
#   - "coordenador de projetos" (gestao geral)
#   - "digitador" como TikTok creator (marketing)
#   - "auxiliar de processamento" como auxiliar de professor (educacao)
#   - "tecnico de suporte" como atendimento ao cliente (call center)
#
# Filtragem em duas camadas:
#   1. Titulo: blacklist de cargos claramente nao-tech (CNC/torno, etc).
#   2. Descricao: presenca de termos tech reais (linguagens, frameworks,
#      protocolos, ferramentas) E ausencia de termos de manufatura/varejo/
#      educacao que indiquem contaminacao da area.

# Cargos com termos tech no nome mas que sao claramente nao-tech.
_TITLE_BLACKLIST_RE = re.compile(
    r"\b(?:"
    r"programador\s+(?:cnc|torno|de\s+m[áa]quinas|industrial)|"
    r"operador\s+(?:cnc|torno|de\s+m[áa]quinas|industrial)|"
    r"auxiliar\s+de\s+servi[çc]os\s+de\s+internet|"
    r"auxiliar\s+de\s+(?:professor|professora|creche|escola)|"
    r"auxiliar\s+de\s+processamento(?!\s+de\s+dados)|"  # processamento de dados E ok
    r"recepcionist[ao]|"
    r"motoboy|motorist[ao]"
    r")\b",
    re.IGNORECASE,
)

# Termos tech que confirmam que a vaga e de TI quando aparecem na
# descricao. Suficientemente especificos para nao gerar falso-positivo
# em vagas de manufatura/varejo.
_TECH_SIGNALS_RE = re.compile(
    r"\b(?:"
    # Linguagens / frameworks
    r"python|java|javascript|typescript|c#|c\+\+|\.net|asp\.net|"
    r"php|ruby|go(?:lang)?|rust|kotlin|swift|scala|"
    r"react|angular|vue|node\.?js|express|django|flask|fastapi|"
    r"spring|laravel|symfony|rails|nest\.?js|"
    # Banco / dados
    r"sql|mysql|postgres(?:ql)?|mongo(?:db)?|redis|oracle|sqlite|"
    r"cassandra|dynamodb|elasticsearch|"
    # Infra / cloud
    r"docker|kubernetes|k8s|terraform|ansible|jenkins|"
    r"aws|azure|gcp|google\s+cloud|cloud\s+computing|"
    # Conceitos / praticas tech
    r"api\s+rest|restful|graphql|microservi[çc]os?|microservices|"
    r"devops|sre|ci/cd|continuous\s+integration|"
    r"backend|back[-\s]?end|frontend|front[-\s]?end|fullstack|full[-\s]?stack|"
    # SAP (BNE tem muitas vagas SAP - confirma tech)
    r"\bsap\b|abap|hana|fiori|"
    # Sistemas operacionais / redes tech
    r"linux|unix|windows\s+server|active\s+directory|"
    r"tcp/?ip|firewall|vpn|switch|roteador|"
    # ML / dados
    r"machine\s+learning|deep\s+learning|inteligencia\s+artificial|"
    r"data\s+science|big\s+data|hadoop|spark|"
    # Frontend basico
    r"\bhtml\b|\bcss\b|sass|scss|bootstrap|tailwind|"
    # Versionamento / dev tools
    r"\bgit\b|github|gitlab|bitbucket|jira|"
    # Testes
    r"\bqa\b|pytest|jest|junit|selenium|cypress|"
    # Helpdesk / suporte tech especifico
    r"helpdesk|help\s+desk|service\s+desk|chamados\s+(?:de\s+)?ti|"
    # Outros
    r"webdesign|web\s+design|ux\s+design|ui\s+design|"
    r"automa[çc][ãa]o\s+(?:de\s+)?(?:processos|testes|rpa)|"
    r"scrum|kanban|agile"
    r")\b",
    re.IGNORECASE,
)

# Termos que indicam vaga claramente de outra area, mesmo que o titulo
# tenha "programador" ou "tecnico". Aplicado quando NAO ha sinal tech.
_NON_TECH_SIGNALS_RE = re.compile(
    r"\b(?:"
    # Manufatura / industrial
    r"torno\s+cnc|usinagem|envernizad|litografia|"
    r"comando\s+(?:numerico|el[ée]trico)|setup\s+(?:da|de)\s+m[áa]quina|"
    r"\bpcm\b|planejamento\s+e\s+controle\s+de\s+manuten[çc][ãa]o|"
    r"manuten[çc][ãa]o\s+predial|manut\s+predial|"
    r"superestrutura\s+ferrovi|via\s+permanente|ferrovi[áa]ri[ao]|"
    # Educacao
    r"professor[ao]?|sala\s+de\s+aula|educa[çc][ãa]o\s+infantil|"
    r"creche|berc[áa]rio|materno-?infantil|curso\s+t[ée]cnico\s+de\s+inform|"
    # Atendimento / call center
    r"atendimento\s+(?:ao\s+cliente|presencial|telef[ôo]nico)|"
    r"call\s+center|televendas|telemarketing|"
    r"chat\s+e\s+telefone|liga[çc][ãa]o\s+e\s+(?:via\s+)?chat|"
    # Varejo / vendas
    r"loja\s+(?:matriz|f[ií]sica|multicanal|multicanais)|varejo|"
    r"caixa\s+(?:de\s+)?(?:loja|supermerc)|estoquista|"
    r"vendedor\s+de\s+inform[áa]tica|"  # "vendedor de informatica" e varejo
    r"executivo\s+de\s+solu[çc][õo]es|(?:equipe|time)\s+comercial|"
    r"consultor\s+hospitalar|"
    # Logistica / operacional
    r"motoboy|entrega|delivery|"
    r"recepcionista|telefonista|secretari[ao]|"
    # Marketing de redes sociais (nao confundir com tech)
    r"tiktok|content\s+creator|trend\s+content|cultura\s+digital|"
    r"vivencia\s+em\s+(?:redes\s+sociais|instagram|tiktok)|"
    # Outras areas com sigla TI confusa
    r"design\s+ou\s+arquitetura"
    r")\b",
    re.IGNORECASE,
)


def _is_tech_relevant(title: str, description: str) -> bool:
    """Decide se a vaga deve ser mantida no dataset tech.

    Politica:
        1. Titulo casa blacklist (ex.: "programador CNC") -> rejeita.
        2. Descricao tem sinal tech explicito -> aceita.
        3. Descricao tem sinal nao-tech sem sinal tech -> rejeita.
        4. Default -> aceita (nao rejeita por silencio para preservar
           vagas com descricao curta/incompleta).
    """
    if not title:
        return True
    if _TITLE_BLACKLIST_RE.search(title):
        return False
    if not description:
        return True
    if _TECH_SIGNALS_RE.search(description):
        return True
    if _NON_TECH_SIGNALS_RE.search(description):
        return False
    return True


# --- Helpers privados ----------------------------------------------------

async def _scan_area(area: str, scraper, max_pages: int = BNE_MAX_PAGES) -> set:
    """Pagina uma área até encontrar 2 páginas vazias consecutivas ou ``max_pages``.

    Args:
        area: slug da área (ex.: ``"informatica"``).
        scraper: instância de ``cloudscraper``.
        max_pages: limite duro de páginas a percorrer.

    Returns:
        Set de ``job_id`` únicos coletados (sem o prefixo ``"job-"``).
    """
    found: set[str] = set()
    page = 1
    consecutive_empty = 0

    while page <= max_pages and consecutive_empty < 2:
        try:
            if page > 1:
                await asyncio.sleep(random.uniform(0.3, 0.8))

            url = f"https://www.bne.com.br/vagas-de-emprego-na-area-de-{area}?Area={area}&Sort=0&Page={page}"
            response = await fetch_sync(scraper, url, timeout=20)

            if response is None or response.status_code != 200:
                consecutive_empty += 1
                page += 1
                continue

            soup = BeautifulSoup(response.text, "html.parser")
            jobs = soup.find_all("section", class_="job__card__container")

            if not jobs:
                consecutive_empty += 1
                page += 1
                continue

            new_count = 0
            for job in jobs:
                job_id = job.get("id", "").replace("job-", "")
                if job_id and job_id not in found:
                    found.add(job_id)
                    tracker.discover(
                        f"https://www.bne.com.br/vagas-de-emprego/{job_id}",
                        engine="bne",
                    )
                    new_count += 1

            consecutive_empty = 0 if new_count else (consecutive_empty + 1)
            page += 1

        except Exception:
            consecutive_empty += 1
            page += 1

    return found


async def _fetch_job_detail(job_id, semaphore: asyncio.Semaphore) -> list | None:
    """Busca a página de detalhe e devolve a lista canônica.

    Args:
        job_id: ID numérico da vaga (``"123456"``, sem prefixo).
        semaphore: limita o número de fetches simultâneos.

    Returns:
        Lista canônica de 8 campos, ou ``None`` se faltar JSON-LD/título.
    """
    async with semaphore:
        # Jitter alto para diluir o padrão de requests — BNE detecta soft-block
        # quando vê rajada e devolve HTML sem JSON-LD (refetch_empty).
        await asyncio.sleep(random.uniform(1.5, 3.5))

        scraper = get_scraper()
        link = f"https://www.bne.com.br/vagas-de-emprego/{job_id}"

        try:
            response = await fetch_sync(scraper, link, timeout=30)
            if response is None or response.status_code != 200:
                return None

            soup = BeautifulSoup(response.text, "html.parser")
            scripts = soup.find_all("script", type="application/ld+json")
            if not scripts:
                return None

            # O primeiro script contém os dados da vaga
            data = json.loads(scripts[0].string)
            if data.get("@type") != "JobPosting":
                return None

            job_title = data.get("title", "").split(" Cargo/Função:")[0].strip()

            hiring_org = data.get("hiringOrganization", {})
            company = hiring_org.get("name", "") if isinstance(hiring_org, dict) else ""

            job_location = data.get("jobLocation", {})
            address = job_location.get("address", {}) if isinstance(job_location, dict) else {}
            location = [
                address.get("addressLocality", ""),
                address.get("addressRegion", ""),
            ]

            # Modalidade
            job_location_type = data.get("jobLocationType", "")
            loc_str = str(location).lower() + " " + address.get("streetAddress", "").lower()
            if job_location_type == "TELECOMMUTE" or "remoto" in loc_str or "home office" in loc_str:
                work_type = "Remoto"
            elif "híbrido" in loc_str or "hibrido" in loc_str:
                work_type = "Híbrido"
            else:
                work_type = "Presencial"

            # Regime
            employment_type = data.get("employmentType", "")
            if isinstance(employment_type, list):
                emp_type = employment_type[0] if employment_type else ""
            else:
                emp_type = employment_type
            hiring_regime = _REGIME_MAP.get(emp_type, "Efetivo")

            # Salário
            base_salary = data.get("baseSalary", {})
            salary = ""
            if isinstance(base_salary, dict):
                value = base_salary.get("value", {})
                if isinstance(value, dict):
                    min_val = value.get("minValue", "")
                    max_val = value.get("maxValue", "")
                    if min_val and max_val:
                        salary = f"R$ {min_val:.0f} - R$ {max_val:.0f}"
                    elif min_val:
                        salary = f"R$ {min_val:.0f}"
                else:
                    salary = str(value) if value else ""

            # Data ISO -> DD/MM/YYYY
            date_raw = data.get("datePosted", "")[:10]
            if date_raw and len(date_raw) == 10 and "-" in date_raw:
                parts = date_raw.split("-")
                publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
            else:
                publication_date = date_raw

            # JSON-LD da BNE entrega description truncada (~189-314 chars,
            # cortando frases pela metade). O texto completo vive no DOM em:
            #   Layout A: .requisitos__vaga + .atribuicoes__vaga (separados)
            #   Layout B: .descricao__vaga                     (bloco unico)
            # Cai no JSON-LD apenas se o DOM nao tiver nenhuma das classes.
            description = _extract_full_description(soup)
            if not description:
                description = strip_html(data.get("description", ""))
            skills = extract_skills(description) if description else []

            # Curadoria: a area "informatica" do BNE traz contaminacao de
            # outras areas (CNC, varejo, educacao, call center). Filtramos
            # com base em titulo + descricao antes de emitir.
            if not _is_tech_relevant(job_title, description):
                return None

            return apply_description_fallbacks([
                link, job_title, company, location, work_type,
                hiring_regime, salary, publication_date,
                skills, description,
            ])

        except Exception:
            return None


# --- Fase 1: coleta de IDs -----------------------------------------------

async def get_bne_job_ids() -> list:
    """Coleta IDs únicos de vagas via paginação profunda da área ``informatica``.

    Returns:
        Lista de IDs únicos (strings) prontos para ``_fetch_job_detail``.
    """
    scraper = get_scraper()
    job_ids = await _scan_area(BNE_AREA, scraper)
    return list(job_ids)


# --- Fase 2 / Função pública ---------------------------------------------

async def get_bne_jobs(on_job=None) -> list:
    """Coleta vagas da BNE em duas fases (paginação da área TI + detalhes).

    A BNE só tem uma área tech (``informatica``) - não filtra por stack
    nem por palavra-chave livre. O ganho de cobertura vem da paginação
    profunda controlada por ``BNE_MAX_PAGES``.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                resolvida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico de 10 campos.
    """
    jobs = []
    job_ids = await get_bne_job_ids()
    semaphore = asyncio.Semaphore(6)

    async def _fetch_and_emit(job_id):
        """Resolve uma vaga e emite via callback (se configurado)."""
        parsed = await _fetch_job_detail(job_id, semaphore)
        if parsed is not None and on_job is not None:
            try:
                await on_job(parsed)
            except Exception:
                pass
        return parsed

    job_details = await asyncio.gather(*[_fetch_and_emit(jid) for jid in job_ids])
    jobs = [j for j in job_details if j is not None]

    print(f"Foram obtidas {len(jobs)} vagas do site BNE")
    return jobs


async def refetch_one(url: str) -> list | None:
    """Reprocessa uma URL específica do BNE (passe de reenrichment).

    Extrai o job_id da URL e usa ``_fetch_job_detail`` para buscar o JSON-LD.
    """
    m = re.search(r"/vagas-de-emprego/(\d+)", url)
    if not m:
        return None
    job_id = m.group(1)
    sem = asyncio.Semaphore(1)
    return await _fetch_job_detail(job_id, sem)


# --- Modo debug ----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_bne_jobs()):
        print(j)

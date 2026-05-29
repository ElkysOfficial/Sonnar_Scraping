"""
Engine GeekHunter - GraphQL pública (uma chamada cobre tudo).

O GeekHunter expõe a query ``findShowcaseJobs`` que devolve até 1000 vagas
em uma única resposta. Por isso esta engine **não usa batching** - uma
chamada já cobre o catálogo inteiro do site.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys

logger = logging.getLogger("scraper.engine.geekhunter")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.utils.http_session import HttpSession, fetch  # noqa: E402
from src.utils.rate_limiter import request_with_policy  # noqa: E402


# 2026-05-23 (v2.23.0): pipeline central. GeekHunter e sempre PT.
PARSER_VERSION = "geekhunter-2026.05.23"

# GeekHunter lista apenas vagas ativas, mas o campo createdAt da API reflete a
# data original da publicacao (frequentemente >90 dias). Sem bypass, ~49% das
# vagas validas eram descartadas pelo filtro MAX_AGE_DAYS.
TRUST_LISTING_ACTIVE = True


def is_partial(job_data: dict) -> bool:
    """GeekHunter nunca fica em ``partial``.

    Toda a coleta vem de uma chamada GraphQL ``findShowcaseJobs`` (ate 1000
    vagas) com fallback HTML para regime/skills/modalidade/cidade. Nao existe
    "segunda passada" possivel: refetch nao traria nada novo. A engine nao
    declara ``refetch_one`` justamente por isso.

    Mantemos o hook para deixar explicito: se uma vaga GeekHunter chegou,
    ela ja esta no estado mais completo possivel para o que a fonte oferece.
    Campos vazios (salary, regime, skills) sao naturais quando a vaga nao
    publica.
    """
    return False
from src.utils.job_enrichment import enrich_canonical  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


# --- Sessão (padrão httpx compartilhado) ---------------------------------

_SESSION = HttpSession()


async def get_session():
    return await _SESSION.get_client()


def reset_session() -> None:
    _SESSION.reset()


# --- Configuração da requisição --------------------------------------------

_GRAPHQL_URL = "https://www.geekhunter.com.br/graphql"

_HEADERS = {
    "Referer": "https://www.geekhunter.com.br/vagas",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Accept": "application/json",
}

_QUERY_BODY = {
    "operationName": "findShowcaseJobs",
    "variables": {
        "showcaseParams": {
            "companyLocation": [],
            "order": "newer",
            "remoteWork": False,
            "pagination": {"page": 0, "perPage": 1000},
        }
    },
    # ``city.state`` e omitido de proposito - quando ``city`` e null o schema
    # ainda exige state non-null e quebra o item; ``city.name`` ja entrega
    # "Cidade - UF" que o location_normalizer descompoe.
    "query": """
    query findShowcaseJobs($showcaseParams: SearchJobFilter!) {
      findShowcaseJobs(showcaseParams: $showcaseParams) {
        data {
          id
          company { name slug city { name } }
          city { name }
          cltMaxSalary
          cltMinSalary
          createdAt
          maxSalary
          minSalary
          pjMaxSalary
          pjMinSalary
          usdAnnualSalaryMin
          usdAnnualSalaryMax
          remoteWork
          slug
          title
          description
          requirements
          experienceLevel
          technologies { name }
        }
      }
    }
    """,
}


_PJ_RE = re.compile(r"\bPJ\b|\bpessoa\s+jur[ií]dica\b|contrata[çc][ãa]o\s+(?:no\s+modelo\s+)?PJ", re.IGNORECASE)
_CLT_RE = re.compile(r"\bCLT\b|\bcarteira\s+assinada\b|\bregime\s+celetista\b", re.IGNORECASE)

# RSC/Flight do Next.js: payload vem em chunks `self.__next_f.push([1, "<json-string>"])`.
# Concatenando os chunks decodificados (json.loads remove escapes), achamos os campos
# que o GraphQL publico nao expoe.
_NEXT_FLIGHT_RE = re.compile(r'self\.__next_f\.push\(\[1,(".+?")\]\)', re.DOTALL)
_COMPANY_LOC_RE = re.compile(r'"NestCompany"[^}]*?"location"\s*:\s*"([^"]+)"', re.DOTALL)
_WORK_MODALITY_RE = re.compile(r'"workModality"\s*:\s*"([^"]+)"')
_ATS_SALARIES_RE = re.compile(r'"atsJobSalaries"\s*:\s*\[(.*?)\]', re.DOTALL)
_SALARY_EXPECT_RE = re.compile(r'"salaryExpectation"\s*:\s*\[(.*?)\]', re.DOTALL)
_CONTRACT_TYPE_RE = re.compile(r'"contractType"\s*:\s*"([^"]+)"')
_ATS_JOB_SKILLS_RE = re.compile(r'"atsJobSkills"\s*:\s*\[(.*?)\](?=,"|\})', re.DOTALL)
_ATS_SKILL_NAME_RE = re.compile(r'"AtsSkill"[^}]*?"name"\s*:\s*"([^"]+)"')

# Enum de contractType -> rotulo legivel.
_CONTRACT_LABELS = {
    "CLT": "CLT",
    "PJ": "PJ",
    "INT": "Estágio",
    "TEMP": "Temporário",
    "APP": "Aprendiz",
}

_WORK_MODALITY_LABELS = {
    "remote": "Remoto",
    "hybrid": "Híbrido",
    "onsite": "Presencial",
    "presential": "Presencial",
}

_HTML_FALLBACK_CONCURRENCY = 10
_HTML_FALLBACK_TIMEOUT = 15.0

# Tokens que indicam pais ja presente na string de cidade. Quando ``city.name``
# do GraphQL ja vem com pais embutido (caso de empresas internacionais com
# "Mexico City, CDMX, Mexico" ou simplesmente "Brasil"), nao devemos anexar
# "- Brasil" cego no fim - isso corrompe o normalizer.
_COUNTRY_TOKEN_RE = re.compile(
    r'\b(brasil|brazil|estados\s+unidos|united\s+states|usa|portugal|reino\s+unido|'
    r'united\s+kingdom|england|argentina|chile|mexico|m[eé]xico|panama|panam[aá]|'
    r'colombia|col[oô]mbia|uruguai|uruguay|paraguai|paraguay|peru|venezuela|'
    r'bolivia|equador|ecuador|cuba|jamaica|canada|canad[aá])\b',
    re.IGNORECASE,
)

# Cidade com UF brasileira no sufixo (ex.: "São Paulo - SP"). Confirma BR e
# autoriza anexar "Brasil" para o location_normalizer.
_BR_UF_SUFFIX_RE = re.compile(
    r'-\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|'
    r'RO|RR|SC|SP|SE|TO)\s*$'
)


def _extract_regime_from_flight(flight: str) -> str:
    """Inferir regime a partir de ``atsJobSalaries`` e ``salaryExpectation``.

    ``supportModalityCLT/PJ`` (boolean) costumam vir ``false/false`` mesmo
    em vagas com regime definido - nao sao fonte confiavel. O ``contractType``
    desses dois arrays e a verdade. Coleta unica e ordenada (CLT, PJ, Estagio,
    Temporario, Aprendiz). Retorna "" se nada for achado.
    """
    contract_types: list = []
    seen: set = set()
    for array_re in (_ATS_SALARIES_RE, _SALARY_EXPECT_RE):
        match = array_re.search(flight)
        if not match:
            continue
        for ct in _CONTRACT_TYPE_RE.findall(match.group(1)):
            if ct not in seen:
                seen.add(ct)
                contract_types.append(ct)
    if not contract_types:
        return ""
    labels = [_CONTRACT_LABELS.get(ct, ct) for ct in contract_types]
    # Ordem canonica: CLT antes de PJ (resto na ordem encontrada).
    canon = sorted(set(labels), key=lambda x: (x != "CLT", x != "PJ", x))
    return "/".join(canon)


def _extract_skills_from_flight(flight: str) -> list:
    """Extrai skills oficiais da vaga via ``atsJobSkills[].AtsSkill.name``.

    Mais rico que ``technologies`` do GraphQL em varios casos (StudentCrowd
    tem 8 skills no HTML vs 0 no GraphQL). Retorna lista de strings unicas
    preservando ordem.
    """
    match = _ATS_JOB_SKILLS_RE.search(flight)
    if not match:
        return []
    out: list = []
    seen: set = set()
    for name in _ATS_SKILL_NAME_RE.findall(match.group(1)):
        key = name.strip().lower()
        if name.strip() and key not in seen:
            out.append(name.strip())
            seen.add(key)
    return out


async def _fetch_html_extras(client, url: str) -> dict:
    """Busca campos faltantes na pagina HTML que o GraphQL publico nao expoe.

    Faz GET na pagina, concatena os chunks ``self.__next_f.push`` (RSC do Next)
    e extrai via regex: regime de contratacao real, modalidade de trabalho,
    cidade da empresa, e skills oficiais (``atsJobSkills``).

    Retorna dict com ``regime``, ``work_type``, ``company_location`` e ``skills``
    (lista). Campos nao encontrados vem vazios.
    """
    empty = {"regime": "", "work_type": "", "company_location": "", "skills": []}
    response = await fetch(client, url, timeout=_HTML_FALLBACK_TIMEOUT)
    if response is None or response.status_code != 200:
        return empty
    html = response.text

    chunks: list = []
    for match in _NEXT_FLIGHT_RE.finditer(html):
        try:
            chunks.append(json.loads(match.group(1)))
        except Exception:
            continue
    flight = "".join(chunks)

    regime = _extract_regime_from_flight(flight)

    work_type = ""
    wm = _WORK_MODALITY_RE.search(flight)
    if wm:
        work_type = _WORK_MODALITY_LABELS.get(wm.group(1).lower(), "")

    company_location = ""
    loc_match = _COMPANY_LOC_RE.search(flight)
    if loc_match:
        company_location = loc_match.group(1).strip()

    skills = _extract_skills_from_flight(flight)

    return {
        "regime": regime,
        "work_type": work_type,
        "company_location": company_location,
        "skills": skills,
    }


def _infer_regime_from_text(*texts: str) -> str:
    """Detecta PJ/CLT/CLT/PJ no titulo ou descricao quando o salario e null.

    Usado como fallback quando ``cltMin/Max`` e ``pjMin/Max`` vem todos
    null (vagas com salario "a combinar"). Retorna "" se nada for achado.
    """
    blob = " \n ".join(t for t in texts if t)
    has_pj = bool(_PJ_RE.search(blob))
    has_clt = bool(_CLT_RE.search(blob))
    if has_pj and has_clt:
        return "CLT/PJ"
    if has_pj:
        return "PJ"
    if has_clt:
        return "CLT"
    return ""


def _build_description(description: str | None, requirements: str | None) -> str:
    """Concatena ``description`` e ``requirements`` (HTML) e devolve texto limpo.

    O GeekHunter quase sempre coloca o conteudo em ``requirements`` (titulo,
    responsabilidades, beneficios). ``description`` aparece vazia na maior
    parte das vagas - e mantida como prefixo quando existe.
    """
    parts = [p for p in (description, requirements) if p and p.strip()]
    if not parts:
        return ""
    return strip_html("\n\n".join(parts))


def _merge_skills(technologies: list, description: str) -> list:
    """Une tags do GeekHunter com skills detectadas no texto via vocabulario.

    Mantem ordem de descoberta (technologies primeiro, depois extract_skills),
    sem duplicatas case-insensitive.
    """
    found: list = []
    seen: set = set()
    for tech in technologies or []:
        name = (tech.get("name") if isinstance(tech, dict) else "") or ""
        name = name.strip()
        if name and name.lower() not in seen:
            found.append(name)
            seen.add(name.lower())
    for skill in extract_skills(description):
        if skill.lower() not in seen:
            found.append(skill)
            seen.add(skill.lower())
    return found


# --- Função pública --------------------------------------------------------

async def get_geekhunter_jobs(on_job=None) -> list:
    """Coleta vagas do GeekHunter via GraphQL pública (uma chamada).

    Particularidade: a API devolve até 1000 vagas em uma resposta, então
    não há paginação nem iteração por stacks.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico ``[link, title, company, location,
        work_type, hiring_regime, salary, publication_date, skills,
        description]`` (10 campos, alinhado com Catho/Dice/BNE).
    """
    jobs = []

    try:
        client = await get_session()
        response = await request_with_policy(
            client, _GRAPHQL_URL, method="POST",
            headers=_HEADERS, json=_QUERY_BODY,
        )
        if response is None:
            return jobs
        response.raise_for_status()
        results = (
            response.json()
            .get("data", {})
            .get("findShowcaseJobs", {})
            .get("data", [])
        )

        for result in results:
            job_slug = result.get("slug", "")
            company_obj = result.get("company") or {}
            company_name = (company_obj.get("name") or "").strip()
            company_slug = company_obj.get("slug") or ""

            link = f"https://www.geekhunter.com.br/{company_slug}/jobs/{job_slug}"
            job_title = result.get("title", "")

            # Localizacao: ``city.name`` ja vem como "Cidade - UF" quando a
            # vaga tem cidade fixa. Em vagas remotas, ``city`` e null - nesse
            # caso usamos ``company.city.name`` (mesmo formato "Cidade - UF")
            # como proxy do estado da empresa, que o location_normalizer
            # decompoe em state_code.
            #
            # GeekHunter nao tem campo country - assumimos BR por default. Mas
            # so anexamos "Brasil" quando a string nao tem pais embutido, para
            # evitar duplicacoes ("Brasil - Brasil") e nao corromper vagas
            # internacionais ("Mexico City, CDMX, Mexico - Brasil").
            city_obj = result.get("city")
            city_name = city_obj.get("name", "") if city_obj else ""
            if not city_name:
                company_city = (company_obj.get("city") or {}).get("name", "") or ""
                city_name = company_city
            if not city_name:
                location = ["Brasil"]
            elif _COUNTRY_TOKEN_RE.search(city_name):
                # Pais ja embutido: "Brasil", "Mexico City... Mexico", etc.
                location = [city_name]
            elif _BR_UF_SUFFIX_RE.search(city_name):
                # UF brasileira no sufixo: anexa "Brasil" para o normalizer.
                location = [city_name, "Brasil"]
            else:
                # Ambiguo (sigla estrangeira como "Venice - CA",
                # "Wolverhampton - WM"): nao anexa "Brasil" - o normalizer
                # decide via Fix C/D do location_normalizer.
                location = [city_name]

            # Modalidade de trabalho
            is_remote = result.get("remoteWork", False)
            if is_remote:
                work_type = "Remoto"
            elif city_name:
                work_type = "Presencial"
            else:
                work_type = "Remoto"

            # Regime e salário - tenta CLT, PJ, USD e genérico nessa ordem
            hiring_regime = ""
            salary = ""

            clt_min = result.get("cltMinSalary")
            clt_max = result.get("cltMaxSalary")
            pj_min = result.get("pjMinSalary")
            pj_max = result.get("pjMaxSalary")
            usd_min = result.get("usdAnnualSalaryMin")
            usd_max = result.get("usdAnnualSalaryMax")
            generic_min = result.get("minSalary")
            generic_max = result.get("maxSalary")

            if clt_min or clt_max:
                hiring_regime = "CLT"
                if clt_min and clt_max:
                    salary = f"R$ {clt_min} - R$ {clt_max}"
                elif clt_min:
                    salary = f"R$ {clt_min}"
                elif clt_max:
                    salary = f"R$ {clt_max}"
            elif pj_min or pj_max:
                hiring_regime = "PJ"
                if pj_min and pj_max:
                    salary = f"R$ {pj_min} - R$ {pj_max}"
                elif pj_min:
                    salary = f"R$ {pj_min}"
                elif pj_max:
                    salary = f"R$ {pj_max}"
            elif usd_min or usd_max:
                hiring_regime = "Internacional"
                if usd_min and usd_max:
                    salary = f"USD {usd_min} - USD {usd_max}"
                elif usd_min:
                    salary = f"USD {usd_min}"
                elif usd_max:
                    salary = f"USD {usd_max}"
            elif generic_min or generic_max:
                if generic_min and generic_max:
                    salary = f"R$ {generic_min} - R$ {generic_max}"
                elif generic_min:
                    salary = f"R$ {generic_min}"
                elif generic_max:
                    salary = f"R$ {generic_max}"

            # Data ISO → DD/MM/YYYY
            created_at = result.get("createdAt", "")
            date_raw = created_at[:10] if len(created_at) >= 10 else ""
            if date_raw and len(date_raw) == 10 and "-" in date_raw:
                parts = date_raw.split("-")
                publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
            else:
                publication_date = date_raw

            description = _build_description(
                result.get("description"), result.get("requirements")
            )
            skills = _merge_skills(result.get("technologies") or [], description)

            # Fallback de regime: quando todos os campos de salario sao null
            # ("a combinar"), inferimos PJ/CLT do titulo + descricao.
            if not hiring_regime:
                hiring_regime = _infer_regime_from_text(job_title, description)

            job = [link, job_title, company_name, location, work_type,
                   hiring_regime, salary, publication_date,
                   skills, description]
            tracker.discover(link, engine="geekhunter")
            jobs.append(job)

        # Fallback HTML para campos que o GraphQL publico nao expoe:
        # contractType (regime real), workModality (Hibrido/Remoto/Presencial),
        # company.location e atsJobSkills. Buscamos so vagas com algum campo
        # incompleto - tipicamente regime vazio, location apenas "Brasil",
        # work_type Presencial (pode ser hibrido), ou skills vazias.
        incomplete = [
            i for i, j in enumerate(jobs)
            if (not j[5])
               or (isinstance(j[3], list) and j[3] == ["Brasil"])
               or j[4] == "Presencial"
               or not j[8]
        ]
        if incomplete:
            sem = asyncio.Semaphore(_HTML_FALLBACK_CONCURRENCY)

            async def _enrich(idx: int) -> None:
                async with sem:
                    extras = await _fetch_html_extras(client, jobs[idx][0])
                if extras["regime"] and not jobs[idx][5]:
                    jobs[idx][5] = extras["regime"]
                if extras["work_type"]:
                    # workModality do HTML e a verdade (Hibrido era invisivel
                    # ao GraphQL, que so expoe ``remoteWork`` boolean).
                    jobs[idx][4] = extras["work_type"]
                if extras["company_location"] and jobs[idx][3] == ["Brasil"]:
                    # company.location vem como "Cidade - UF, Brasil" ou
                    # "Cidade - XX" (US/UK). location_normalizer decompoe.
                    jobs[idx][3] = [extras["company_location"]]
                if extras["skills"]:
                    # Mescla skills do HTML (``atsJobSkills``) com as do
                    # GraphQL/extract_skills sem duplicar.
                    existing = jobs[idx][8] or []
                    seen = {s.lower() for s in existing}
                    for s in extras["skills"]:
                        if s.lower() not in seen:
                            existing.append(s)
                            seen.add(s.lower())
                    jobs[idx][8] = existing

            await asyncio.gather(*(_enrich(i) for i in incomplete))

        # Pos-processamento universal: minera campos faltantes da descricao
        # e aplica o pipeline central de enriquecimento (v2.23.0).
        # v3.6.0: vagas com enrichment falhado sao descartadas (banco so PT).
        enriched_jobs = []
        for job in jobs:
            job = apply_description_fallbacks(job)
            try:
                job = await enrich_canonical(job, hint_lang="pt")
            except Exception as exc:
                logger.warning("[geekhunter] skip job=%s: enrichment falhou: %s", job[0] if job else "?", exc)
                continue
            enriched_jobs.append(job)
        jobs = enriched_jobs

        if on_job is not None:
            for job in jobs:
                try:
                    await on_job(job)
                except Exception:
                    pass

    except Exception:
        pass

    print(f"Foram obtidas {len(jobs)} vagas do site GeekHunter")
    return jobs


# --- Modo debug ------------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_geekhunter_jobs())[:10]:
        print(j)

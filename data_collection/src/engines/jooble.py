"""
Engine Jooble Brasil - listing HTML com ``__INITIAL_STATE__`` embutido.

O Jooble é um agregador. Cada listing serve um JSON ``__INITIAL_STATE__`` no
HTML que contém os jobs estruturados. Cada chamada devolve no máximo 20
vagas - o site usa scroll infinito via XHR fechado por Cloudflare, e os
parâmetros de paginação tradicionais (``p=N``, ``page=N``, ``start=N``) são
silenciosamente ignorados pelo backend (medido em mai/2026).

Como compensação, expandimos a cobertura via filtros ortogonais que o
backend respeita: ``date=1`` (24h), ``date=3`` (3 dias) e ``rgns=<UF>``
para as regiões mais populosas. A união desses recortes gera 4-7x mais
vagas únicas que a busca pura.

Particularidade: o link "real" da vaga é um redirect (``/away/...``). Usamos
``uid`` como chave de deduplicação e construímos URL canônica via
``/desc/{uid}``.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta

from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_stacks  # noqa: E402
from src.utils.http_session import fetch_sync  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402


# --- Configuração --------------------------------------------------------

# Variantes de busca ortogonais. Cada uma e aplicada por stack ativa e os
# uids sao unidos com dedup global. Selecionadas empiricamente:
#   - baseline (sem filtro): 20 vagas baseline.
#   - date=1/3: vagas das ultimas 24h/3 dias - alto rendimento de novidade.
#   - rgns=<UF>: top 12 regioes do Brasil; cada UF traz 6-19 vagas
#     novas observadas (regioes menores trazem mais novas pois sao
#     subexploradas pela busca padrao).
#
# date=7d e salary=* foram removidos pois nao filtravam (overlap completo
# com baseline). w=fulltime, sort=date, remote=1 idem.
_LISTING_VARIANTS = [
    "",                       # baseline
    "&date=1",                # ultimas 24h
    "&date=3",                # ultimos 3 dias
    "&rgns=Sao%20Paulo",
    "&rgns=Rio%20de%20Janeiro",
    "&rgns=Minas%20Gerais",
    "&rgns=Rio%20Grande%20do%20Sul",
    "&rgns=Parana",
    "&rgns=Santa%20Catarina",
    "&rgns=Bahia",
    "&rgns=Brasilia",          # DF
    "&rgns=Pernambuco",
    "&rgns=Goias",
    "&rgns=Ceara",
    "&rgns=Espirito%20Santo",
]


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


# --- Helpers privados -----------------------------------------------------

def _parse_relative_date(date_caption: str) -> str:
    """Converte datas relativas em PT-BR para ``DD/MM/YYYY``.

    Aceita: ``hoje``/``agora``/``hora``/``minuto``, ``ontem``,
    ``há X dias/semanas/meses``.
    """
    if not date_caption:
        return ""

    date_caption = date_caption.lower().strip()
    today = datetime.now()

    if "hoje" in date_caption or "agora" in date_caption or "hora" in date_caption or "minuto" in date_caption:
        return today.strftime("%d/%m/%Y")
    if "ontem" in date_caption:
        return (today - timedelta(days=1)).strftime("%d/%m/%Y")

    days_match = re.search(r"(\d+)\s*dias?", date_caption)
    if days_match:
        days = int(days_match.group(1))
        return (today - timedelta(days=days)).strftime("%d/%m/%Y")

    weeks_match = re.search(r"(\d+)\s*semanas?", date_caption)
    if weeks_match:
        weeks = int(weeks_match.group(1))
        return (today - timedelta(weeks=weeks)).strftime("%d/%m/%Y")

    months_match = re.search(r"(\d+)\s*m[eê]s(es)?", date_caption)
    if months_match:
        months = int(months_match.group(1))
        return (today - timedelta(days=months * 30)).strftime("%d/%m/%Y")

    return ""


def _parse_iso_date(date_str: str) -> str:
    """``'2026-04-29T00:00:00'`` -> ``'29/04/2026'``."""
    if not date_str:
        return ""
    try:
        date_part = date_str[:10]
        if len(date_part) == 10 and "-" in date_part:
            parts = date_part.split("-")
            return f"{parts[2]}/{parts[1]}/{parts[0]}"
    except Exception:
        pass
    return ""


def _extract_hiring_regime(title: str, job_type: str = "") -> str:
    """Heurística de regime baseada no título e/ou ``jobType`` do item."""
    title_lower = title.lower()
    job_type_lower = (job_type or "").lower()

    if "estágio" in title_lower or "estagio" in title_lower or "intern" in title_lower or "estágio" in job_type_lower:
        return "Estágio"
    if "pj" in title_lower or "pessoa jurídica" in title_lower or "pessoa juridica" in title_lower:
        return "PJ"
    if "freelance" in title_lower or "freelancer" in title_lower or "contractor" in job_type_lower:
        return "Freelancer"
    if "temporário" in title_lower or "temporario" in title_lower or "temporary" in job_type_lower:
        return "Temporário"
    if "part-time" in title_lower or "meio período" in title_lower or "meio periodo" in title_lower:
        return "Meio Período"
    if "clt" in title_lower:
        return "CLT"
    if "full-time" in job_type_lower or "full_time" in job_type_lower or "integral" in job_type_lower:
        return "Full-time"

    return ""


def _extract_company(item: dict) -> str:
    """Extrai nome da empresa lidando com ``None``/dict/string e confidencial."""
    company_data = item.get("company")
    if company_data is None:
        company = "Não informado"
    elif isinstance(company_data, dict):
        company = company_data.get("name") or "Não informado"
    elif isinstance(company_data, str):
        company = company_data or "Não informado"
    else:
        company = "Não informado"

    if company.lower() in ["confidencial", "empresa confidencial", ""]:
        company = "Confidencial"
    return company


def _extract_salary(item: dict) -> str:
    """Extrai salário do campo ``salary`` (str/dict) ou ``estimatedSalary``."""
    salary_raw = item.get("salary")
    salary = ""

    if salary_raw is None:
        salary = ""
    elif isinstance(salary_raw, str):
        salary = salary_raw.strip()
    elif isinstance(salary_raw, dict):
        min_sal = salary_raw.get("min", salary_raw.get("minValue", ""))
        max_sal = salary_raw.get("max", salary_raw.get("maxValue", ""))
        currency = salary_raw.get("currency", "R$")
        if min_sal and max_sal:
            salary = f"{currency} {min_sal} - {max_sal}"
        elif min_sal:
            salary = f"{currency} {min_sal}"

    # Fallback: estimatedSalary
    if not salary:
        estimated = item.get("estimatedSalary")
        if estimated and isinstance(estimated, dict):
            min_sal = estimated.get("min", estimated.get("minValue", ""))
            max_sal = estimated.get("max", estimated.get("maxValue", ""))
            if min_sal:
                salary = f"R$ {min_sal}" + (f" - R$ {max_sal}" if max_sal else "")

    return salary


def _parse_job_item(item: dict, encoded_stack: str, seen_ids: set) -> list | None:
    """Converte um item do ``__INITIAL_STATE__`` em lista canônica.

    Args:
        item: dict do ``serpJobs.jobs[0].items[]``.
        encoded_stack: stack URL-encoded usada na busca atual (para o ckey).
        seen_ids: set para deduplicação em memória (mutado).

    Returns:
        Lista canônica de 8 campos, ou ``None`` se for componente/duplicata
        ou faltar uid/título.
    """
    # Pular componentes (banners, widgets, etc).
    if item.get("componentName"):
        return None

    uid = item.get("uid", "")
    if not uid or uid in seen_ids:
        return None

    # Título (limpa caracteres não-ASCII problemáticos no Windows)
    job_title = item.get("position", "") or ""
    job_title = job_title.encode("ascii", "ignore").decode("ascii").strip()

    if not job_title:
        full_content = item.get("fullContent", "") or item.get("content", "")
        if full_content:
            soup = BeautifulSoup(full_content, "html.parser")
            text = soup.get_text(strip=True).encode("ascii", "ignore").decode("ascii")
            job_title = text.split("\n")[0][:100] if text else ""

    if not job_title:
        return None

    seen_ids.add(uid)
    company = _extract_company(item)

    # Localização
    location_data = item.get("location")
    location_name = ""
    if isinstance(location_data, dict):
        location_name = location_data.get("name") or ""
    elif isinstance(location_data, str):
        location_name = location_data

    # work_type + ajuste de location
    is_remote = item.get("isRemoteJob", False)
    title_lower = job_title.lower()
    location_lower = location_name.lower()

    if is_remote or "remoto" in title_lower or "remote" in title_lower or "remoto" in location_lower:
        work_type = "Remoto"
        location: list = []
    elif "híbrido" in title_lower or "hibrido" in title_lower or "hybrid" in title_lower or "híbrido" in location_lower:
        work_type = "Híbrido"
        parts = [p.strip() for p in location_name.split(",") if p.strip()]
        location = parts[:2] if parts else []
    else:
        work_type = "Presencial"
        parts = [p.strip() for p in location_name.split(",") if p.strip()]
        location = parts[:2] if parts else []

    job_type = item.get("jobType", "") or ""
    hiring_regime = _extract_hiring_regime(job_title, job_type)
    salary = _extract_salary(item)

    # Data: ISO primeiro, fallback para texto relativo
    publication_date = _parse_iso_date(item.get("dateUpdated", ""))
    if not publication_date:
        publication_date = _parse_relative_date(item.get("dateCaption", ""))

    # Link canônico (mais estável que /away/)
    link = f"https://br.jooble.org/desc/{uid}?ckey={encoded_stack}"

    # ``fullContent`` é HTML completo da vaga; ``content`` é só preview - prefira o primeiro
    description = strip_html(item.get("fullContent") or item.get("content") or "")
    skills = extract_skills(description) if description else []

    return apply_description_fallbacks([
        link, job_title, company, location, work_type,
        hiring_regime, salary, publication_date,
        skills, description,
    ])


# --- Função pública -------------------------------------------------------

async def get_jooble_jobs(on_job=None) -> list:
    """Extrai vagas do Jooble Brasil via ``__INITIAL_STATE__`` no HTML.

    O Jooble é um agregador que usa links de redirect - usamos o ``uid`` da
    vaga como chave de deduplicação para evitar gravar a mesma vaga sob URLs
    de redirect diferentes.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                emitida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos.
    """
    jobs = []
    seen_ids: set[str] = set()
    session = get_session()

    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        for variant in _LISTING_VARIANTS:
            try:
                url = f"https://br.jooble.org/SearchResult?ukw={encoded}{variant}"
                response = await fetch_sync(session, url, timeout=30)
                if response is None or response.status_code != 200:
                    continue

                match = re.search(
                    r"__INITIAL_STATE__\s*=\s*({.+?});?\s*</script>",
                    response.text,
                    re.DOTALL,
                )
                if not match:
                    continue
                try:
                    data = json.loads(match.group(1))
                except json.JSONDecodeError:
                    continue

                items = (
                    data.get("serpJobs", {})
                    .get("jobs", [{}])[0]
                    .get("items", [])
                )
                if not items:
                    continue

                for item in items:
                    try:
                        parsed = _parse_job_item(item, encoded, seen_ids)
                    except Exception:
                        continue
                    if parsed is None:
                        continue
                    jobs.append(parsed)
                    if on_job is not None:
                        try:
                            await on_job(parsed)
                        except Exception:
                            pass

                await asyncio.sleep(0.3)

            except Exception:
                continue

    print(f"Foram obtidas {len(jobs)} vagas do site Jooble")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    jobs = asyncio.run(get_jooble_jobs())
    print(f"Total: {len(jobs)}")
    for j in jobs[:10]:
        print(j)

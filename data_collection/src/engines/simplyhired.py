"""
Engine SimplyHired Brasil - Playwright + ``__NEXT_DATA__``.

O SimplyHired fica atrás do Cloudflare, que bloqueia ``httpx`` e ``curl_cffi``.
Por isso usamos Playwright headless (via ``utils.browser_fetch.fetch_html``)
para renderizar a página, depois extraímos o JSON ``__NEXT_DATA__`` embutido
no HTML hidratado.

Iteramos por stack do lote ativo, paginando até ``SIMPLYHIRED_MAX_PAGES``
(default 5).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from utils.browser_fetch import fetch_html  # noqa: E402
from variavel import get_active_stacks  # noqa: E402


# --- Configuração --------------------------------------------------------

SH_MAX_PAGES = int(os.getenv("SIMPLYHIRED_MAX_PAGES", "5"))

_RE_NEXT_DATA = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>',
    re.DOTALL,
)


# --- Helpers privados ----------------------------------------------------

def _parse_relative_date(date_text: str) -> str:
    """Converte datas relativas (PT-BR/EN) para ``DD/MM/YYYY``.

    Aceita: ``hoje``/``today``/``just``, ``ontem``/``yesterday``,
    ``X dias``/``X days``, ``X semanas``/``X weeks``, ``X meses``/``X months``.
    """
    if not date_text:
        return ""
    date_text = date_text.lower().strip()
    today = datetime.now()
    if "hoje" in date_text or "today" in date_text or "just" in date_text:
        return today.strftime("%d/%m/%Y")
    if "ontem" in date_text or "yesterday" in date_text:
        return (today - timedelta(days=1)).strftime("%d/%m/%Y")
    days_match = re.search(r"(\d+)\s*(dias?|days?)", date_text)
    if days_match:
        return (today - timedelta(days=int(days_match.group(1)))).strftime("%d/%m/%Y")
    weeks_match = re.search(r"(\d+)\s*(semanas?|weeks?)", date_text)
    if weeks_match:
        return (today - timedelta(weeks=int(weeks_match.group(1)))).strftime("%d/%m/%Y")
    months_match = re.search(r"(\d+)\s*(m[eê]s(es)?|months?)", date_text)
    if months_match:
        return (today - timedelta(days=int(months_match.group(1)) * 30)).strftime("%d/%m/%Y")
    return ""


def _extract_company(item: dict, job_title: str) -> tuple[str, str]:
    """Extrai empresa do item, com fallback para sufixo do título.

    O SimplyHired às vezes embute a empresa no título com formato
    ``"Job Title - Company"``. Quando o campo dedicado não existe, removemos
    o sufixo do título e devolvemos a empresa.

    Returns:
        Tupla ``(company, possibly_cleaned_title)``.
    """
    company = (
        item.get("company", "")
        or item.get("companyName", "")
        or item.get("employer", "")
    )
    if not company:
        ci = item.get("companyInfo", {})
        if isinstance(ci, dict):
            company = ci.get("name", "") or ci.get("companyName", "")
    if not company and " - " in job_title:
        parts = job_title.rsplit(" - ", 1)
        job_title = parts[0].strip()
        company = parts[1].strip() if len(parts) > 1 else ""
    return company, job_title


def _extract_hiring_regime(job_types: list) -> str:
    """Mapeia ``jobTypes`` do SimplyHired para o vocabulário interno."""
    for jt in job_types or []:
        jt_lower = jt.lower() if isinstance(jt, str) else ""
        if "integral" in jt_lower or "full" in jt_lower:
            return "CLT"
        if "parcial" in jt_lower or "part" in jt_lower:
            return "Meio Período"
        if "temporário" in jt_lower or "temp" in jt_lower:
            return "Temporário"
        if "estágio" in jt_lower or "intern" in jt_lower:
            return "Estágio"
        if "freelance" in jt_lower or "contract" in jt_lower:
            return "PJ"
    return ""


def _parse_publication_date(item: dict) -> str:
    """Tenta múltiplos campos de data; ISO primeiro, fallback relativo."""
    date_field = (
        item.get("postedAt", "")
        or item.get("datePosted", "")
        or item.get("postedDate", "")
        or item.get("formattedDate", "")
    )
    if not isinstance(date_field, str) or not date_field:
        return ""
    if len(date_field) >= 10 and "-" in date_field:
        d = date_field[:10].split("-")
        if len(d) == 3:
            return f"{d[2]}/{d[1]}/{d[0]}"
    return _parse_relative_date(date_field)


def _parse_job_item(item: dict, seen: set) -> list | None:
    """Converte um item da API SimplyHired em lista canônica.

    Args:
        item: dict do ``props.pageProps.jobs[]``.
        seen: set de URLs já vistas (mutado).

    Returns:
        Lista canônica de 8 campos, ou ``None`` se faltar URL/título ou
        já estiver em ``seen``.
    """
    encoded_url = item.get("encodedUrl", "")
    if not encoded_url:
        return None
    decoded_url = urllib.parse.unquote(encoded_url)
    link = f"https://www.simplyhired.com.br{decoded_url}"
    if link in seen:
        return None
    seen.add(link)

    job_title = item.get("title", "")
    if not job_title:
        return None

    company, job_title = _extract_company(item, job_title)

    location_str = item.get("location", "") or item.get("formattedLocation", "")
    if isinstance(location_str, str) and location_str:
        location = [p.strip() for p in location_str.split(",") if p.strip()][:2]
    else:
        location = []
        location_str = ""

    title_lower = job_title.lower()
    location_lower = location_str.lower()
    remote_attrs = item.get("remoteAttributes", [])
    if remote_attrs or "remoto" in title_lower or "remote" in title_lower or "remoto" in location_lower:
        work_type = "Remoto"
        location = []
    elif "híbrido" in title_lower or "hybrid" in title_lower or "híbrido" in location_lower:
        work_type = "Híbrido"
    else:
        work_type = "Presencial"

    hiring_regime = _extract_hiring_regime(item.get("jobTypes", []) or [])
    salary = item.get("salary", "") or item.get("salaryText", "") or item.get("formattedSalary", "")
    publication_date = _parse_publication_date(item)

    return [link, job_title, company, location, work_type,
            hiring_regime, salary, publication_date]


# --- Função pública ------------------------------------------------------

async def get_simplyhired_jobs(on_job=None) -> list:
    """Coleta vagas do SimplyHired Brasil via Playwright (CF bypass).

    Estratégia: para cada stack do lote ativo, percorre até ``SH_MAX_PAGES``
    páginas. Cada fetch usa Playwright headless para passar o Cloudflare;
    em seguida extraímos o JSON ``__NEXT_DATA__`` embutido no HTML hidratado.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                emitida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos.
    """
    jobs = []
    seen: set[str] = set()

    for stack in get_active_stacks():
        for page in range(1, SH_MAX_PAGES + 1):
            url = f"https://www.simplyhired.com.br/search?q={urllib.parse.quote(stack)}&pn={page}"
            try:
                html = await fetch_html(url, wait_until="domcontentloaded", timeout_ms=30000)
            except Exception:
                break
            if not html:
                break

            match = _RE_NEXT_DATA.search(html)
            if not match:
                break
            try:
                data = json.loads(match.group(1))
            except json.JSONDecodeError:
                break

            job_list = data.get("props", {}).get("pageProps", {}).get("jobs", [])
            if not job_list:
                break

            added = 0
            for item in job_list:
                try:
                    parsed = _parse_job_item(item, seen)
                except Exception:
                    continue
                if not parsed:
                    continue
                jobs.append(parsed)
                added += 1
                if on_job is not None:
                    try:
                        await on_job(parsed)
                    except Exception:
                        pass

            if added == 0:
                break
            await asyncio.sleep(0.3)

    print(f"Foram obtidas {len(jobs)} vagas do site SimplyHired")
    return jobs


def reset_session():
    """No-op: o SimplyHired usa Playwright (sessão gerida em ``browser_fetch``)."""
    pass


# --- Modo debug ----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_simplyhired_jobs())[:10]:
        print(j)

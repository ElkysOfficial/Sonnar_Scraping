"""
Engine Catho — extrai vagas direto do listing (sem fetch de página de detalhe).

Por que sem detail page?
    A Catho redesenhou o site: o ``<li class="jobItem...">`` antigo virou
    ``<article class="offer">``, e a página de detalhe deixou de expor um
    ``<script type="application/json">`` parseável. O listing já entrega
    título, empresa, localização, salário e data — então puxamos tudo
    direto do card e evitamos N+1 fetches.

Design pra escala (auditoria 2026-05-03):
    * URL-encode da stack (evita 404 com ``Vue.js``, ``C#`` etc.).
    * ``get_active_stacks()`` em vez de ``stacks`` — respeita batching.
    * ``max_pages=5`` por stack (ao invés de 10) → menos pressão por sessão.
    * Reset de sessão após 3 stacks vazias seguidas (sinal de ban da Catho).
    * Streaming via ``on_job`` (controller persiste já a primeira vaga).
"""
from __future__ import annotations

import asyncio
import os
import random
import re
import sys
import urllib.parse
from datetime import date

from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_stacks  # noqa: E402


_session = None


def get_session():
    """Sessão ``curl_cffi`` (impersonate Chrome) — preserva cookies entre requests."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome")
        _session.get("https://www.catho.com.br/")  # warm-up de cookies
    return _session


def reset_session() -> None:
    """Descarta a sessão atual (use após 3 respostas vazias seguidas)."""
    global _session
    _session = None


# Regex que aceita 'DD/MM' do tag 'Publicada em DD/MM'.
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
        # Se a data parece estar no futuro, é provável virada de ano: usa o anterior.
        if int(mm) > today.month or (int(mm) == today.month and int(dd) > today.day):
            year = today.year - 1
    except ValueError:
        pass
    return f"{dd}/{mm}/{year}"


def _detect_work_type(title: str) -> str:
    """Heurística simples baseada em palavras do título (Catho não expõe campo estruturado)."""
    t = (title or "").lower()
    if "remoto" in t or "home office" in t or "home-office" in t or "100% home" in t:
        return "Remoto"
    if "híbrido" in t or "hibrido" in t or "hybrid" in t:
        return "Híbrido"
    return "Presencial"


def _parse_card(article) -> list | None:
    """
    Extrai uma vaga de um ``<article class="offer">``.

    Returns:
        Lista no formato canônico esperado pelas engines:
        ``[url, title, company, location, work_type, regime, salary, date]``,
        ou ``None`` se o card não tiver dados mínimos.
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

    # Empresa — span com a microclass usada pela Catho
    company_el = article.select_one("span.text-12")
    company = company_el.get_text(strip=True) if company_el else ""

    # Localização — texto do <p> que contém o ícone i_job_location
    location_str = ""
    for p in article.find_all("p"):
        if p.find("span", class_="i_job_location"):
            text = p.get_text(" ", strip=True)
            text = re.sub(r"^\d+\s*vagas?\s*-?\s*", "", text, flags=re.I)
            text = re.sub(r"^\s*-\s*", "", text)
            location_str = text.strip()
            break

    # Salário — <strong> dentro do <p> que tem o ícone i_salary
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
    """
    Coleta vagas da Catho navegando o listing por stack/página.

    Args:
        on_job: callback opcional ``async fn(parsed_job: list) -> None`` invocado
                a cada vaga parseada. Quando o controller passa esse callback,
                a persistência é em streaming (uma vaga por vez).

    Returns:
        Lista de vagas no formato canônico.
    """
    jobs: list = []
    seen: set[str] = set()
    session = get_session()

    empty_stack_streak = 0  # stacks consecutivas sem nenhuma vaga nova
    max_pages = 5

    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        page = 1
        consecutive_empty_pages = 0
        added_for_stack = 0

        while page <= max_pages and consecutive_empty_pages < 2:
            try:
                if page > 1:
                    await asyncio.sleep(random.uniform(0.5, 1.2))

                url = f"https://www.catho.com.br/vagas/{encoded}/?page={page}"
                response = await asyncio.to_thread(session.get, url, timeout=30)

                if response.status_code != 200:
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
                    parsed = _parse_card(art)
                    if not parsed:
                        continue
                    url_key = parsed[0]
                    if url_key in seen:
                        continue
                    seen.add(url_key)
                    jobs.append(parsed)
                    added_this_page += 1
                    added_for_stack += 1
                    if on_job is not None:
                        try:
                            await on_job(parsed)
                        except Exception:
                            # Falha no callback não pode matar a engine.
                            pass

                consecutive_empty_pages = 0 if added_this_page else consecutive_empty_pages + 1
                page += 1

            except Exception:
                consecutive_empty_pages += 1
                page += 1

        # Detecção de ban: 3 stacks consecutivas sem nenhuma vaga = sessão queimada.
        if added_for_stack == 0:
            empty_stack_streak += 1
            if empty_stack_streak >= 3:
                reset_session()
                session = get_session()
                empty_stack_streak = 0
                await asyncio.sleep(random.uniform(8, 15))  # cool-off
        else:
            empty_stack_streak = 0

        await asyncio.sleep(random.uniform(0.8, 1.5))  # pacing entre stacks

    print(f"Foram obtidas {len(jobs)} vagas do site Catho")
    return jobs


if __name__ == "__main__":
    result = asyncio.run(get_catho_jobs())
    for j in result[:10]:
        print(j)

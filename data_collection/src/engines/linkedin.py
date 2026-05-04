"""
Engine LinkedIn - busca via API pública ``seeMoreJobPostings/search``.

A API devolve HTML estruturado em ``<div class="base-card">``. Iteramos por
stack do lote ativo, paginando 100 vagas por stack (10 chamadas × 10 vagas).
"""
from __future__ import annotations

import os
import sys
import urllib.parse

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from variavel import get_active_stacks  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from src.utils.http_session import HttpSession  # noqa: E402


# --- Sessão (padrão httpx compartilhado) ---------------------------------

_SESSION = HttpSession()


async def get_session():
    return await _SESSION.get_client()


def reset_session() -> None:
    _SESSION.reset()


# --- Função pública --------------------------------------------------------

async def get_linkedin_jobs(on_job=None) -> list:
    """Coleta vagas do LinkedIn via API pública para cada stack do lote ativo.

    Iteração: ``range(0, 100, 10)`` paginando 100 vagas por stack.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                parseada - usado pelo controller pra persistir em streaming.

    Returns:
        Lista no formato canônico ``[link, title, company, location,
        work_type, hiring_regime, salary, publication_date]``.
    """
    jobs = []
    client = await get_session()
    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        for page in range(0, 100, 10):
            response = await client.get(f'https://br.linkedin.com/jobs/api/seeMoreJobPostings/search?keywords={encoded}&location=Brasil&geoId=106057199&start={page}')

            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')

                cells = soup.find_all('div', class_='base-card')
                for cell in cells:
                    link = cell.find('a', class_='base-card__full-link').get('href')
                    job_title = cell.find('h3').get_text(strip=True)
                    company = cell.find('h4').get_text(strip=True)
                    location_raw = cell.find('span', class_='job-search-card__location').get_text(strip=True)

                    # Detecta work_type baseado na localização
                    location_lower = location_raw.lower()
                    if 'remoto' in location_lower or 'remote' in location_lower:
                        work_type = "Remoto"
                    elif 'híbrido' in location_lower or 'hybrid' in location_lower:
                        work_type = "Híbrido"
                    else:
                        work_type = "Presencial"

                    # Localização como lista
                    if work_type == "Remoto":
                        location = []
                    else:
                        # Separar cidade e estado
                        parts = [p.strip() for p in location_raw.split(',') if p.strip()]
                        location = parts[:2] if parts else []

                    # Tenta extrair regime do HTML primeiro
                    hiring_regime = ""
                    # LinkedIn pode ter um elemento com o tipo de emprego
                    employment_type_elem = cell.find('span', class_='job-search-card__job-insight')
                    if employment_type_elem:
                        emp_text = employment_type_elem.get_text(strip=True).lower()
                        if 'tempo integral' in emp_text or 'full-time' in emp_text or 'full time' in emp_text:
                            hiring_regime = "CLT"
                        elif 'meio período' in emp_text or 'part-time' in emp_text or 'part time' in emp_text:
                            hiring_regime = "Meio Período"
                        elif 'contrato' in emp_text or 'contract' in emp_text:
                            hiring_regime = "PJ"
                        elif 'estágio' in emp_text or 'internship' in emp_text:
                            hiring_regime = "Estágio"
                        elif 'temporário' in emp_text or 'temporary' in emp_text:
                            hiring_regime = "Temporário"
                        elif 'voluntário' in emp_text or 'volunteer' in emp_text:
                            hiring_regime = "Voluntário"

                    # Fallback: heurística do título
                    if not hiring_regime:
                        title_lower = job_title.lower()
                        if 'estágio' in title_lower or 'estagio' in title_lower or 'intern' in title_lower:
                            hiring_regime = "Estágio"
                        elif 'freelance' in title_lower or 'freelancer' in title_lower:
                            hiring_regime = "Freelancer"
                        elif 'temporário' in title_lower or 'temporario' in title_lower:
                            hiring_regime = "Temporário"
                        elif 'pj' in title_lower or 'pessoa jurídica' in title_lower:
                            hiring_regime = "PJ"

                    salary = ""
                    time_element = cell.find('time', class_='job-search-card__listdate')
                    date_raw = time_element['datetime'][:10] if time_element and time_element.get('datetime') else ""

                    # Data de publicação no formato brasileiro DD/MM/YYYY
                    if date_raw and len(date_raw) == 10 and '-' in date_raw:
                        parts = date_raw.split('-')
                        publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                    else:
                        publication_date = date_raw

                    job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                    jobs.append(job)
                    if on_job is not None:
                        try:
                            await on_job(job)
                        except Exception:
                            pass
    print(f'Foram obtidas {len(jobs)} vagas do site LinkedIn')
    return jobs


# --- Modo debug ------------------------------------------------------------

if __name__ == "__main__":
    import asyncio

    for j in asyncio.run(get_linkedin_jobs())[:10]:
        print(j)

import asyncio
import os
import sys

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from utils.google_enricher import GoogleEnricher, is_missing_field
from variavel import get_active_stacks
import urllib.parse

# Configuração de enriquecimento (Google Search via Playwright — lento)
# Por padrão desligado: ENABLE_GOOGLE_ENRICHMENT=1 para ligar.
ENRICH_ENABLED = os.getenv("ENABLE_GOOGLE_ENRICHMENT", "0") == "1"
ENRICH_MAX_JOBS = int(os.getenv("LINKEDIN_ENRICH_MAX", "30"))
ENRICH_CONCURRENCY = int(os.getenv("LINKEDIN_ENRICH_CONCURRENCY", "5"))

async def get_linkedin_jobs(on_job=None) -> list:
    """
    Coleta vagas do LinkedIn via API pública ``seeMoreJobPostings/search``
    para cada stack do lote ativo, paginando até 100 resultados por stack.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                parseada — usado pelo controller pra persistir em streaming.
    """
    jobs = []
    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        for page in range(0, 100, 10):
            async with httpx.AsyncClient() as client:
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
    print(f'Foram encontradas {len(jobs)} vagas preliminares no LinkedIn')

    if jobs and ENRICH_ENABLED:
        await _enrich_linkedin_jobs(jobs)

    print(f'Foram obtidas {len(jobs)} vagas do site LinkedIn')
    return jobs


async def _enrich_linkedin_jobs(jobs: list) -> None:
    """Enriquece location/salary em paralelo via Google. Limitado por env vars."""
    sem = asyncio.Semaphore(ENRICH_CONCURRENCY)

    # Seleciona alvos: jobs que precisam de enriquecimento, até ENRICH_MAX_JOBS
    targets = []
    for job_data in jobs:
        loc = job_data[3]
        loc_str = loc if isinstance(loc, str) else (", ".join(loc) if loc else "")
        if is_missing_field(loc_str) or is_missing_field(job_data[6]):
            targets.append(job_data)
            if len(targets) >= ENRICH_MAX_JOBS:
                break

    if not targets:
        return

    print(f'  enriquecendo {len(targets)} vagas (concurrency={ENRICH_CONCURRENCY})...')

    async with GoogleEnricher() as enricher:
        async def _one(job_data):
            async with sem:
                loc = job_data[3]
                loc_str = loc if isinstance(loc, str) else (", ".join(loc) if loc else "")
                needs_location = is_missing_field(loc_str)
                needs_salary = is_missing_field(job_data[6])
                try:
                    enriched = await enricher.enrich_job({
                        "company": job_data[2],
                        "job_title": job_data[1],
                        "location": loc_str,
                        "salary": job_data[6],
                    })
                except Exception:
                    return
                if needs_location and enriched.get("location"):
                    job_data[3] = enriched["location"]
                if needs_salary and enriched.get("salary"):
                    job_data[6] = enriched["salary"]

        await asyncio.gather(*(_one(j) for j in targets), return_exceptions=True)

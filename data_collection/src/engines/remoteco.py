import asyncio
import os
import sys
from curl_cffi import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from utils.google_enricher import GoogleEnricher, is_missing_field
from variavel import stacks


# Sessão global
_session = None


def get_session():
    """Retorna a sessão global, criando se necessário."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate='chrome')
    return _session


async def get_remoteco_jobs() -> list:
    """
    Extrai vagas do Remote.co.
    NOTA: Remote.co usa JavaScript para renderizar vagas, resultados limitados.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()
    session = get_session()

    # Categorias de developer do Remote.co
    categories = [
        'developer',
        'it',
        'software',
        'devops',
        'qa',
    ]

    for category in categories:
        try:
            url = f'https://remote.co/remote-jobs/{category}/'
            response = await asyncio.to_thread(session.get, url, timeout=30)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                # Tentar encontrar links de vagas
                # Remote.co estrutura: links dentro de divs com class específica
                job_links = soup.find_all('a', href=True)

                for link_elem in job_links:
                    try:
                        href = link_elem.get('href', '')
                        text = link_elem.get_text(strip=True)

                        # Filtrar apenas links de vagas individuais
                        if not href or not text:
                            continue
                        if '/remote-jobs/' not in href:
                            continue
                        # Vagas têm mais de 2 barras e não são categorias
                        if href.count('/') < 3:
                            continue
                        # Evitar links de categoria
                        if any(cat in href for cat in ['developer/', 'it/', 'software/', 'devops/', 'qa/', 'feed']):
                            if href.endswith('/'):
                                continue

                        link = href if href.startswith('http') else f'https://remote.co{href}'

                        if link in seen_links:
                            continue
                        seen_links.add(link)

                        job_title = text
                        if not job_title or len(job_title) < 3:
                            continue

                        # Empresa (geralmente não disponível na listagem)
                        company = ''

                        # Remote.co é 100% remoto
                        location = []
                        work_type = 'Remoto'

                        # Regime baseado no título
                        title_lower = job_title.lower()
                        if 'contract' in title_lower:
                            hiring_regime = 'Contractor'
                        elif 'part-time' in title_lower:
                            hiring_regime = 'Part-time'
                        elif 'intern' in title_lower:
                            hiring_regime = 'Internship'
                        else:
                            hiring_regime = 'Full-time'

                        salary = ''
                        publication_date = ''

                        job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                        jobs.append(job)

                    except Exception:
                        continue

        except Exception:
            continue

        await asyncio.sleep(0.3)

    # Enriquecer vagas com salary vazio usando Google
    if jobs:
        async with GoogleEnricher() as enricher:
            for job_data in jobs:
                if is_missing_field(job_data[6]):  # salary está no índice 6
                    enriched = await enricher.enrich_job({
                        "company": job_data[2],
                        "job_title": job_data[1],
                        "location": job_data[3] if isinstance(job_data[3], str) else ", ".join(job_data[3]) if job_data[3] else "",
                        "salary": job_data[6]
                    })
                    if enriched.get("salary"):
                        job_data[6] = enriched["salary"]

    print(f'Foram obtidas {len(jobs)} vagas do site Remote.co')
    return jobs


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


if __name__ == "__main__":
    jobs = asyncio.run(get_remoteco_jobs())
    for job in jobs[:5]:
        print(job)

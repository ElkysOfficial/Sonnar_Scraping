import asyncio
import cloudscraper
import json
import random
from bs4 import BeautifulSoup


def create_scraper_session():
    """Cria uma sessão do cloudscraper configurada para simular navegador real."""
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True,
        }
    )
    return scraper


# Sessão global para reutilizar cookies
_scraper_session = None


def get_scraper():
    """Retorna a sessão global do scraper, criando se necessário."""
    global _scraper_session
    if _scraper_session is None:
        _scraper_session = create_scraper_session()
    return _scraper_session


async def get_bne_job_ids() -> list:
    """Extrai IDs das vagas de emprego da BNE."""
    job_ids = []
    scraper = get_scraper()

    for page in range(1, 3):
        try:
            if page > 1:
                await asyncio.sleep(random.uniform(1, 3))

            response = await asyncio.to_thread(
                scraper.get,
                f'https://www.bne.com.br/vagas-de-emprego-na-area-de-Inform%C3%A1tica?Area=Inform%C3%A1tica&Sort=0&Page={page}',
                timeout=30
            )

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                # Nova estrutura: section com class job__card__container
                jobs = soup.find_all('section', class_='job__card__container')
                for job in jobs:
                    # Extrair job_id do atributo id="job-XXXXXX"
                    job_id = job.get('id', '').replace('job-', '')
                    if job_id:
                        job_ids.append(job_id)
        except Exception:
            continue
    return job_ids


async def fetch_job_details(job_id, semaphore):
    """Extrai detalhes de uma vaga de emprego a partir do ID."""
    async with semaphore:
        await asyncio.sleep(random.uniform(0.5, 1.5))

        scraper = get_scraper()
        link = f'https://www.bne.com.br/vagas-de-emprego/{job_id}'

        try:
            response = await asyncio.to_thread(scraper.get, link, timeout=30)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                scripts = soup.find_all('script', type='application/ld+json')
                if not scripts:
                    return None

                # O primeiro script contém os dados da vaga (índice 0)
                data = json.loads(scripts[0].string)

                if '@type' in data and data['@type'] == 'JobPosting':
                    job_title = data.get('title', '').split(' Cargo/Função:')[0].strip()

                    hiring_org = data.get('hiringOrganization', {})
                    company = hiring_org.get('name', '') if isinstance(hiring_org, dict) else ''

                    job_location = data.get('jobLocation', {})
                    address = job_location.get('address', {}) if isinstance(job_location, dict) else {}
                    location = [
                        address.get('addressLocality', ''),
                        address.get('addressRegion', '')
                    ]

                    # Determinar tipo de trabalho
                    job_location_type = data.get('jobLocationType', '')
                    loc_str = str(location).lower() + ' ' + address.get('streetAddress', '').lower()

                    if job_location_type == 'TELECOMMUTE' or 'remoto' in loc_str or 'home office' in loc_str:
                        work_type = 'Remoto'
                    elif 'híbrido' in loc_str or 'hibrido' in loc_str:
                        work_type = 'Híbrido'
                    else:
                        work_type = 'Presencial'

                    # Regime de contratação
                    employment_type = data.get('employmentType', '')
                    if isinstance(employment_type, list):
                        emp_type = employment_type[0] if employment_type else ''
                    else:
                        emp_type = employment_type

                    hiring_regime = {
                        'CONTRACTOR': 'Autônomo',
                        'PART_TIME': 'Meio Período',
                        'INTERN': 'Estágio',
                        'TEMPORARY': 'Temporário',
                        'FULL_TIME': 'Efetivo',
                    }.get(emp_type, 'Efetivo')

                    # Salário
                    base_salary = data.get('baseSalary', {})
                    if isinstance(base_salary, dict):
                        value = base_salary.get('value', {})
                        if isinstance(value, dict):
                            min_val = value.get('minValue', '')
                            max_val = value.get('maxValue', '')
                            if min_val and max_val:
                                salary = f'R$ {min_val:.0f} - R$ {max_val:.0f}'
                            elif min_val:
                                salary = f'R$ {min_val:.0f}'
                            else:
                                salary = ''
                        else:
                            salary = str(value) if value else ''
                    else:
                        salary = ''

                    # Data no formato brasileiro DD/MM/YYYY
                    date_raw = data.get('datePosted', '')[:10]
                    if date_raw and len(date_raw) == 10 and '-' in date_raw:
                        parts = date_raw.split('-')
                        publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                    else:
                        publication_date = date_raw

                    return [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]

        except Exception:
            pass

        return None


async def get_bne_jobs() -> list:
    """Extrai detalhes das vagas de emprego a partir dos IDs."""
    jobs = []
    job_ids = await get_bne_job_ids()

    # Semáforo para limitar requisições simultâneas
    semaphore = asyncio.Semaphore(5)

    job_details = await asyncio.gather(*[fetch_job_details(job_id, semaphore) for job_id in job_ids])

    for job in job_details:
        if job is not None:
            jobs.append(job)

    print(f'Foram obtidas {len(jobs)} vagas do site BNE')
    return jobs


def reset_session():
    """Reseta a sessão do scraper (útil em caso de bloqueio)."""
    global _scraper_session
    _scraper_session = None

#quero iniciar a função get_bne_jobs aqui e ver com print oque ela retorna
if __name__ == "__main__":
    jobs = asyncio.run(get_bne_jobs())
    for job in jobs:
        print(job)
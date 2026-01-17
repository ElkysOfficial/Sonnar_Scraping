from bs4 import BeautifulSoup
import json
import httpx
from variavel import stacks

async def get_careerjet_links() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, link], [...], [...], ...]

    Each inner list represents a job listing published on the Gupy website.
    '''

    links = []

    for stack in stacks:
        for page in range(1, 2):
            async with httpx.AsyncClient() as client:
                response = await client.get(f'https://www.careerjet.com.br/vagas?s={stack}&l=Brasil&p={page}')
                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    cells = soup.find_all('article', class_='job clicky')
                    for cell in cells:
                        link = cell.find('a').get('href')
                        link = 'https://www.careerjet.com.br' + link

                        links.append(link)
                        
    return links

async def get_careerjet_jobs() -> list:

    jobs = []

    job_links = await get_careerjet_links()

    for link in job_links:
        async with httpx.AsyncClient() as client:
            response = await client.get(link)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                data = soup.find('script', type='application/ld+json')

                if not data:
                    continue

                try:
                    data = json.loads(data.text)
                except json.JSONDecodeError:
                    continue

                job_title = data.get('title', '')

                # Empresa
                hiring_org = data.get('hiringOrganization', {})
                company = hiring_org.get('name', '') if hiring_org else ''
                if not company:
                    company = ''

                # Localização
                job_location = data.get('jobLocation', {})
                address = job_location.get('address', {}) if job_location else {}
                locality = address.get('addressLocality', '')
                region = address.get('addressRegion', '')

                if locality or region:
                    location = []
                    if locality:
                        location.append(locality)
                    if region:
                        location.append(str(region))
                else:
                    location = ''

                # Modalidade de trabalho (Remoto/Híbrido/Presencial)
                job_location_type = data.get('jobLocationType', '')
                title_lower = job_title.lower()

                if job_location_type == 'TELECOMMUTE' or 'remoto' in title_lower or 'remote' in title_lower:
                    work_type = 'Remoto'
                elif 'híbrido' in title_lower or 'hybrid' in title_lower:
                    work_type = 'Híbrido'
                elif location:
                    work_type = 'Presencial'
                else:
                    work_type = 'Remoto'  # Se não tem localização, assume remoto

                # Regime de contratação
                employment_type = data.get('employmentType', '')
                hiring_regime_map = {
                    'FULL_TIME': 'CLT',
                    'PART_TIME': 'Meio Período',
                    'CONTRACTOR': 'PJ',
                    'INTERN': 'Estágio',
                    'TEMPORARY': 'Temporário',
                    'VOLUNTEER': 'Voluntário'
                }

                if isinstance(employment_type, list):
                    # Pega o primeiro tipo válido
                    hiring_regime = ''
                    for emp_type in employment_type:
                        if emp_type in hiring_regime_map:
                            hiring_regime = hiring_regime_map[emp_type]
                            break
                elif employment_type:
                    hiring_regime = hiring_regime_map.get(employment_type, '')
                else:
                    hiring_regime = ''

                # Salário
                try:
                    base_salary = data.get('baseSalary', {})
                    if base_salary:
                        currency = base_salary.get('currency', 'BRL')
                        value = base_salary.get('value', {})

                        if isinstance(value, dict):
                            min_value = value.get('minValue', '')
                            max_value = value.get('maxValue', '')

                            if min_value and max_value:
                                if min_value == max_value:
                                    salary = f'{currency} {min_value}'
                                else:
                                    salary = f'{currency} {min_value} - {max_value}'
                            elif min_value:
                                salary = f'{currency} {min_value}'
                            else:
                                salary = ''
                        else:
                            salary = f'{currency} {value}' if value else ''
                    else:
                        salary = ''
                except:
                    salary = ''

                # Data de publicação no formato brasileiro DD/MM/YYYY
                date_posted = data.get('datePosted', '')
                date_raw = date_posted[:10] if date_posted else ''
                if date_raw and len(date_raw) == 10 and '-' in date_raw:
                    parts = date_raw.split('-')
                    publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                else:
                    publication_date = date_raw

                job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                jobs.append(job)

    print(f'Foram obtidas {len(jobs)} vagas do site careerjet')
    return jobs
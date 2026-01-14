import cloudscraper
import asyncio
import json
import random
from variavel import stacks
from bs4 import BeautifulSoup
from datetime import date, datetime

async def get_indeed_links() -> list:
    """
    Função assíncrona que retorna uma lista de links de vagas do Indeed, com base na stack e número de páginas desejadas.
    """
    links = []

    for stack in stacks:
        for page in range(2):
            scraper = cloudscraper.create_scraper()
            response = await asyncio.to_thread(scraper.get, f'https://br.indeed.com/empregos?q={stack}&limit=50&start={page*50}&sort=date')
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                cells = soup.find_all('div', class_='job_seen_beacon')
                for cell in cells:
                    link = f'https://br.indeed.com/viewjob?jk={cell.find("a").get("data-jk")}'
                    links.append(link)
                break

    return links


async def get_indeed_jobs() -> dict:
    """
    Função assíncrona que retorna um dicionário com detalhes da vaga a partir de um link do Indeed.
    """

    jobs = []
    job_links = await get_indeed_links()
    for link in job_links:
        scraper = cloudscraper.create_scraper()
        response = await asyncio.get_event_loop().run_in_executor(None, scraper.get, link)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            data = soup.find('script', type='application/ld+json')
            data = json.loads(data.text)

            # Extrai título do trabalho:
            job_title = data['title']

            # Extrai empresa:
            company = data['hiringOrganization']['name']
            
            # Extrai localidade:
            try:
                location = [data['jobLocation']['address']['addressLocality'], str(data['jobLocation']['address']['addressRegion'])]
                if location == 'Remoto': 
                    location = ""
            except KeyError:
                location = data['jobLocation']['address']['addressLocality']
                if location == 'Remoto':
                    location = ""

            # Extrai modalidade de trabalho:
            try:
                job_location_type = data.get('jobLocationType', '')
                address_locality = data['jobLocation']['address'].get('addressLocality', '')
                if job_location_type == 'TELECOMMUTE' or 'remoto' in address_locality.lower():
                    work_type = "Remoto"
                elif 'híbrido' in address_locality.lower() or 'hybrid' in str(data).lower():
                    work_type = "Híbrido"
                else:
                    work_type = "Presencial"
            except:
                work_type = ""

            # Extrai regime de contratação:
            try:
                employment_type = data.get('employmentType', '')
                if isinstance(employment_type, list):
                    employment_type = employment_type[0] if employment_type else ''
                hiring_regime_map = {
                    'FULL_TIME': 'CLT',
                    'PART_TIME': 'Meio Período',
                    'CONTRACTOR': 'PJ',
                    'TEMPORARY': 'Temporário',
                    'INTERN': 'Estágio'
                }
                hiring_regime = hiring_regime_map.get(employment_type, '')
            except:
                hiring_regime = ""

            # Extrai salário:
            try:
                currency = data['baseSalary']['currency']
                value = data['baseSalary']['value']
                if isinstance(value, dict):
                    min_val = value.get('minValue', value.get('value', ''))
                    max_val = value.get('maxValue', min_val)
                    if min_val == max_val:
                        salary = f"{currency} {min_val}"
                    else:
                        salary = f"{currency} {min_val} - {max_val}"
                else:
                    salary = f"{currency} {value}"
            except KeyError:
                salary = ""

            # Extrai data de publicação:
            publication_date = data['datePosted'][:10]

            job = [link, job_title, company, location, work_type,hiring_regime, salary, publication_date]
            jobs.append(job)
        
        await asyncio.sleep(random.uniform(10, 20))

    print(f'Foram obtidas {len(jobs)} vagas')
    return jobs
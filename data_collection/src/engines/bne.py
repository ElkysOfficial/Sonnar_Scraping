import asyncio
import cloudscraper
import json
import random
from bs4 import BeautifulSoup

async def get_bne_links() -> list:
    """Extrai links de vagas de emprego da BNE."""
    links = []
    url = "https://www.bne.com.br"

    for page in range(1, 3):
        scraper = cloudscraper.create_scraper()
        response = await asyncio.to_thread(scraper.get, f'https://www.bne.com.br/vagas-de-emprego-na-area-de-Inform%C3%A1tica?Area=Inform%C3%A1tica&Sort=0&Page={page}')
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            cells = soup.find_all('section', class_='job job__vip__candidacy')
            for cell in cells:
                link = cell.find('a', class_='is-link').get('href')
                links.append(url + link)

    print(f'Foram obtidos {len(links)} links do site bne')
    return links

async def fetch_job_details(link):
    """Extrai detalhes de uma vaga de emprego a partir de um link."""
    scraper = cloudscraper.create_scraper()
    response = await asyncio.to_thread(scraper.get, link)
    if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')

        data = soup.find_all('script', type='application/ld+json')[3]
        data = json.loads(data.string)

        if 'title' in data and 'hiringOrganization' in data:
            job_title = data['title']
            company = data['hiringOrganization']['name']
            location = [data['jobLocation']['address']['addressLocality'], str(
                data['jobLocation']['address']['addressRegion'])]

            try:
                job_location_type = data.get('jobLocationType', '')
                if job_location_type == 'TELECOMMUTE':
                    work_type = 'Remoto'
                else:
                    # Verifica na localização
                    loc_str = str(location).lower()
                    if 'remoto' in loc_str or 'home office' in loc_str:
                        work_type = 'Remoto'
                    elif 'híbrido' in loc_str:
                        work_type = 'Híbrido'
                    else:
                        work_type = 'Presencial'
            except:
                work_type = ""

            if type(data['employmentType']) == list:
                hiring_regime = {
                    'CONTRACTOR': 'Autônomo',
                    'PART_TIME': 'Freelancer',
                    'INTERN': 'Estágio ou Aprendiz',
                    'TEMPORARY': 'Temporário'
                }.get(data['employmentType'][1], 'Efetivo')
            else:
                hiring_regime = 'Efetivo'

            salary = soup.select('li')[5].get_text(strip=True).replace('Salário:', '')
            publication_date = data['datePosted'][:10]

            return [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]

        await asyncio.sleep(random.uniform(10, 20))

    return None


async def get_bne_jobs() -> list:
    """Extrai detalhes das vagas de emprego a partir dos links."""
    jobs = []
    job_links = await get_bne_links()

    job_details = await asyncio.gather(*[fetch_job_details(link) for link in job_links])

    for job in job_details:
        if job is not None:
            jobs.append(job)

    print(f'Foram obtidas {len(jobs)} vagas do site bne')
    return jobs
import asyncio
import cloudscraper
import json
from datetime import date
from bs4 import BeautifulSoup


async def get_bne_links() -> list:
    """Extrai links de vagas de emprego da BNE."""
    links = []
    url = "https://www.bne.com.br"

    for page in range(1, 50):
        scraper = cloudscraper.create_scraper()
        response = await asyncio.to_thread(scraper.get, f'https://www.bne.com.br/vagas-de-emprego-para-desenvolvedor/?Page={page}&Function=desenvolvedor')
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            cells = soup.find_all('section', class_='job job__vip__candidacy')
            for cell in cells:
                link = cell.find('a', class_='is-link').get('href')
                links.append(url + link)

    return links


async def get_bne_jobs() -> list:
    """Extrai detalhes das vagas de emprego a partir dos links."""
    jobs = []
    job_links = await get_bne_links()

    for link in job_links:
        scraper = cloudscraper.create_scraper()
        response = await asyncio.get_event_loop().run_in_executor(None, scraper.get, link)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')

            data = soup.find_all('script', type='application/ld+json')[3]
            data = json.loads(data.string)
            if 'title' in data and 'hiringOrganization' in data:
                job_title = data['title']

                company = data['hiringOrganization']['name']

                location = [data['jobLocation']['address']['addressLocality'],str(data['jobLocation']['address']['addressRegion'])]

                try:
                    work_type = 'Home Office' if data['jobLocationType'] == 'TELECOMMUTE' else ""
                except KeyError:
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

                jobs.append([link, job_title, company, location,work_type, hiring_regime, salary, publication_date])
    return jobs


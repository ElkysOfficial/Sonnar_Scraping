import json
from bs4 import BeautifulSoup
import cloudscraper
import asyncio
import random
from variavel import stacks

async def get_catho_links() -> list:
    links = []

    for stack in stacks:
        for page in range(1, 140):
            scraper = cloudscraper.create_scraper()
            response = await asyncio.to_thread(scraper.get, f'https://www.catho.com.br/vagas/{stack}/?page={page}')
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                cells = soup.find_all('li', class_='search-result-custom_jobItem__OGz3a')
                for cell in cells:
                    link = cell.find('a').attrs['href']
                    links.append(link)

    print(f'Foram obtidos {len(links)} links do site catho')
    return links


async def get_catho_jobs() -> list:
    jobs = []
    # Assuming you have a function to get the job links
    job_links = await get_catho_links()

    for link in job_links:
        scraper = cloudscraper.create_scraper()
        response = await asyncio.get_event_loop().run_in_executor(None, scraper.get, link)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            data = soup.find('script', type='application/json')
            data = json.loads(data.text)

            job_title = data['props']['pageProps']['jobAdData']['titulo']
            company = data['props']['pageProps']['jobAdData']['contratante']['nome']
            location = []
            for vaga in data['props']['pageProps']['jobAdData']['vagas']:
                location.append(str(vaga.get('cidade', '')))
                location.append(vaga.get('uf', ''))

            work_type = data['props']['pageProps']['jobAdData']['horario']
            if work_type is None:
                work_type = ""

            hiring_regime = data['props']['pageProps']['jobAdData']['regimeContrato']
            try:
                salary = data['props']['pageProps']['jobAdData']['faixaSalarial']
            except KeyError:
                salary = "A combinar"

            publication_date = data['props']['pageProps']['jobAdData']['data'][:10]

            job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
            jobs.append(job)

        await asyncio.sleep(random.uniform(5, 10))

    print(f'Foram obtidas {len(jobs)} vagas do site catho')
    return jobs

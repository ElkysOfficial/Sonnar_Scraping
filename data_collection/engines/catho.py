import json
from bs4 import BeautifulSoup
import cloudscraper
import asyncio
from datetime import date, datetime
from variavel import stacks

async def get_catho_links() -> list:
    links = []

    max_retries = 5

    for stack in stacks:
        for page in range(1, 3):
            print(f"Obtendo empregos de {stack}, página {page}...")
            scraper = cloudscraper.create_scraper()
            loop = asyncio.get_event_loop()
            retries = 0
            while retries < max_retries:
                response = await loop.run_in_executor(None, scraper.get, f'https://www.catho.com.br/vagas/{stack}/?page={page}')
                print(response.status_code)

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    cells = soup.find_all('li', class_='search-result-custom_jobItem__OGz3a')
                    for cell in cells:
                        link = cell.find('a').attrs['href']
                        links.append(link)
                    break
                else:
                    retries += 1
                    await asyncio.sleep(10)
                    print(f"Tentativa {retries}/{max_retries} para a página {page}, código de status: {response.status_code}")
    return links

async def get_catho_jobs() -> list:
    jobs = []
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

    return jobs

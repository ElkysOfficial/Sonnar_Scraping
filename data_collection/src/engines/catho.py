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

            job_data = data['props']['pageProps']['jobAdData']

            job_title = job_data.get('titulo', '')

            # Empresa
            contratante = job_data.get('contratante', {})
            company = contratante.get('nome', 'Não informado')

            # Localização
            location = []
            for vaga in job_data.get('vagas', []):
                cidade = vaga.get('cidade', '')
                uf = vaga.get('uf', '')
                if cidade:
                    location.append(str(cidade))
                if uf:
                    location.append(uf)

            # Modalidade de trabalho (Remoto/Híbrido/Presencial)
            modalidade = job_data.get('modeloTrabalho', '')
            if modalidade:
                work_type = modalidade
            else:
                # Tenta inferir da descrição ou título
                titulo_lower = job_title.lower()
                descricao = job_data.get('descricao', '').lower()
                if 'remoto' in titulo_lower or 'remoto' in descricao or 'home office' in descricao:
                    work_type = 'Remoto'
                elif 'híbrido' in titulo_lower or 'híbrido' in descricao:
                    work_type = 'Híbrido'
                else:
                    work_type = 'Presencial'

            # Regime de contratação
            hiring_regime = job_data.get('regimeContrato', '')
            if not hiring_regime:
                hiring_regime = 'Não informado'

            # Salário
            salary = job_data.get('faixaSalarial', '')
            if not salary:
                salary = 'A combinar'

            # Data de publicação
            data_pub = job_data.get('data', '')
            publication_date = data_pub[:10] if data_pub else ''

            job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
            jobs.append(job)

        await asyncio.sleep(random.uniform(5, 10))

    print(f'Foram obtidas {len(jobs)} vagas do site catho')
    return jobs

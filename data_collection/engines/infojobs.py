import httpx
import json
from bs4 import BeautifulSoup
from variavel import stacks

async def get_infojobs_links() -> list:
    """
    Coleta links de vagas do InfoJobs com base em stacks.
    """
    links = []

    for stack in stacks:
        for page in range(1, 5):
            async with httpx.AsyncClient() as client:
                response = await client.get(f'https://www.infojobs.com.br/empregos.aspx?palabra={stack}&page={page}&limit=20')

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')

                    cells = soup.find_all('div', class_='js_vacancyLoad')
                    for cell in cells:
                        link = f'https://www.infojobs.com.br{cell["data-href"]}'
                        links.append(link)

    return links


async def get_infojobs_jobs() -> dict:
    """
    Extrai dados de cada vaga a partir dos links coletados.
    """
    jobs = []

    links = await get_infojobs_links()

    for link in links:
        async with httpx.AsyncClient() as client:
            response = await client.get(link)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            data = soup.find('script', type='application/ld+json')

            if data:
                data = json.loads(data.text)

                jobTitle = data['title']
                company = data['hiringOrganization']['name']

                try:
                    location = [data['jobLocation']['address']['addressLocality'],data['jobLocation']['address']['addressRegion']]
                except KeyError:
                    location = ""

                work_type = soup.find('div', class_='text-medium small font-weight-bold mb-4').get_text(strip=True)

                hiring_regime = soup.find_all('p')[2].get_text(strip=True).split('Tipo de contrato e Jornada:')[1].replace('- Período Integral', '')

                publication_date = data['datePosted'][:10]

                salary = ""

                job = [link, jobTitle, company, location, work_type,hiring_regime, salary, publication_date]
                jobs.append(job)
    return jobs

import httpx
from bs4 import BeautifulSoup
from variavel import stacks

async def get_infojobs_links() -> list:
    """
    Coleta links de vagas do InfoJobs com base em stacks.
    """

    links = []
    
    for stack in stacks:
        for page in range(1, 4):
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

            jobTitle = soup.find('h2', class_='js_vacancyHeaderTitle').get_text(strip=True)
            company = soup.find('div', class_='h4').get_text(strip=True)
            locationDivs = soup.find_all('div', class_='text-medium mb-4')
            if locationDivs:
                location = locationDivs[0].get_text(strip=True).replace(',km de você.', '')
                salary = ' '.join(filter(lambda a: a != '', locationDivs[1].get_text(strip=True).split(' '))).replace('(Bruto mensal)', '')

            work_type = soup.find('div', class_='text-medium small font-weight-bold mb-4').get_text(strip=True)
            hiringregimeDivs = soup.find_all('p')
            if hiringregimeDivs:
                hiring_regime = hiringregimeDivs[2].get_text(strip=True).replace('Tipo de contrato e Jornada:', '').replace('- Período Integral', '')

            publication_date = soup.find('div', class_='caption text-medium text-nowrap text-right mb-8').get_text(strip=True)

            job = [link, jobTitle, company, location, work_type, hiring_regime, salary, publication_date]
            jobs.append(job)

    return jobs

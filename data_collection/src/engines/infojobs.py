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
        for page in range(1, 2):
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

                # Localização como lista
                try:
                    locality = data['jobLocation']['address'].get('addressLocality', '')
                    region = data['jobLocation']['address'].get('addressRegion', '')
                    location = []
                    if locality:
                        location.append(locality)
                    if region:
                        location.append(region)
                except (KeyError, TypeError):
                    location = []

                try:
                    work_type = soup.find('div', class_='text-medium small font-weight-bold mb-4').get_text(strip=True)
                except:
                    work_type = ""

                try:
                    hiring_regime = soup.find_all('p')[2].get_text(strip=True).split('Tipo de contrato e Jornada:')[1].replace('- Período Integral', '').strip()
                except:
                    hiring_regime = ""

                # Data de publicação no formato brasileiro DD/MM/YYYY
                date_raw = data['datePosted'][:10]
                if date_raw and len(date_raw) == 10 and '-' in date_raw:
                    parts = date_raw.split('-')
                    publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                else:
                    publication_date = date_raw

                # Tenta extrair salário do JSON-LD ou do HTML
                try:
                    salary_data = data.get('baseSalary', {})
                    if salary_data:
                        currency = salary_data.get('currency', 'BRL')
                        value = salary_data.get('value', {})
                        if isinstance(value, dict):
                            min_val = value.get('minValue', '')
                            max_val = value.get('maxValue', min_val)
                            salary = f"{currency} {min_val} - {max_val}" if min_val else ""
                        else:
                            salary = f"{currency} {value}" if value else ""
                    else:
                        # Tenta buscar no HTML
                        salary_elem = soup.find('span', class_='salary')
                        salary = salary_elem.get_text(strip=True) if salary_elem else ""
                except:
                    salary = ""

                job = [link, jobTitle, company, location, work_type,hiring_regime, salary, publication_date]
                jobs.append(job)
                
    print(f'Foram obtidas {len(jobs)} vagas do site InfoJobs')
    return jobs

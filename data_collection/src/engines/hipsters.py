import httpx
import json
from datetime import datetime, date
from bs4 import BeautifulSoup
from variavel import stacks

async def get_hipsters_links():

    links = []

    for stack in stacks:
        for page in range(1, 2):
            async with httpx.AsyncClient() as client:
                response = await client.post(f'https://hipsters.jobs/jobs/?q={stack}&p={page}')

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, "html.parser")
                    cells = soup.find_all("article", class_="media well listing-item listing-item__jobs")
                    for cell in cells:
                        link = cell.find("a", class_="link").get("href")
                        links.append(link)

    return links

async def get_hipsters_jobs() -> list:

    jobs = []

    job_links = await get_hipsters_links()

    for link in job_links:
        async with httpx.AsyncClient() as client:
            response = await client.get(link)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                data = soup.find('script', type='application/ld+json')
                data = json.loads(data.text)


                job_title = data['title']
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
                    work_type = data['jobLocationType']
                    if work_type == 'TELECOMMUTE':
                        work_type = 'Remoto'
                except KeyError:
                    work_type = ""
                    
                try:
                    hiring_regime = soup.find_all('span', class_='job-type__value')[0].get_text(strip=True)
                except:
                    hiring_regime = ""

                # Tenta extrair salário do JSON-LD
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
                        salary = ""
                except:
                    salary = ""

                # Data de publicação no formato brasileiro DD/MM/YYYY
                date_raw = data['datePosted'][:10]
                if date_raw and len(date_raw) == 10 and '-' in date_raw:
                    parts = date_raw.split('-')
                    publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                else:
                    publication_date = date_raw

        job = [link, job_title, company, location, work_type,hiring_regime, salary, publication_date]
        jobs.append(job)

    print(f'Foram obtidas {len(jobs)} vagas do site Hipsters')
    return jobs


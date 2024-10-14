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

    print(f'Foram obtidos {len(links)} links')
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

                try:
                    location = data['jobLocation']['address']['addressLocality']
                except KeyError:
                    location = ""

                try:
                    work_type = data['jobLocationType']
                    if work_type == 'TELECOMMUTE':
                        work_type = 'Remoto'
                except KeyError:
                    work_type = ""
                    
                hiring_regime = soup.find_all('span', class_='job-type__value')[0].get_text(strip=True)

                salary = ''	

                publication_date = data['datePosted'][:10]
        
        job = [link, job_title, company, location, work_type,hiring_regime, salary, publication_date]
        jobs.append(job)

    print(f'Foram obtidas {len(jobs)} vagas')
    return jobs


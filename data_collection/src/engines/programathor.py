import httpx
import asyncio
import json
import re
from bs4 import BeautifulSoup

def check_none(value) -> str:
    '''
    Checks whether the value is None and, if not, returns the stripped text of the value.
    '''
    if value == None:
        return 'Não informado'
    else:
        return value.get_text(strip=True)


async def get_programathor_links() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, jobTitle, company, location, stack, link], [...], [...], ...]

    Each list within the returned list represents a job vacancy published in the ProgramaThor website.
    '''

    links = []

    for page in range(1, 2):
        async with httpx.AsyncClient() as client:
            response = await client.get(f'https://programathor.com.br/jobs/page/{page}')

            if response.status_code == 200:
                soup = BeautifulSoup(response.content,'html.parser')

                cells = soup.find_all('div', class_='cell-list')
                for cell in cells:
                    jobTitle = cell.find('h3')
                    if jobTitle == None or jobTitle.text.startswith('Vencida'):
                        continue
                    jobTitle = jobTitle.get_text(strip=True)
                    if jobTitle.endswith('NOVA'):
                        jobTitle = jobTitle[:-4]

                    link = f'https://programathor.com.br{cell.find("a")["href"]}'

                    links.append(link)

    print(f'Foram obtidos {len(links)} links')
    return links


import re

async def get_programathor_jobs() -> list:
    jobs = []

    job_links = await get_programathor_links()

    for link in job_links:
        async with httpx.AsyncClient() as client:
            response = await client.get(link)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            data = soup.find('script', type='application/ld+json')
            if data:
                try:
                    # Limpa e carrega o JSON
                    json_text = data.string.strip()
                    json_text = re.sub(r'[\x00-\x1F\x7F-\x9F]', '', json_text)
                    data = json.loads(json_text)

                    job_title = data['title']
                    company = data['hiringOrganization']['name']
                    location = data['jobLocation']['address']['streetAddress']
                    work_type = data['jobLocation']['address']['addressLocality']
                    hiring_regime = data['employmentType']
                    if hiring_regime == 'FULL_TIME':
                        hiring_regime = 'CLT'
                    else:
                        hiring_regime = 'PJ'
                    publication_date = data['datePosted']

                    try:
                        salary = data['baseSalary']['value']['value']
                    except KeyError:
                        salary = "Não especificado"

                except Exception as e:
                    print(f"Erro ao processar vaga {link}: {str(e)}")
                    continue

                job = [link, job_title, company, location, work_type,hiring_regime, salary, publication_date]
                jobs.append(job)

    print(f'Foram obtidas {len(jobs)} vagas')
    return jobs

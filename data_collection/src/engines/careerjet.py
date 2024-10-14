from bs4 import BeautifulSoup
import json
import httpx
from variavel import stacks

async def get_careerjet_links() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, link], [...], [...], ...]

    Each inner list represents a job listing published on the Gupy website.
    '''

    links = []

    for stack in stacks:
        for page in range(1, 2):
            async with httpx.AsyncClient() as client:
                response = await client.get(f'https://www.careerjet.com.br/vagas?s={stack}&l=Brasil&p={page}')
                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    cells = soup.find_all('article', class_='job clicky')
                    for cell in cells:
                        link = cell.find('a').get('href')
                        link = 'https://www.careerjet.com.br' + link

                        links.append(link)
                        
    print(f'Foram obtidos {len(links)} links do site careerjet')
    return links

async def get_careerjet_jobs() -> list:

    jobs = []

    job_links = await get_careerjet_links()

    for link in job_links:
        async with httpx.AsyncClient() as client:
            response = await client.get(link)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                data = soup.find('script', type='application/ld+json')
                data = json.loads(data.text)

                job_title = data['title']

                company = data['hiringOrganization']['name']
                if company == None:
                    company = ''

                if 'addressRegion' not in data['jobLocation']['address'] or data['jobLocation']['address']['addressRegion'] is None:
                    location = ''
                else:
                    location = [data['jobLocation']['address']['addressLocality'],str(data['jobLocation']['address']['addressRegion'])]

                if 'addressRegion' not in data['jobLocation']['address'] or data['jobLocation']['address']['addressRegion'] is None:
                    work_type = 'Remoto'
                else:
                    work_type = ''

                if isinstance(data['employmentType'], list) and len(data['employmentType']) > 1:
                    hiring_regime = {
                        'CONTRACTOR': 'Contrato',
                        'INTERN': 'Estágio ou Aprendiz',
                        'TEMPORARY': 'Temporário',
                        'VOLUNTEER': 'Voluntário'
                    }.get(data['employmentType'][1], 'Permanente')  # Get second element
                else:
                    hiring_regime = 'Permanente'

                try:
                    currency = data['baseSalary']['currency']
                    min_value = data['baseSalary']['value']['minValue']
                    max_value = data['baseSalary']['value']['maxValue']

                    if min_value == max_value:
                        salary_range = f'{min_value}'
                    else:
                        salary_range = f'{min_value} - {max_value}'

                    salary = f'{currency}, {salary_range}'

                except KeyError:
                    salary = ''

                publication_date = data['datePosted'][:10]

        job = [link, job_title, company, location, work_type,hiring_regime, salary, publication_date]
        jobs.append(job)

    print(f'Foram obtidas {len(jobs)} vagas do site careerjet')
    return jobs
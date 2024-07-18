import cloudscraper
import asyncio
from bs4 import BeautifulSoup

async def get_indeed_jobs() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, code], [...], [...], ...]

    Each list within the returned list represents a job vacancy published in the Indeed website.
    '''

    jobs = []
    stacks = ['python', 'javascript', 'java', 'php', 'desenvolvedor c', 'ruby', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'analista ti','cibersegurança', 'devops', 'UX & Desing', 'Data Science', 'Mobile', 'QA', 'SAP', 'Mainframe', 'Analista de Dados', 'Analista de Sistemas', 'Analista de Suporte', 'Analista de Testes', 'Pentest', 'Analista de Infraestrutura', 'Analista de Redes']

    for stack in stacks:
        for page in range(2):
            scraper = cloudscraper.create_scraper()
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, scraper.get, f'https://br.indeed.com/empregos?q={stack}&limit=50&start={page*50}&sort=date')

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                
                cells = soup.find_all('div', class_='job_seen_beacon')
                for cell in cells:
                    title = cell.find('h2', class_='jobTitle').text.strip()
                    code = cell.find('a').attrs['data-jk']
                    company = cell.find('span', class_='css-1x7z1ps eu4oa1w0')
                    if company is not None:
                        company = company.text.strip()
                    else:
                        company = "Não disponível"
                    location = cell.find('div', {'data-testid': 'text-location'}).text.strip()
                    link = f'https://br.indeed.com/viewjob?jk={code}'

                    job = [code, title, company, location, link]
                    jobs.append(job)

    return jobs


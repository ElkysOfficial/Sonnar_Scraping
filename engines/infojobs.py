import httpx
from bs4 import BeautifulSoup

async def get_infojobs_jobs() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, mode, link], [...], [...], ...]

    Each list within the returned list represents a job vacancy published in the InfoJobs website.
    '''
    
    jobs = []
    stacks = ['python', 'javascript', 'java', 'c++', 'c#', 'c', 'php', 'ruby', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'cybersegurança', 'devops']

    for stack in stacks:
        for page in range (1, 6):
            async with httpx.AsyncClient() as client:
                response = await client.get(f'https://www.infojobs.com.br/empregos.aspx?palabra={stack}&page={page}&limit=20')

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    
                    cells = soup.find_all('div', class_='card')
                    for cell in cells:
                        title = cell.find('h2')
                        if title == None:
                            continue
                        title = title.get_text(strip=True)

                        code = cell.find('div')['data-id']
                        code = f'InfoJobs - {code}'
                        company = cell.find('div', class_='text-body').get_text(strip=True)
                        location = cell.find('div', class_='mr-24').get_text(strip=True).split(',')[0]
                        mode = cell.find('div', class_='caption').get_text(strip=True)
                        link = f'https://www.infojobs.com.br{cell.find("div")["data-href"]}'

                        job = [code, title, company, location, mode, link]
                        jobs.append(job)

    return jobs
import httpx
from bs4 import BeautifulSoup

async def get_infojobs_jobs() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, stack, link], [...], [...], ...]

    Each list within the returned list represents a job vacancy published in the LinkedIn website.
    '''

    jobs = []
    stacks = ['python']
    # stacks = ['python', 'javascript', 'java', 'c++', 'c#', 'c', 'php', 'ruby', 'swift', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'cybersegurança', 'devops']

    for stack in stacks:
        for page in range (1):
            async with httpx.AsyncClient() as client:
                response = await client.get(f'https://www.infojobs.com.br/empregos.aspx?palabra={stack}&page={page}&limit=20')
                soup = BeautifulSoup(response.text, 'html.parser')
                
                cells = soup.find_all('div', class_='card')

                for cell in cells:
                    title = cell.find('h2')
                    if title == None:
                        continue
                    title = title.get_text(strip=True)

                    code = cell.find('div')['data-id']
                    # company = cell.find('a', class_='text-body').get_text(strip=True)
                    location = cell.find('div', class_='mr-24').get_text(strip=True).split(',')[0]
                    mode = cell.find('div', class_='caption').get_text(strip=True)
                    # link = cell.find('a', class_='text-decoration-none')['href']

                    job = [code, title, location, mode]
                    jobs.append(job)

    return jobs

# O código abaixo possui função apenas para teste, não sendo necessário no release
# O asyncio.run deve ser invocado pelo bot do Discord

import asyncio
resultados = asyncio.run(get_infojobs_jobs())

for resultado in resultados:
    print('-'*50)
    print(resultado)
    # print(f'Código: {resultado[0]}')
    # print(f'Título da Vaga: {resultado[1]}')
    # print(f'Empresa: {resultado[2]}')
    # print(f'Local: {resultado[3]}')
    # print(f'Modalidade: {resultado[4]}')
    # print(f'Link: {resultado[5]}')
    print('-'*50+'\n')
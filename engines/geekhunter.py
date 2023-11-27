import httpx
from bs4 import BeautifulSoup
import asyncio

async def get_geekhunter_jobs() -> list:

    base_url = 'https://www.geekhunter.com.br'
    jobs = []

    async with httpx.AsyncClient() as client:
        response = await client.get(f'{base_url}/vagas/')
        soup = BeautifulSoup(response.content, 'html.parser')

        cells = soup.find_all('div', class_='css-1g6fhjg')
        for cell in cells:
            title = cell.find('h3')

            if title == None:
                continue

            title = title.get_text(strip=True)
            location = cell.find('p')
            stack = cell.find('p').find_next_sibling()
            area = cell.find('p')
            link = base_url + cell.find('div')['href']

            job = [title, location, stack, area, link]

            jobs.append(job)
    
    return jobs

# O código abaixo possui função apenas para teste, não sendo necessário no release
# O asyncio.run deve ser invocado pelo bot do Discord

resultados = asyncio.run(get_geekhunter_jobs())

for resultado in resultados:
    print('-'*50)
    print(f'Título da Vaga: {resultado[0]}')
    print(f'Local: {resultado[1]}')
    print(f'Stack: {resultado[2]}')
    print(f'Area: {resultado[3]}')
    print(f'Link: {resultado[4]}')
    print('-'*50+'\n')
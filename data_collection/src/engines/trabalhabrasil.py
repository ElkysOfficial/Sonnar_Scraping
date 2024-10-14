import asyncio
from bs4 import BeautifulSoup
import json
import httpx

async def get_careerjet_links() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, link], [...], [...], ...]

    Each inner list represents a job listing published on the Gupy website.
    '''

    links = []

    for page in range(1, 2):
        async with httpx.AsyncClient() as client:
            response = await client.get(f'https://www.trabalhabrasil.com.br/vagas-empregos/desenvolvedor?pagina={page}')
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                cells = soup.find_all('article', class_='job clicky')
                for cell in cells:
                    link = cell.find('a', class_="jobCard").get('href')
                    print(link)

                    links.append(link)

    print(f'Foram obtidos {len(links)} links')
    return links

# crie main para executar o codigo
async def main():
    await get_careerjet_links()

if __name__ == '__main__':
    asyncio.run(main())
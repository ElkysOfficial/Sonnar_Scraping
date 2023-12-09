import asyncio
import cloudscraper
from bs4 import BeautifulSoup

async def get_vagas_jobs():
  jobs = []
  stacks = ['python', 'javascript']
  scraper = cloudscraper.create_scraper()

  async def fetch(url):
    loop = asyncio.get_event_loop()
    future = loop.run_in_executor(None, scraper.get, url)
    response = await future
    return response

  for stack in stacks:
      response = await fetch(f'https://www.vagas.com.br/vagas-de-{stack}')

      soup = BeautifulSoup(response.text, 'html.parser')
      cells = soup.find_all('li', class_='vaga')
      for cell in cells:
        title = cell.find('h2', class_='cargo').text.strip()
        link = cell.find('a').attrs['href']
        job = [title,link]
        jobs.append(job)

  return jobs

# O código abaixo possui função apenas para teste, não sendo necessário no release
# O asyncio.run deve ser invocado pelo bot do Discord

resultados = asyncio.run(get_vagas_jobs())

for resultado in resultados:
    print('-'*50)
#     print(f'Código: {resultado[0]}')
    print(f'Título da Vaga: {resultado[0]}')
#     print(f'Empresa: {resultado[2]}')
#     print(f'Local: {resultado[3]}')
    print(f'Link: {resultado[1]}')
#     print('-'*50+'\n')
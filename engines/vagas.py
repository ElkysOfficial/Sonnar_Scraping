import asyncio
import cloudscraper
from bs4 import BeautifulSoup

async def get_vagas_jobs():
  jobs = []
  stacks = ['python', 'javascript', 'java', 'c++', 'c#', 'c', 'php', 'ruby', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws',
            'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'cybersegurança', 'devops']
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
        link = f'https://www.vagas.com.br{link}'
        company = cell.find('span', class_='emprVaga').text.strip()
        senioridade = cell.find('span', class_='nivelVaga').text.strip()
        locate = cell.find('span', class_='vaga-local').text.strip()
        job = [title,company,senioridade,locate,link]
        jobs.append(job)

  return jobs

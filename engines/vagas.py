import asyncio
import cloudscraper
from variavel import stacks
from bs4 import BeautifulSoup

async def get_vagas_links():
  links = []
  scraper = cloudscraper.create_scraper()

  async def fetch(url):
    loop = asyncio.get_event_loop()
    future = loop.run_in_executor(None, scraper.get, url)
    response = await future
    return response

  for stack in stacks:
      response = await fetch(f'https://www.vagas.com.br/vagas-de-{stack}')
      
      if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')
        cells = soup.find_all('li', class_='vaga')
        for cell in cells:
          link = f'https://www.vagas.com.br{cell.find('a').attrs['href']}'
          
          links.append(link)

  return links


async def get_vagas_jobs() -> list:

    jobs = []
    job_links = await get_vagas_links()
    for link in job_links:
      scraper = cloudscraper.create_scraper()
      response = await asyncio.get_event_loop().run_in_executor(None, scraper.get, link)

      if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')

        job_title = soup.find('h1', class_='job-shortdescription__title').get_text(strip=True)

        company = soup.find('h2', class_='job-shortdescription__company').get_text(strip=True)

        location = soup.find('span', class_='info-localizacao').get_text(strip=True)
        if location == "100% Home Office" and "Todo o Brasil":
          location = ''
          
        work_type = soup.find('span', class_='info-localizacao').get_text(strip=True)
        if work_type == "100% Home Office" or "Todo o Brasil":
          work_type = "100% Home Office"
        else:
          work_type = ''

        hiring_regime = soup.find('span', class_='info-modelo-contratual').get_text(strip=True)

        salary_elements = soup.find_all('span')  # Obtém a lista de elementos <span>
        salary = 'a combinar'  # Valor padrão caso não encontre o salário
        for span in salary_elements:
            text = span.get_text(strip=True)
            if text.startswith('Salário'):  # Verifica se o texto começa com 'Salário'
                text = text.replace('Salário', '')  # Remove a palavra 'Salário'
                if text == 'Faixa salarial':
                    salary = 'a combinar'
                    break  # Para a busca ao encontrar 'Faixa salarial'
                else:
                    salary = text
                    break

        publication_date = soup.find('li', class_='job-breadcrumb__item job-breadcrumb__item--published job-breadcrumb__item--nostyle').get_text(strip=True).replace('Publicada em', '')

        job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
        jobs.append(job)

    return jobs


from bs4 import BeautifulSoup
import cloudscraper
import asyncio

async def get_catho_jobs() -> list:

  jobs = []

  stacks = ['python', 'javascript', 'java', 'php', 'desenvolvedor c', 'ruby', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'analista ti','cibersegurança', 'devops', 'UX & Desing', 'Data Science', 'Mobile', 'QA', 'SAP', 'Mainframe', 'Analista de Dados', 'Analista de Sistemas', 'Analista de Suporte', 'Analista de Testes', 'Pentest', 'Analista de Infraestrutura', 'Analista de Redes', 'Seguranca da Informacao']
  
  for stack in stacks:
    scraper = cloudscraper.create_scraper()
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, scraper.get, f'https://www.catho.com.br/vagas/{stack}/')

    if response.status_code == 200:
      soup = BeautifulSoup(response.text, 'html.parser')
      cells = soup.find_all('li', class_='search-result-custom_jobItem__OGz3a')
      for cell in cells:
        link = cell.find('a').attrs['href']  
        title = cell.find('h2', class_='bACWKm')
        if title == None:
          continue
        title = title.get_text(strip=True)
        company = cell.find('p', class_='sc-sLsrZ iJixUK')
        if company == None:
            continue
        company = company.get_text(strip=True)
        if company == 'Empresa ConfidencialPor que?':
           company = 'Empresa Confidencial'

        job = [link, title, company]
        jobs.append(job)

  return jobs
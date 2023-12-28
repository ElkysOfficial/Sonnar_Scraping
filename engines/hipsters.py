import httpx
from bs4 import BeautifulSoup

async def get_hipsters_jobs():

  jobs = []

  stacks = ['python', 'javascript', 'java', 'php', 'desenvolvedor c', 'ruby', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'analista ti','cibersegurança', 'devops', 'UX & Desing', 'Data Science', 'Mobile', 'QA', 'SAP', 'Mainframe', 'Analista de Dados', 'Analista de Sistemas', 'Analista de Suporte', 'Analista de Testes', 'Pentest', 'Analista de Infraestrutura', 'Analista de Redes', 'Seguranca da Informacao']

  for stack in stacks:
    async with httpx.AsyncClient() as client:
      response = await client.post(f'https://hipsters.jobs/jobs/?q={stack}&l=')
      soup = BeautifulSoup(response.text, "html.parser")
      cells = soup.find_all("article", class_="media well listing-item listing-item__jobs")
      for cell in cells:
        title = cell.find("div", class_="media-heading listing-item__title").get_text(strip=True)
        regime = cell.find("span", class_="listing-item__employment-type").get_text(strip=True)
        company = cell.find("span", class_="listing-item__info--item listing-item__info--item-company").get_text(strip=True)
        location = cell.find("span", class_="listing-item__info--item listing-item__info--item-location").get_text(strip=True)
        link = cell.find("a", class_="link").get("href")

        print('-'*50)
        print(f'TITULO DA VAGA: {title}')
        print(f'REGIME: {regime}')
        print(f'EMPRESA: {company}')
        print(f'LOCALIZAÇÃO: {location}')
        print(f'LINK: {link}')
        print('-'*50)

        job = [title, regime, company, location, link]
        jobs.append(job)

  return jobs




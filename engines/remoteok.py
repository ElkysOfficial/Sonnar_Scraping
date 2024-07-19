from bs4 import BeautifulSoup
import cloudscraper
import asyncio

async def get_remoteok_jobs() -> list:

  jobs = []

  stacks = ['python', 'javascript', 'java', 'php', 'desenvolvedor c', 'ruby', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'analista ti',
            'cibersegurança', 'devops', 'UX & Desing', 'Data Science', 'Mobile', 'QA', 'SAP', 'Mainframe', 'Analista de Dados', 'Analista de Sistemas', 'Analista de Suporte', 'Analista de Testes', 'Pentest', 'Analista de Infraestrutura', 'Analista de Redes', 'Seguranca da Informacao']
  for stack in stacks:
    scraper = cloudscraper.create_scraper()
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, scraper.get, f'https://remoteok.com/remote-{stack}-jobs')
    if response.status_code == 200:
      soup = BeautifulSoup(response.text, 'html.parser')
      cells = soup.find_all('tr', class_='job')
      for cell in cells:
        stacks = cell.find_all('a', class_='no-border tooltip-set action-add-tag')
        stack_list = []
        for stack in stacks:
          h3_tag = stack.find('h3')
          if h3_tag:
            stack_list.append(h3_tag.get_text(strip=True))
        stack = ' - '.join(stack_list)
        cells = cell.find_all('td', class_='company position company_and_position')
        for cell in cells:
          link = f'https://remoteok.com{cell.find('a', class_='preventLink').attrs['href']}'
          title = cell.find('a', class_='preventLink').get_text(strip=True)
          company = cell.find('span', class_='companyLink').get_text(strip=True)
          locate = cell.find('div', class_='location').get_text(strip=True)

          job = [link, title, company, locate, stack]
          jobs.append(job)

  return jobs
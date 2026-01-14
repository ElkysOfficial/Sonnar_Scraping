from bs4 import BeautifulSoup
import cloudscraper
import random
import json
import asyncio
from variavel import stacks

async def get_remoteok_links() -> list:
  links = []

  for stack in stacks:
      scraper = cloudscraper.create_scraper()
      loop = asyncio.get_event_loop()
      response = await loop.run_in_executor(None, scraper.get, f'https://remoteok.com/remote-{stack}-jobs')
      if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')
        cells = soup.find_all('tr', class_='job')
        for cell in cells:
          lia = cell.find_all('a', class_='no-border tooltip-set action-add-tag')
          stack_list = []
          for li in lia:
            h3_tag = li.find('h3')
            if h3_tag:
              stack_list.append(h3_tag.get_text(strip=True))
          stack = ' - '.join(stack_list)
          cells = cell.find_all('td', class_='company position company_and_position')
          for cell in cells:
            link = f'https://remoteok.com{cell.find('a', class_='preventLink').attrs['href']}'

            links.append(link)

  print(f'Foram obtidos {len(links)} links')
  return links


async def get_remoteok_jobs() -> dict:
    """
    Função assíncrona que retorna um dicionário com detalhes da vaga a partir de um link do Indeed.
    """

    jobs = []
    job_links = await get_remoteok_links()
    for link in job_links:
        scraper = cloudscraper.create_scraper()
        response = await asyncio.get_event_loop().run_in_executor(None, scraper.get, link)

        if response.status_code == 200:
          soup = BeautifulSoup(response.text, 'html.parser')
          print(soup)
          data = soup.find_all('script', type='application/ld+json')
          data = data[2]
          data = json.loads(data.text)

          jobTitle = data['title']

          company = data['hiringOrganization']['name']

          location = ""

          try:
              work_type = data['jobLocationType']
              if work_type == 'TELECOMMUTE':
                  work_type = 'Remoto'
          except:
              work_type = "Remoto"  # RemoteOK é sempre remoto

          # Extrai regime de contratação
          try:
              employment_type = data.get('employmentType', '')
              if isinstance(employment_type, list):
                  employment_type = employment_type[0] if employment_type else ''
              hiring_regime_map = {
                  'FULL_TIME': 'Full-time',
                  'PART_TIME': 'Part-time',
                  'CONTRACTOR': 'Contractor',
                  'TEMPORARY': 'Temporary',
                  'INTERN': 'Internship'
              }
              hiring_regime = hiring_regime_map.get(employment_type, 'Full-time')
          except:
              hiring_regime = "Full-time"

          try:
            currency = data['baseSalary']['currency']
            min_value = data['baseSalary']['value']['minValue']
            max_value = data['baseSalary']['value']['maxValue']

            if min_value == max_value:
                salary_range = f'{min_value}'
            else:
                salary_range = f'{min_value} - {max_value}'

            salary = f'{currency}, {salary_range}'

          except KeyError:
            salary = ''

          publication_date = data['datePosted'][:10]

          job = [link, jobTitle, company, location, work_type, hiring_regime, salary, publication_date]
          jobs.append(job)

        await asyncio.sleep(random.uniform(10, 20))

    print(f'Foram obtidas {len(jobs)} vagas')
    return jobs

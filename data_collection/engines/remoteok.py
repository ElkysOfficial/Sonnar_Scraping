from bs4 import BeautifulSoup
import cloudscraper
import json
import asyncio

async def get_remoteok_links() -> list:

  stacks = ['python']
  links = []

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
            print(link)

            links.append(link)

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

          work_type = data['jobLocationType']
          if work_type == 'TELECOMMUTE':
              work_type = 'Remoto'

          hiring_regime = ""

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

          job = [link, jobTitle, company, location, work_type,hiring_regime, salary, publication_date]
          jobs.append(job)
    return jobs


async def main():
    jobs = await get_remoteok_jobs()

    if jobs:
        print(f'\n{'-' * 50}\nExtracted {len(jobs)} job postings from Infojobs:')
        for job in jobs:
            print('\n'.join(f'{field}: {value}' for field, value in zip(
                ['Link', 'Título da Vaga', 'Empresa', 'Localidade',
                  'Modalidade de Trabalho', 'Regime', 'Salário', 'Data de Publicação'],
                job
            )))
            print('-' * 50)
    else:
        print('No job postings found.')
if __name__ == '__main__':
    asyncio.run(main())

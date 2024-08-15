from bs4 import BeautifulSoup
import cloudscraper
import json
import asyncio
from variavel import stacks

async def get_startupjobs_links() -> list:

  links = []

  for stack in stacks:
    for page in range (1,2):
      scraper = cloudscraper.create_scraper()
      loop = asyncio.get_event_loop()
      response = await loop.run_in_executor(None, scraper.get, f'https://startup.jobs/locations/brazil?q={stack}&page={page}')

      if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')
        link = soup.find_all('a', class_='flex items-center gap-1 font-semibold seen:font-medium seen:text-gray-500 text-lg leading-tight hover:underline')
        for link in link:
          link = f'https://startup.jobs{link['href']}'
          if link != "https://startup.jobs{{{path}}}":
              links.append(link)

    print(f'Foram obtidos {len(links)} links')
    return links
  
asyncio.run(get_startupjobs_links())


async def get_startupjobs_jobs() -> dict:
    """
    Função assíncrona que retorna um dicionário com detalhes da vaga a partir de um link do Indeed.
    """

    jobs = []
    job_links = await get_startupjobs_links()
    for link in job_links:
        scraper = cloudscraper.create_scraper()
        response = await asyncio.get_event_loop().run_in_executor(None, scraper.get, link)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            data = soup.find('script', type='application/ld+json')
            data = json.loads(data.text)[0]

            job_title = data['title']

            company = data['hiringOrganization']['name']

            if 'addressRegion' not in data['jobLocation']['address'] or data['jobLocation']['address']['addressRegion'] is None:
              location = ''
            else:
              location = [data['jobLocation']['address']['addressLocality'],str(data['jobLocation']['address']['addressRegion'])]

            try:
              work_type = data['jobLocationType']
              if work_type == 'TELECOMMUTE':
                work_type = 'Remoto'
            except KeyError:
              work_type = ""

            hiring_regime = ''

            salary = ''

            publication_date = data['datePosted'][:10]

            job = [link, job_title, company, location, work_type,hiring_regime, salary, publication_date]
            jobs.append(job)
      
    print(f'Foram obtidas {len(jobs)} vagas')
    return jobs



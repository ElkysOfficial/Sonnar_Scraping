import asyncio
import cloudscraper
from bs4 import BeautifulSoup


async def get_indeed_jobs():
    jobs = []
    job_searches = ['python', 'javascript', 'java', 'c++', 'c#', 'c', 'php', 'ruby', 'go', 'swift', 'sql', 'mysql', 'postgresql',
                    'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'sysops', 'cloud']

    base_url = 'https://br.indeed.com/'
    scraper = cloudscraper.create_scraper()

    async def fetch(url):
        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(None, scraper.get, url)
        response = await future
        return response

    for job_search in job_searches:
      for page in range(2):
        url = base_url + f'empregos?q={job_search}&limit=50&start={page*50}&sort=date'
        response = await fetch(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        cells = soup.find_all('div', class_='job_seen_beacon')

        for cell in cells:
          title = cell.find('h2', class_='jobTitle').text.strip()
          link = cell.find('a').attrs['data-jk']
          url = f'https://br.indeed.com/viewjob?jk={link}'
          company_element = cell.find('span', class_='css-1x7z1ps eu4oa1w0')
          if company_element is not None:
            company = company_element.text.strip()
          else:
            company = "Não disponível"

          location = cell.find(
              'div', {'data-testid': 'text-location'}).text.strip()

          job = [link, title, url, company, location]
          jobs.append(job)

    return jobs

import requests
from bs4 import BeautifulSoup
import cloudscraper
import asyncio

async def get_remoteok_jobs() -> list:

  jobs = []

  stacks = ['python']
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
          title = cell.find('a', class_='preventLink').get_text(strip=True)
          url = cell.find('a', class_='preventLink').attrs['href']
          link = f'https://remoteok.com{url}'
          company = cell.find('span', class_='companyLink').get_text(strip=True)
          locate = cell.find('div', class_='location').get_text(strip=True)

          job = [title, company, locate, stack, link]
          jobs.append(job)


  return jobs
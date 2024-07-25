from bs4 import BeautifulSoup
import cloudscraper
import asyncio
import re
import pandas as pd

async def get_catho_links() -> list:
    all_links = []
    stacks = ['java','python']

    for stack in stacks:
        for page in range(1, 2):
            scraper = cloudscraper.create_scraper()
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, scraper.get, f'https://www.catho.com.br/vagas/{stack}/?page={page}')

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                cells = soup.find_all('li', class_='search-result-custom_jobItem__OGz3a')
                for cell in cells:
                    link = cell.find('a').attrs['href']
                    

                    all_links.append(link)
    return all_links

async def get_catho_jobs(link: str) -> dict:

    jobs = []

    scraper = cloudscraper.create_scraper()
    response = await asyncio.get_event_loop().run_in_executor(None, scraper.get, link)

    if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')
        cells = soup.find('article', class_='Card-module__card-wrapper___HvjEg')
        if cells:

        # Extrai título do trabalho:
            job_title = cells.find('h1').get_text()
            company = cells.find('div', class_="sc-kAkpmWiiwTMQ").find('strong')
            location = cells.find('button', class_="sc-lbJcrp")
            job = [link, job_title,company]
            jobs.append(job)


    return jobs
    

async def main():

    job_links = await get_catho_links()
    for job_link in job_links:
        job_details = await get_catho_jobs(job_link)
        if job_details:
            print(job_details)

if __name__ == "__main__":
    asyncio.run(main())


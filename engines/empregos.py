import requests
from bs4 import BeautifulSoup
from variavel import stacks

links = []

async def get_empregos_links() -> list:
    for stack in stacks:
        for page in range(1, 2):
            response = requests.get(f'https://www.empregos.com.br/vagas/{stack}/p{page}')
            soup = BeautifulSoup(response.text, 'html.parser')
            cells = soup.find_all('div', class_='descricao grid-12-16')
            for cell in cells:
                link = cell.find('a')['href']
                links.append(link)

    return links

async def get_empregos_jobs() -> list:

    jobs = []

    job_links = await get_empregos_links()

    for link in job_links:
        response = requests.get(link)
        soup = BeautifulSoup(response.text, 'html.parser')

        job_title = soup.find('h1', class_='font-montserrat').get_text(strip=True)
        company = soup.select_one('h2[class="text-ciano70 font-montserrat font-medium text-lg"] > a').parent.get_text(strip=True)

        h2 = soup.find_all('h2', class_='text-cinza90 font-montserrat font-normal text-sm margin-bottom-6px mt-1')
        if h2:
            location = h2[0].get_text(strip=True)
            salary = h2[1].get_text(strip=True)
        
        publication_date = soup.find_all('span',class_="text-cinza90 font-montserrat font-normal text-sm mr-1")
        if publication_date:
            publication_date = publication_date[1].get_text(strip=True).replace('| ', '')

        work_type = soup.find('span', class_='text-xs text-laranjalima').get_text(strip=True)

        hiring_regime = soup.find_all('p',class_="font-montserrat font-normal text-sm text-cinza70 text-container")
        if hiring_regime:
           hiring_regime = hiring_regime[1].get_text(strip=True)

        job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
        jobs.append(job)

    return jobs

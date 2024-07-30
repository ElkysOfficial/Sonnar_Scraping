import httpx
from variavel import stacks
from bs4 import BeautifulSoup

async def get_hipsters_links():

    links = []

    for stack in stacks:
        async with httpx.AsyncClient() as client:
            response = await client.post(f'https://hipsters.jobs/jobs/?q={stack}')

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, "html.parser")
                cells = soup.find_all("article", class_="media well listing-item listing-item__jobs")
                for cell in cells:
                    link = cell.find("a", class_="link").get("href")

                    links.append(link)

    return links

async def get_hipsters_jobs() -> list:

    jobs = []

    job_links = await get_hipsters_links()

    for link in job_links:
        async with httpx.AsyncClient() as client:
            response = await client.get(link)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                job_title = soup.find('h1', class_='details-header__title').get_text(strip=True)
                company = soup.find('li', class_='listing-item__info--item listing-item__info--item-company').get_text(strip=True)

                location = soup.find('li', class_='listing-item__info--item listing-item__info--item-location').get_text(strip=True)
                if location == 'Remoto':
                    location = ''

                work_type = soup.find('li', class_='listing-item__info--item listing-item__info--item-location').get_text(strip=True)
                if work_type != 'Remoto':
                    work_type = ''
                    
                hiring_regime = soup.find_all('span', class_='job-type__value')
                if hiring_regime:
                    hiring_regime = hiring_regime[0].get_text(strip=True)

                salary = soup.find('div', class_='details-body__content content-text').get_text(strip=True)
                if salary != 'A combinar':
                    salary = ''	

                publication_date = soup.find('li', class_='listing-item__info--item listing-item__info--item-date').get_text(strip=True)
        

        job = [link, job_title, company, location, work_type,hiring_regime, salary, publication_date]
        jobs.append(job)

    return jobs
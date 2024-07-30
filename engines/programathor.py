import httpx
from bs4 import BeautifulSoup

def check_none(value) -> str:
    '''
    Checks whether the value is None and, if not, returns the stripped text of the value.
    '''
    if value == None:
        return 'Não informado'
    else:
        return value.get_text(strip=True)


async def get_programathor_links() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, jobTitle, company, location, stack, link], [...], [...], ...]

    Each list within the returned list represents a job vacancy published in the ProgramaThor website.
    '''

    links = []

    for page in range(1, 21): 
        async with httpx.AsyncClient() as client:
            response = await client.get(f'https://programathor.com.br/jobs/page/{page}')

            if response.status_code == 200:
                soup = BeautifulSoup(response.content,'html.parser')

                cells = soup.find_all('div', class_='cell-list')
                for cell in cells:
                    jobTitle = cell.find('h3')
                    if jobTitle == None or jobTitle.text.startswith('Vencida'):       
                        continue
                    jobTitle = jobTitle.get_text(strip=True)
                    if jobTitle.endswith('NOVA'):          
                        jobTitle = jobTitle[:-4]
                    
                    link = f'https://programathor.com.br{cell.find("a")["href"]}'

                    links.append(link)

    return links


async def get_programathor_jobs() -> list:
    jobs = []

    job_links = await get_programathor_links()

    for link in job_links:
        async with httpx.AsyncClient() as client:
            response = await client.get(link)
            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')

                job_title = soup.find('h1').get_text(strip=True)

                company = soup.select_one('h2 > a').parent.get_text(strip=True)

                location = soup.select_one('div[class="col-sm-7"] p a').get_text(strip=True)
                if location not in ['Híbrido', 'Home Office (Remoto)']:
                    pass
                else:
                    location = ""

                work_type = soup.select_one('div[class="col-sm-7"] p a').get_text(strip=True)
                if work_type in ['Híbrido', 'Home Office (Remoto)']:
                    pass
                else: 
                    work_type = ""

                hiring_regime = soup.select_one('div[class="col-sm-5"] > p').parent.get_text(strip=True)

                salary = soup.find_all('div', class_='col-sm-7')
                if salary:
                    salary = salary[2].get_text(strip=True).replace('Salário: ', '')

                publication_date = ""

        job = [link, job_title, company, location, work_type,hiring_regime, salary, publication_date]
        jobs.append(job)

    return jobs
import httpx
from variavel import stacks
from bs4 import BeautifulSoup

async def get_linkedin_jobs() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, link], [...], [...], ...]

    Each list within the returned list represents a job vacancy published in the LinkedIn website.
    '''

    jobs = []
    for stack in stacks:
        for page in range(0, 100, 10):
            async with httpx.AsyncClient() as client:
                response = await client.get(f'https://br.linkedin.com/jobs/api/seeMoreJobPostings/search?keywords={stack}&location=Brasil&geoId=106057199&start={page}')

                if response.status_code == 200:
                    soup = BeautifulSoup(response.content, 'html.parser')

                    cells = soup.find_all('div', class_='base-card')
                    for cell in cells:
                        link = cell.find('a', class_='base-card__full-link').get('href')
                        job_title = cell.find('h3').get_text(strip=True)
                        company = cell.find('h4').get_text(strip=True)
                        location = cell.find('span', class_='job-search-card__location').get_text(strip=True)

                        time_element = cell.find('time', class_='job-search-card__listdate')
                        dateOfPublication = time_element['datetime'] if time_element else ""
                        
                        job = [link, job_title, company, location, dateOfPublication]
                        print(job)
                        jobs.append(job)

    return jobs
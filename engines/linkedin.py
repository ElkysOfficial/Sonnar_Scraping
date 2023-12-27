import httpx
from bs4 import BeautifulSoup

async def get_linkedin_jobs() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, link], [...], [...], ...]

    Each list within the returned list represents a job vacancy published in the LinkedIn website.
    '''

    jobs = []
    stacks = ['python', 'javascript', 'java', 'php', 'ruby', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'cybersegurança', 'devops']

    for stack in stacks:
        for page in range(0, 100, 25):
            async with httpx.AsyncClient() as client:
                response = await client.get(f'https://br.linkedin.com/jobs/api/seeMoreJobPostings/search?keywords={stack}&location=Brasil&geoId=106057199&start={page}')

                if response.status_code == 200:
                    soup = BeautifulSoup(response.content, 'html.parser')

                    cells = soup.find_all('div', class_='base-card')
                    for cell in cells:
                        code = ''.join(cell.get('data-entity-urn').split('urn:li:jobPosting:')[1])     # Used to verify if the job was already sent by the Discord bot
                        code = f'LinkedIn - {code}'

                        title = cell.find('h3').get_text(strip=True)
                        company = cell.find('h4').get_text(strip=True)
                        location = cell.find('span', class_='job-search-card__location').get_text(strip=True)
                        link = cell.find('a', class_='base-card__full-link').get('href')

                        job = [code, title, company, location, link]
                        jobs.append(job)

    return jobs
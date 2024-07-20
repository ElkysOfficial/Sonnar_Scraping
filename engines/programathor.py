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


async def get_programathor_jobs() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, jobTitle, company, location, stack, link], [...], [...], ...]

    Each list within the returned list represents a job vacancy published in the ProgramaThor website.
    '''

    jobs = []

    for page in range(1, 21):
        async with httpx.AsyncClient() as client:
            response = await client.get(f'https://programathor.com.br/jobs/page/{page}')

            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')

                cells = soup.find_all('div', class_='cell-list')
                for cell in cells:
                    jobTitle = cell.find('h3')
                    if jobTitle == None or jobTitle.text.startswith('Vencida'):       # Checks if the cell is blank or if the job is expired
                        continue
                    jobTitle = jobTitle.get_text(strip=True)
                    if jobTitle.endswith('NOVA'):          # Removes the 'NOVA' string from the title when it's a new job publishing
                        jobTitle = jobTitle[:-4]
                    
                    link = f'https://programathor.com.br{cell.find("a")["href"]}'
                    details = cell.find('div', class_='cell-list-content-icon')
                    company = check_none(details.find('span'))
                    location = check_none(details.find('span').find_next_sibling())
                    
                    # INSERIR A BUSCA DOS CAMPOS ABAIXO:
                    workType = ''
                    hiringRegime = ''
                    typeOfJourney = ''
                    salary = ''

                    all_stacks = cell.select('.tag-list')
                    desiredQualifications = []
                    for stacks in all_stacks:
                        stacks = check_none(stacks)
                        desiredQualifications.append(stacks)

                    # INSERIR A BUSCA DOS CAMPOS ABAIXO:
                    dateOfPublication = ''
                    levelOfExperience = ''

                    job = [link, jobTitle, company, location, workType, hiringRegime, typeOfJourney, salary, desiredQualifications, dateOfPublication, levelOfExperience]
                    jobs.append(job)

    return jobs
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
                        location_raw = cell.find('span', class_='job-search-card__location').get_text(strip=True)

                        # Detecta work_type baseado na localização
                        location_lower = location_raw.lower()
                        if 'remoto' in location_lower or 'remote' in location_lower:
                            work_type = "Remoto"
                        elif 'híbrido' in location_lower or 'hybrid' in location_lower:
                            work_type = "Híbrido"
                        else:
                            work_type = "Presencial"

                        # Localização como lista
                        if work_type == "Remoto":
                            location = []
                        else:
                            # Separar cidade e estado
                            parts = [p.strip() for p in location_raw.split(',') if p.strip()]
                            location = parts[:2] if parts else []

                        # Tenta extrair regime do título (heurística)
                        title_lower = job_title.lower()
                        if 'estágio' in title_lower or 'estagio' in title_lower or 'intern' in title_lower:
                            hiring_regime = "Estágio"
                        elif 'freelance' in title_lower or 'freelancer' in title_lower:
                            hiring_regime = "Freelancer"
                        elif 'temporário' in title_lower or 'temporario' in title_lower:
                            hiring_regime = "Temporário"
                        else:
                            hiring_regime = ""

                        salary = ""
                        time_element = cell.find('time', class_='job-search-card__listdate')
                        date_raw = time_element['datetime'][:10] if time_element and time_element.get('datetime') else ""

                        # Data de publicação no formato brasileiro DD/MM/YYYY
                        if date_raw and len(date_raw) == 10 and '-' in date_raw:
                            parts = date_raw.split('-')
                            publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                        else:
                            publication_date = date_raw

                        job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                        jobs.append(job)

    print(f'Foram obtidas {len(jobs)} vagas do site LinkedIn')
    return jobs
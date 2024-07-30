from bs4 import BeautifulSoup
import asyncio
import httpx

stacks = [
    # Front-End
    'React', 'Angular', 'Vuejs', 'HTML', 'CSS', 'Svelte',

    # Back-End
    'Node.js', 'Django', 'Spring Boot', 'ASP NET', 'Expressjs', 'Ruby on Rails', 'Laravel',

    # Mobile
    'React Native', 'Flutter', 'Swift', 'Android']


async def get_careerjet_links() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, link], [...], [...], ...]

    Each inner list represents a job listing published on the Gupy website.
    '''

    links = []

    urls = {
        'Brasil': 'https://www.careerjet.com.br/vagas?s={stack}&l=Brasil&p={page}',
    }

    base_urls = {
        'Brasil': 'https://www.careerjet.com.br',
    }

    for country, url_template in urls.items():
        for stack in stacks:
            for page in range(1, 2):
                print(f"Obtendo empregos no {country} de {stack}, página {page}...")
                async with httpx.AsyncClient() as client:
                    response = await client.get(url_template.format(stack=stack, page=page))
                    if response.status_code == 200:
                        soup = BeautifulSoup(response.text, 'html.parser')
                        cells = soup.find_all('article', class_='job clicky')
                        for cell in cells:
                            link = cell.find('a').get('href')
                            base_url = base_urls[country]
                            link = base_url + link

                            links.append(link)

    return links


async def get_careerjet_jobs() -> list:

    jobs = []

    job_links = await get_careerjet_links()

    for link in job_links:
        async with httpx.AsyncClient() as client:
            response = await client.get(link)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                job_title = soup.find('h1').get_text(strip=True)

                company = soup.find('p', class_='company').get_text(strip=True)

                details = soup.select_one('ul[class="details"] li').parent.select('li')
                if details:
                    location = details[0].get_text(strip=True)
                    hiring_regime = details[1].get_text(strip=True)

                work_type = ""

                salary = ""

                publication_date = soup.find('span',class_='badge badge-r badge-s')
                if publication_date:
                    publication_date = publication_date.get_text(strip=True)

        job = [link, job_title, company, location, work_type,
               hiring_regime, salary, publication_date]
        jobs.append(job)

    return jobs


async def main():
    jobs = await get_careerjet_jobs()

    if jobs:
        print(f"\n{'-' * 50}\nExtracted {len(jobs)} job postings from Infojobs:")
        for job in jobs:
            print("\n".join(f"{field}: {value}" for field, value in zip(
                ["Link", "Título da Vaga", "Empresa", "Localidade","Modalidade de Trabalho", "Regime", "Salário", "Data de Publicação"],
                job
            )))
            print('-' * 50)
    else:
        print("No job postings found.")
if __name__ == "__main__":
    asyncio.run(main())

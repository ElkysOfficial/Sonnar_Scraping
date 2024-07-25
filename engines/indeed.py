import cloudscraper
import asyncio
from bs4 import BeautifulSoup


async def get_indeed_links() -> list:
    """
    Função assíncrona que retorna uma lista de links de vagas do Indeed, com base na stack e número de páginas desejadas.
    """
    stacks = ['python']
    all_job_links = []
    for stack in stacks:
        for page in range(3):
            scraper = cloudscraper.create_scraper()
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, scraper.get, f'https://br.indeed.com/empregos?q={stack}&limit=50&start={page*50}&sort=date')

            if response.status_code != 200:
                continue  # Pula para a próxima página em caso de erro
            soup = BeautifulSoup(response.text, 'html.parser')
            cells = soup.find_all('div', class_='job_seen_beacon')
            for cell in cells:
                link = f'https://br.indeed.com/viewjob?jk={cell.find("a").get("data-jk")}'

                all_job_links.append(link)
    return all_job_links


async def get_indeed_jobs(link: str) -> dict:
    """
    Função assíncrona que retorna um dicionário com detalhes da vaga a partir de um link do Indeed.
    """

    jobs = []

    scraper = cloudscraper.create_scraper()
    response = await asyncio.get_event_loop().run_in_executor(None, scraper.get, link)

    if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')

        # Extrai título do trabalho:
        job_title = soup.find('h1', class_='jobsearch-JobInfoHeader-title').get_text(strip=True)
        company = soup.find('span', class_='e1wnkr790').get_text(strip=True)
        location = soup.find('div', class_='css-45str8 eu4oa1w0').get_text(strip=True)
        work_type = soup.find('div', class_='css-1h1j0y3').get_text(strip=True)

        job = [link, job_title, company, location]
        jobs.append(job)

        return jobs
    

async def main():

        job_links = await get_indeed_links()
        for job_link in job_links:
            job_details = await get_indeed_jobs(job_link)
            if job_details:
                print(job_details)

if __name__ == "__main__":
    asyncio.run(main())

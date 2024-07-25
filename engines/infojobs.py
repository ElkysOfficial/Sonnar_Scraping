import httpx
import asyncio
import re
from bs4 import BeautifulSoup

async def get_infojobs_links() -> list:
    """

    """

    jobs = []
    stacks = ['python', 'javascript', 'java', 'php', 'desenvolvedor c', 'ruby', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'analista ti',
              'cibersegurança', 'devops', 'UX & Desing', 'Data Science', 'Mobile', 'QA', 'SAP', 'Mainframe', 'Analista de Dados', 'Analista de Sistemas', 'Analista de Suporte', 'Analista de Testes', 'Pentest', 'Analista de Infraestrutura', 'Analista de Redes', 'Seguranca da Informacao']

    for stack in stacks:
        for page in range(1, 2):
            async with httpx.AsyncClient() as client:
                response = await client.get(f'https://www.infojobs.com.br/empregos.aspx?palabra={stack}&page={page}&limit=20')

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')

                    cells = soup.find_all('div', class_='js_vacancyLoad')
                    for cell in cells:
                        link = f'https://www.infojobs.com.br{cell["data-href"]}'

                        jobs.append([link])

    return jobs

async def get_infojobs_jobs(link: str) -> dict:
    """
    
    """

    jobs = []  

    async with httpx.AsyncClient() as client:
        response = await client.get(link)  

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')

            jobTitle = soup.find('h2', class_='js_vacancyHeaderTitle').get_text(strip=True)
            company = soup.find('div', class_='h4').get_text(strip=True)
            locationDivs = soup.find_all('div', class_='text-medium mb-4')
            if locationDivs:
                location = locationDivs[0].get_text(strip=True).replace(',km de você.', '')
                salary = ' '.join(filter(lambda a: a != '', locationDivs[1].get_text(strip=True).split(' '))).replace('(Bruto mensal)', '')

            work_type = soup.find('div', class_='text-medium small font-weight-bold mb-4').get_text(strip=True)
            hiringregimeDivs = soup.find_all('p')
            if hiringregimeDivs:
                hiring_regime = hiringregimeDivs[2].get_text(strip=True).replace('Tipo de contrato e Jornada:', '').replace('- Período Integral', '')
                journey_type = re.sub(r'Tipo de contrato e Jornada:\s*(Efetivo ?– ?CLT)?\s*-?\s*|\s*Outros\s*-?\s*|\s*Prestador de Serviços \(PJ\)\s*-?\s*','', hiringregimeDivs[2].get_text(strip=True))

            qualifications = "" 
            publication_date = soup.find('div', class_='caption text-medium text-nowrap text-right mb-8').get_text(strip=True)

            job = [link, jobTitle, company, location, work_type, hiring_regime,journey_type, salary, qualifications, publication_date]
            jobs.append(job)

    return jobs 


async def main():
    job_links = await get_infojobs_links()
    for job_link in job_links:
        job_details = await get_infojobs_jobs(job_link[0])
        if job_details:
            print(job_details)

if __name__ == "__main__":
    asyncio.run(main())

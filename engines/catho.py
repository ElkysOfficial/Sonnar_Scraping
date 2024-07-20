from bs4 import BeautifulSoup
import cloudscraper
import asyncio
import re
import pandas as pd


async def get_catho_jobs() -> list:
    jobs = []
    stacks = ['python', 'javascript', 'java', 'php', 'desenvolvedor c', 'ruby', 'sql', 'mysql', 
              'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 
              'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'analista ti',
              'cibersegurança', 'devops', 'UX & Desing', 'Data Science', 'Mobile', 'QA', 'SAP', 
              'Mainframe', 'Analista de Dados', 'Analista de Sistemas', 'Analista de Suporte', 
              'Analista de Testes', 'Pentest', 'Analista de Infraestrutura', 'Analista de Redes', 
              'Seguranca da Informacao']

    experience_levels = ['tech lead', 'senior', 'pleno', 'pl','junior', 'gerente de projeto', 'analista', 'sr', 'lead']

    for stack in stacks:
        for page in range(1, 2):
            scraper = cloudscraper.create_scraper()
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, scraper.get, f'https://www.catho.com.br/vagas/{stack}/?page={page}')

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                cells = soup.find_all('li', class_='search-result-custom_jobItem__OGz3a')
                for cell in cells:
                    link = cell.find('a').attrs['href']
                    jobTitle = cell.find('h2', class_='bACWKm')
                    if jobTitle is None:
                        continue
                    jobTitle = jobTitle.get_text(strip=True)
                    company = cell.find('p', class_='sc-sLsrZ iJixUK')
                    if company is None:
                        continue
                    company = company.get_text(strip=True)
                    if company == 'Empresa ConfidencialPor que?':
                       company = 'Empresa Confidencial'
                    location = cell.find('button', class_='sc-lbJcrp eNIgjj').get_text(strip=True)
                    location = re.sub(r'\s*\([^)]*\)', '', location)
                    hiringRegime = ""
                    workType = ""
                    salary = cell.find('div', class_="custom-styled_salaryText__oSvPo").get_text(strip=True)
                    desiredQualifications = ""
                    dateOfPublication = cell.find('time', class_="custom-styled_cardJobTime__ZvAIb").get_text(strip=True)
                    typeOfJourney = ""

                    # Verificar nível de experiência
                    levelOfExperience = ""
                    for level in experience_levels:
                        if level in jobTitle.lower():
                            levelOfExperience = level
                            break

                    job = [link, jobTitle, company, location, workType, hiringRegime, typeOfJourney, salary, desiredQualifications, dateOfPublication, levelOfExperience]
                    jobs.append(job)
    return jobs
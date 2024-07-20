import httpx
import asyncio
import pandas as pd
from bs4 import BeautifulSoup


async def get_hipsters_jobs():

    jobs = []

    stacks = ['python', 'javascript', 'java', 'php', 'desenvolvedor c', 'ruby', 'sql', 'mysql', 
              'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 
              'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'analista ti',
              'cibersegurança', 'devops', 'UX & Desing', 'Data Science', 'Mobile', 'QA', 'SAP', 
              'Mainframe', 'Analista de Dados', 'Analista de Sistemas', 'Analista de Suporte', 
              'Analista de Testes', 'Pentest', 'Analista de Infraestrutura', 'Analista de Redes', 
              'Seguranca da Informacao']

    experience_levels = ['tech lead', 'senior', 'pleno', 'pl', 'junior',
                         'gerente de projeto', 'analista', 'sr', 'lead', 
                         'sênior']

    desired_Qualifications = ['python', 'javascript', 'java', 'php', 'desenvolvedor c', 'ruby', 'sql', 'mysql', 'postgresql', 
                              'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 
                              'cloud', 'front-end', 'back-end', 'full-stack', 'analista ti','cibersegurança', 'devops', 
                              'UX & Design', 'Data Science', 'Mobile', 'QA', 'SAP', 'Mainframe', 'Analista de Dados', 
                              'Analista de Sistemas', 'Analista de Suporte', 'Analista de Testes', 'Pentest', 'Analista de Infraestrutura', 
                              'Analista de Redes', 'Segurança da Informação']

    for stack in stacks:
        async with httpx.AsyncClient() as client:
            response = await client.post(f'https://hipsters.jobs/jobs/?q={stack}')

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, "html.parser")
                cells = soup.find_all("article", class_="media well listing-item listing-item__jobs")
                for cell in cells:
                    link = cell.find("a", class_="link").get("href")
                    jobTitle = cell.find("div", class_="media-heading listing-item__title").get_text(strip=True)
                    company = cell.find("span", class_="listing-item__info--item listing-item__info--item-company").get_text(strip=True)
                    location = cell.find("span", class_="listing-item__info--item listing-item__info--item-location").get_text(strip=True)
                    workType = ""
                    hiringRegime = cell.find("span", class_="listing-item__employment-type").get_text(strip=True)
                    typeOfJourney = ""
                    salary = ""
                    description = cell.find("div", class_="listing-item__desc").get_text(strip=True)
                    dateOfPublication = cell.find("div", class_="listing-item__date").get_text(strip=True)

                    # Verificar nível de experiência no jobTitle e description
                    levelOfExperience = ""
                    for level in experience_levels:
                        if level in jobTitle.lower():
                            levelOfExperience = level
                            break
                    if not levelOfExperience:
                        for level in experience_levels:
                            if level in description.lower():
                                levelOfExperience = level
                                break

                    # Verificar qualificações desejadas na description
                    desiredQualifications = []
                    for desired in desired_Qualifications:
                        if desired.lower() in description.lower():
                            desiredQualifications.append(desired)

                    desiredQualifications = ", ".join(desiredQualifications)

                    job = [link, jobTitle, company, location, workType, hiringRegime, typeOfJourney,salary, desiredQualifications, dateOfPublication, levelOfExperience]
                    jobs.append(job)

    return jobs


async def main():
    jobs = await get_hipsters_jobs()
    for job in jobs:
        print(job)

    # Salvar os dados em um arquivo Excel
    df = pd.DataFrame(jobs, columns=['LINK', 'TITULO DA VAGA', 'EMPRESA', 'LOCALIDADE', 'MODALIDADE DE TRABALHO',
                                     'REGIME', 'TIPO DE JORNADA', 'SALÁRIO', 'QUALIFICAÇÕES', 'DATA DE PUBLICAÇÃO', 'NÍVEL DE EXPERIÊNCIA'])
    df.to_excel('hipsters_jobs.xlsx', index=False)

if __name__ == "__main__":
    asyncio.run(main())

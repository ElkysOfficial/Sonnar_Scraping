import asyncio
import cloudscraper
from bs4 import BeautifulSoup

async def get_bne_links() -> list:
    links = []
    url = "https://www.bne.com.br"
    stacks = ['Informática']

    for stack in stacks:
        for page in range(1, 2):
            scraper = cloudscraper.create_scraper()
            response = await asyncio.to_thread(scraper.get, f'https://www.bne.com.br/vagas-de-emprego/desenvolvedor%20{stack}?Page={page}')
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                cells = soup.find_all('section', class_='job job__vip__candidacy')
                for cell in cells:
                    link = cell.find('a', class_='is-link')
                    link = link.get('href')
                    link = url + link

                    links.append(link)

    return links

async def get_bne_jobs() -> list:

    jobs = []

    job_links = await get_bne_links()

    for link in job_links:
        scraper = cloudscraper.create_scraper()
        response = await asyncio.get_event_loop().run_in_executor(None, scraper.get, link)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')

            job_title = soup.find('div', class_='title').get_text(strip=True).replace('Vaga:', '')

            teste = soup.select('li')
            if len(teste) > 6:
                company = teste[6].get_text(strip=True).replace('O que é isso?', '')
                salary = teste[5].get_text(strip=True).replace('Salário:', '')
                location = teste[4].get_text(strip=True).replace('Localização:', '')
                
            work_type = ""
            for h2_tag in soup.find_all('h2', class_='tag'):
                strong_tag = h2_tag.find('strong')
                if strong_tag:
                    work_type = strong_tag.get_text(strip=True)
                    break
        
            hiring_regime = soup.find_all('div', class_='description__container')

            hiring_regime = hiring_regime[2]

            hiring_regime = hiring_regime.find('strong').get_text(strip=True).replace('- Home Office.', '').replace('.', '')

            publication_date = soup.select_one('small.expirydate p')
            publication_date = publication_date.get_text(strip=True) if publication_date else ""

            job = [link, job_title, company, location, work_type,hiring_regime, salary, publication_date]
            jobs.append(job)

    return jobs


async def main():
    jobs = await get_bne_jobs()

    if jobs:
        print(f"\n{'-' * 50}\nExtracted {len(jobs) } job postings from Infojobs:")
        for job in jobs:
            print("\n".join(f"{field}: {value}" for field, value in zip(
                ["Link", "Título da Vaga", "Empresa", "Localidade",
                    "Modalidade de Trabalho", "Regime", "Salário", "Data de Publicação"],
                job
            )))
            print('-' * 50)
    else:
        print("No job postings found.")
if __name__ == "__main__":
    asyncio.run(main())

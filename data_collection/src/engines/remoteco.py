import httpx
import asyncio
from bs4 import BeautifulSoup
from variavel import stacks


async def get_remoteco_jobs() -> list:
    """
    Extrai vagas do Remote.co.
    Site focado em vagas remotas.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    # Busca por stacks
    for stack in stacks:
        try:
            async with httpx.AsyncClient(timeout=30, headers=headers, follow_redirects=True) as client:
                url = f'https://remote.co/remote-jobs/search?searchkeyword={stack}'
                response = await client.get(url)

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')

                    # Remote.co usa divs com class "card"
                    job_cards = soup.find_all('div', class_='card')
                    if not job_cards:
                        job_cards = soup.find_all('article')

                    for card in job_cards:
                        try:
                            link_elem = card.find('a', href=True)
                            if not link_elem:
                                continue

                            link = link_elem.get('href', '')
                            if not link:
                                continue
                            if not link.startswith('http'):
                                link = f'https://remote.co{link}'

                            # Filtrar apenas links de jobs
                            if '/job/' not in link and '/remote-jobs/' not in link:
                                continue

                            if link in seen_links:
                                continue
                            seen_links.add(link)

                            # Título
                            title_elem = card.find('h2') or card.find('h3') or card.find('a', class_=lambda x: x and 'title' in str(x).lower())
                            job_title = ''
                            if title_elem:
                                job_title = title_elem.get_text(strip=True)
                            else:
                                job_title = link_elem.get_text(strip=True)

                            if not job_title:
                                continue

                            # Empresa
                            company_elem = card.find('span', class_=lambda x: x and 'company' in str(x).lower())
                            if not company_elem:
                                company_elem = card.find('p', class_=lambda x: x and 'company' in str(x).lower())
                            company = company_elem.get_text(strip=True) if company_elem else ''

                            # Localização - sempre vazio pois é 100% remoto
                            location = []
                            work_type = 'Remoto'

                            # Regime (heurística do título)
                            title_lower = job_title.lower()
                            if 'contract' in title_lower or 'contractor' in title_lower:
                                hiring_regime = 'Contractor'
                            elif 'part-time' in title_lower or 'part time' in title_lower:
                                hiring_regime = 'Part-time'
                            elif 'intern' in title_lower:
                                hiring_regime = 'Internship'
                            else:
                                hiring_regime = 'Full-time'

                            # Salário
                            salary_elem = card.find('span', class_=lambda x: x and 'salary' in str(x).lower())
                            salary = salary_elem.get_text(strip=True) if salary_elem else ''

                            # Data
                            date_elem = card.find('time') or card.find('span', class_=lambda x: x and 'date' in str(x).lower())
                            publication_date = ''
                            if date_elem:
                                datetime_attr = date_elem.get('datetime', '')
                                if datetime_attr:
                                    date_raw = datetime_attr[:10]
                                    if date_raw and len(date_raw) == 10 and '-' in date_raw:
                                        parts = date_raw.split('-')
                                        publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"

                            job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                            jobs.append(job)

                        except Exception:
                            continue

        except Exception:
            continue

        await asyncio.sleep(0.5)

    print(f'Foram obtidas {len(jobs)} vagas do site Remote.co')
    return jobs


if __name__ == "__main__":
    jobs = asyncio.run(get_remoteco_jobs())
    for job in jobs[:5]:
        print(job)

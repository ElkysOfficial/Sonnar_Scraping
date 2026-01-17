import httpx
import asyncio
import json
from bs4 import BeautifulSoup
from variavel import stacks


async def get_michaelpage_jobs() -> list:
    """
    Extrai vagas do Michael Page Brasil.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    }

    # Busca por stacks
    for stack in stacks:
        try:
            async with httpx.AsyncClient(timeout=30, headers=headers, follow_redirects=True) as client:
                # Michael Page Brasil
                url = f'https://www.michaelpage.com.br/jobs/{stack}'
                response = await client.get(url)

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')

                    # Tenta encontrar JSON-LD primeiro
                    scripts = soup.find_all('script', type='application/ld+json')
                    for script in scripts:
                        try:
                            data = json.loads(script.string)
                            items = data if isinstance(data, list) else [data]

                            for item in items:
                                if item.get('@type') == 'JobPosting':
                                    link = item.get('url', '')
                                    if link in seen_links:
                                        continue
                                    seen_links.add(link)

                                    job_title = item.get('title', '')

                                    hiring_org = item.get('hiringOrganization', {})
                                    company = hiring_org.get('name', '') if isinstance(hiring_org, dict) else ''

                                    job_location = item.get('jobLocation', {})
                                    address = job_location.get('address', {}) if isinstance(job_location, dict) else {}
                                    locality = address.get('addressLocality', '')
                                    region = address.get('addressRegion', '')

                                    location = []
                                    if locality:
                                        location.append(locality)
                                    if region:
                                        location.append(region)

                                    # Work type
                                    job_location_type = item.get('jobLocationType', '')
                                    title_lower = job_title.lower()

                                    if job_location_type == 'TELECOMMUTE' or 'remoto' in title_lower or 'remote' in title_lower:
                                        work_type = 'Remoto'
                                        location = []
                                    elif 'híbrido' in title_lower or 'hibrido' in title_lower or 'hybrid' in title_lower:
                                        work_type = 'Híbrido'
                                    else:
                                        work_type = 'Presencial'

                                    # Regime
                                    employment_type = item.get('employmentType', '')
                                    hiring_regime_map = {
                                        'FULL_TIME': 'CLT',
                                        'PART_TIME': 'Meio Período',
                                        'CONTRACTOR': 'PJ',
                                        'INTERN': 'Estágio',
                                        'TEMPORARY': 'Temporário'
                                    }
                                    if isinstance(employment_type, list):
                                        employment_type = employment_type[0] if employment_type else ''
                                    hiring_regime = hiring_regime_map.get(employment_type, '')

                                    # Salário
                                    salary = ''
                                    base_salary = item.get('baseSalary', {})
                                    if isinstance(base_salary, dict):
                                        currency = base_salary.get('currency', 'BRL')
                                        value = base_salary.get('value', {})
                                        if isinstance(value, dict):
                                            min_val = value.get('minValue', '')
                                            max_val = value.get('maxValue', '')
                                            if min_val and max_val:
                                                salary = f'{currency} {min_val} - {max_val}'
                                            elif min_val:
                                                salary = f'{currency} {min_val}'

                                    # Data
                                    date_posted = item.get('datePosted', '')
                                    date_raw = date_posted[:10] if date_posted else ''
                                    if date_raw and len(date_raw) == 10 and '-' in date_raw:
                                        parts = date_raw.split('-')
                                        publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                                    else:
                                        publication_date = date_raw

                                    job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                                    jobs.append(job)

                        except json.JSONDecodeError:
                            continue

                    # Fallback: parse HTML
                    job_cards = soup.find_all('article', class_=lambda x: x and 'job' in str(x).lower())
                    if not job_cards:
                        job_cards = soup.find_all('div', class_=lambda x: x and 'job-result' in str(x).lower())
                    if not job_cards:
                        job_cards = soup.find_all('li', class_=lambda x: x and 'job' in str(x).lower())

                    for card in job_cards:
                        try:
                            link_elem = card.find('a', href=True)
                            if not link_elem:
                                continue

                            link = link_elem.get('href', '')
                            if not link:
                                continue
                            if not link.startswith('http'):
                                link = f'https://www.michaelpage.com.br{link}'

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
                            company = company_elem.get_text(strip=True) if company_elem else ''

                            # Localização
                            location_elem = card.find('span', class_=lambda x: x and 'location' in str(x).lower())
                            location_raw = location_elem.get_text(strip=True) if location_elem else ''

                            title_lower = job_title.lower()
                            if 'remoto' in location_raw.lower() or 'remoto' in title_lower:
                                work_type = 'Remoto'
                                location = []
                            elif 'híbrido' in location_raw.lower() or 'híbrido' in title_lower:
                                work_type = 'Híbrido'
                                parts = [p.strip() for p in location_raw.split(',') if p.strip()]
                                location = parts[:2] if parts else []
                            else:
                                work_type = 'Presencial'
                                parts = [p.strip() for p in location_raw.split(',') if p.strip()]
                                location = parts[:2] if parts else []

                            hiring_regime = ''
                            salary = ''
                            publication_date = ''

                            job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                            jobs.append(job)

                        except Exception:
                            continue

        except Exception:
            continue

        await asyncio.sleep(0.5)

    print(f'Foram obtidas {len(jobs)} vagas do site MichaelPage')
    return jobs


if __name__ == "__main__":
    jobs = asyncio.run(get_michaelpage_jobs())
    for job in jobs[:5]:
        print(job)

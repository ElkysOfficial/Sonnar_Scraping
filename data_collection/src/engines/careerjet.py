from bs4 import BeautifulSoup
import json
import os
import httpx
from variavel import stacks

HTTPX_TIMEOUT = float(os.getenv("HTTPX_TIMEOUT", "30"))


def _extract_icon_text(soup: BeautifulSoup, icon_name: str) -> str:
    for li in soup.find_all("li"):
        svg = li.find("use")
        if not svg:
            continue
        href = svg.get("xlink:href") or svg.get("href") or ""
        if icon_name in href:
            return li.get_text(separator=" ", strip=True)
    return ""


def _extract_header_texts(soup: BeautifulSoup) -> list:
    texts = []
    for li in soup.find_all("li"):
        svg = li.find("use")
        if not svg:
            continue
        text = li.get_text(separator=" ", strip=True)
        if text:
            texts.append(text)
    return texts


def extract_dom_details(soup: BeautifulSoup) -> dict:
    header_texts = _extract_header_texts(soup)
    location = _extract_icon_text(soup, "icon-location")
    salary = _extract_icon_text(soup, "icon-money")
    contract = _extract_icon_text(soup, "icon-contract")
    duration = _extract_icon_text(soup, "icon-duration")

    work_type = ""
    for text in header_texts:
        lowered = text.lower()
        if "remoto" in lowered or "home office" in lowered:
            work_type = "Remoto"
            break
        if "hÃ­brido" in lowered or "hibrido" in lowered:
            work_type = "HÃ­brido"
            break
        if "presencial" in lowered:
            work_type = "Presencial"
            break

    hiring_regime = contract

    return {
        "location": location,
        "salary": salary,
        "work_type": work_type,
        "hiring_regime": hiring_regime,
        "work_schedule": duration,
    }


async def get_careerjet_links() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, link], [...], [...], ...]

    Each inner list represents a job listing published on the Gupy website.
    '''

    links = []
    max_pages = int(os.getenv("CAREERJET_MAX_PAGES", "20"))
    max_empty_pages = int(os.getenv("CAREERJET_MAX_EMPTY_PAGES", "1"))

    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT, follow_redirects=True) as client:
        for stack in stacks:
            empty_pages = 0
            for page in range(1, max_pages + 1):
                try:
                    response = await client.get(
                        f'https://www.careerjet.com.br/vagas?s={stack}&l=Brasil&p={page}'
                    )
                except httpx.HTTPError:
                    empty_pages += 1
                    if empty_pages >= max_empty_pages:
                        break
                    continue
                if response.status_code != 200:
                    empty_pages += 1
                    if empty_pages >= max_empty_pages:
                        break
                    continue
                soup = BeautifulSoup(response.text, 'html.parser')
                cells = soup.find_all('article', class_='job clicky')
                if not cells:
                    empty_pages += 1
                    if empty_pages >= max_empty_pages:
                        break
                    continue
                empty_pages = 0
                for cell in cells:
                    anchor = cell.find('a')
                    if not anchor:
                        continue
                    link = anchor.get('href')
                    if not link:
                        continue
                    link = 'https://www.careerjet.com.br' + link
                    links.append(link)

    return links


async def get_careerjet_jobs() -> list:

    jobs = []

    job_links = await get_careerjet_links()

    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT, follow_redirects=True) as client:
        for link in job_links:
            try:
                response = await client.get(link)
            except httpx.HTTPError:
                continue
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                data = soup.find('script', type='application/ld+json')

                if not data:
                    continue

                try:
                    data = json.loads(data.text)
                except json.JSONDecodeError:
                    continue

                job_title = data.get('title', '')

                # Empresa
                hiring_org = data.get('hiringOrganization', {})
                company = hiring_org.get('name', '') if hiring_org else ''
                if not company:
                    company = ''

                dom_details = extract_dom_details(soup)

                # LocalizaÃ§Ã£o
                job_location = data.get('jobLocation', {})
                address = job_location.get('address', {}) if job_location else {}
                locality = address.get('addressLocality', '')
                region = address.get('addressRegion', '')

                if locality or region:
                    location = []
                    if locality:
                        location.append(locality)
                    if region:
                        location.append(str(region))
                else:
                    location = ''

                # Modalidade de trabalho (Remoto/HÃ­brido/Presencial)
                job_location_type = data.get('jobLocationType', '')
                title_lower = job_title.lower()

                if job_location_type == 'TELECOMMUTE' or 'remoto' in title_lower or 'remote' in title_lower:
                    work_type = 'Remoto'
                elif 'hÃ­brido' in title_lower or 'hybrid' in title_lower:
                    work_type = 'HÃ­brido'
                else:
                    work_type = ''

                if dom_details.get("work_type"):
                    work_type = dom_details["work_type"]

                # Regime de contrataÃ§Ã£o
                employment_type = data.get('employmentType', '')
                hiring_regime_map = {
                    'FULL_TIME': 'CLT',
                    'PART_TIME': 'Meio PerÃ­odo',
                    'CONTRACTOR': 'PJ',
                    'INTERN': 'EstÃ¡gio',
                    'TEMPORARY': 'TemporÃ¡rio',
                    'VOLUNTEER': 'VoluntÃ¡rio'
                }

                if isinstance(employment_type, list):
                    # Pega o primeiro tipo vÃ¡lido
                    hiring_regime = ''
                    for emp_type in employment_type:
                        if emp_type in hiring_regime_map:
                            hiring_regime = hiring_regime_map[emp_type]
                            break
                elif employment_type:
                    hiring_regime = hiring_regime_map.get(employment_type, '')
                else:
                    hiring_regime = ''

                if dom_details.get("hiring_regime"):
                    hiring_regime = dom_details["hiring_regime"]

                # SalÃ¡rio
                base_salary = data.get('baseSalary', {})
                if base_salary:
                    currency = base_salary.get('currency', 'BRL')
                    value = base_salary.get('value', {})

                    if isinstance(value, dict):
                        min_value = value.get('minValue', '')
                        max_value = value.get('maxValue', '')

                        if min_value and max_value:
                            if min_value == max_value:
                                salary = f'{currency} {min_value}'
                            else:
                                salary = f'{currency} {min_value} - {max_value}'
                        elif min_value:
                            salary = f'{currency} {min_value}'
                        else:
                            salary = ''
                    else:
                        salary = f'{currency} {value}' if value else ''
                else:
                    salary = ''
                if dom_details.get("salary"):
                    salary = dom_details["salary"]
                if dom_details.get("location"):
                    location = dom_details["location"]

                # Data de publicaÃ§Ã£o no formato brasileiro DD/MM/YYYY
                date_posted = data.get('datePosted', '')
                date_raw = date_posted[:10] if date_posted else ''
                if date_raw and len(date_raw) == 10 and '-' in date_raw:
                    parts = date_raw.split('-')
                    publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                else:
                    publication_date = date_raw

                job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                jobs.append(job)

    print(f'Foram obtidas {len(jobs)} vagas do site careerjet')
    return jobs

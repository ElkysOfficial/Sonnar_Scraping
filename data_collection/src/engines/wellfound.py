import asyncio
import json
import re
from datetime import datetime, timedelta
from curl_cffi import requests
from bs4 import BeautifulSoup


# Sessão global
_session = None


def get_session():
    """Retorna a sessão global, criando se necessário."""
    global _session
    if _session is None:
        # IMPORTANTE: Não adicionar headers personalizados!
        # impersonate='chrome120' já configura todos os headers corretos.
        # Headers extras conflitam e causam 403.
        _session = requests.Session(impersonate='chrome120')
    return _session


def parse_relative_date(date_text: str) -> str:
    """Converte datas relativas para formato DD/MM/YYYY."""
    if not date_text:
        return ''

    date_text = date_text.lower().strip()
    today = datetime.now()

    if 'today' in date_text or 'just' in date_text or 'now' in date_text:
        return today.strftime('%d/%m/%Y')
    if 'yesterday' in date_text:
        return (today - timedelta(days=1)).strftime('%d/%m/%Y')

    # "Xd" ou "X days"
    days_match = re.search(r'(\d+)\s*d(ays?)?', date_text)
    if days_match:
        days = int(days_match.group(1))
        return (today - timedelta(days=days)).strftime('%d/%m/%Y')

    # "Xw" ou "X weeks"
    weeks_match = re.search(r'(\d+)\s*w(eeks?)?', date_text)
    if weeks_match:
        weeks = int(weeks_match.group(1))
        return (today - timedelta(weeks=weeks)).strftime('%d/%m/%Y')

    # "Xm" ou "X months"
    months_match = re.search(r'(\d+)\s*m(onths?)?', date_text)
    if months_match:
        months = int(months_match.group(1))
        return (today - timedelta(days=months * 30)).strftime('%d/%m/%Y')

    return ''


async def get_wellfound_jobs() -> list:
    """
    Extrai vagas do Wellfound (antigo AngelList).
    Foca em vagas remotas de startups.
    NOTA: Wellfound usa Cloudflare, resultados podem ser limitados.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()
    session = get_session()

    # Wellfound tem páginas de empresas e vagas
    urls = [
        'https://wellfound.com/jobs',
        'https://wellfound.com/role/software-engineer',
        'https://wellfound.com/role/frontend-developer',
        'https://wellfound.com/role/backend-developer',
        'https://wellfound.com/role/full-stack-developer',
        'https://wellfound.com/role/mobile-developer',
        'https://wellfound.com/role/devops-engineer',
        'https://wellfound.com/role/data-scientist',
    ]

    for url in urls:
        try:
            response = await asyncio.to_thread(session.get, url, timeout=30)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                # Tenta encontrar JSON-LD
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

                                if job_location_type == 'TELECOMMUTE' or 'remote' in title_lower:
                                    work_type = 'Remoto'
                                    location = []
                                elif 'hybrid' in title_lower:
                                    work_type = 'Híbrido'
                                else:
                                    work_type = 'Presencial'

                                # Regime
                                employment_type = item.get('employmentType', '')
                                hiring_regime_map = {
                                    'FULL_TIME': 'Full-time',
                                    'PART_TIME': 'Part-time',
                                    'CONTRACTOR': 'Contractor',
                                    'INTERN': 'Internship',
                                }
                                if isinstance(employment_type, list):
                                    employment_type = employment_type[0] if employment_type else ''
                                hiring_regime = hiring_regime_map.get(employment_type, '')

                                # Salário
                                salary = ''
                                base_salary = item.get('baseSalary', {})
                                if isinstance(base_salary, dict):
                                    currency = base_salary.get('currency', 'USD')
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
                job_cards = soup.find_all('div', class_=lambda x: x and 'job' in str(x).lower() and 'card' in str(x).lower())
                if not job_cards:
                    job_cards = soup.find_all('a', class_=lambda x: x and 'job' in str(x).lower())

                for card in job_cards:
                    try:
                        if card.name == 'a':
                            link = card.get('href', '')
                        else:
                            link_elem = card.find('a', href=True)
                            link = link_elem.get('href', '') if link_elem else ''

                        if not link:
                            continue
                        if not link.startswith('http'):
                            link = f'https://wellfound.com{link}'

                        if link in seen_links:
                            continue
                        seen_links.add(link)

                        title_elem = card.find('h2') or card.find('h3') or card.find('span', class_=lambda x: x and 'title' in str(x).lower())
                        job_title = title_elem.get_text(strip=True) if title_elem else ''
                        if not job_title:
                            job_title = card.get_text(strip=True)[:100]

                        company_elem = card.find('span', class_=lambda x: x and 'company' in str(x).lower())
                        company = company_elem.get_text(strip=True) if company_elem else ''

                        # Wellfound é majoritariamente remoto
                        work_type = 'Remoto'
                        location = []

                        # Regime de contratação
                        hiring_regime = ''
                        regime_elem = card.find('span', class_=lambda x: x and ('type' in str(x).lower() or 'employment' in str(x).lower()))
                        if regime_elem:
                            regime_text = regime_elem.get_text(strip=True).lower()
                            if 'full' in regime_text:
                                hiring_regime = 'Full-time'
                            elif 'part' in regime_text:
                                hiring_regime = 'Part-time'
                            elif 'contract' in regime_text:
                                hiring_regime = 'Contractor'
                            elif 'intern' in regime_text:
                                hiring_regime = 'Internship'

                        # Salário
                        salary = ''
                        salary_elem = card.find('span', class_=lambda x: x and 'salary' in str(x).lower())
                        if salary_elem:
                            salary = salary_elem.get_text(strip=True)

                        # Data de publicação
                        publication_date = ''
                        date_elem = card.find('time') or card.find('span', class_=lambda x: x and ('date' in str(x).lower() or 'posted' in str(x).lower() or 'ago' in str(x).lower()))
                        if date_elem:
                            date_text = date_elem.get('datetime', '') or date_elem.get_text(strip=True)
                            if date_text:
                                if len(date_text) >= 10 and '-' in date_text:
                                    date_raw = date_text[:10]
                                    parts = date_raw.split('-')
                                    if len(parts) == 3:
                                        publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                                else:
                                    publication_date = parse_relative_date(date_text)

                        if job_title:
                            job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                            jobs.append(job)

                    except Exception:
                        continue

        except Exception:
            continue

        await asyncio.sleep(0.5)

    print(f'Foram obtidas {len(jobs)} vagas do site Wellfound')
    return jobs


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


if __name__ == "__main__":
    jobs = asyncio.run(get_wellfound_jobs())
    for job in jobs[:5]:
        print(job)

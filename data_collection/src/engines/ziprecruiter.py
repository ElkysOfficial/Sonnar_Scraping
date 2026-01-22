import asyncio
import re
from datetime import datetime, timedelta
from curl_cffi import requests
from bs4 import BeautifulSoup
from variavel import stacks


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

    # "Xd" ou "X days" ou "X day ago"
    days_match = re.search(r'(\d+)\s*d(ays?)?(\s*ago)?', date_text)
    if days_match:
        days = int(days_match.group(1))
        return (today - timedelta(days=days)).strftime('%d/%m/%Y')

    # "Xw" ou "X weeks"
    weeks_match = re.search(r'(\d+)\s*w(eeks?)?(\s*ago)?', date_text)
    if weeks_match:
        weeks = int(weeks_match.group(1))
        return (today - timedelta(weeks=weeks)).strftime('%d/%m/%Y')

    # "Xm" ou "X months"
    months_match = re.search(r'(\d+)\s*m(onths?)?(\s*ago)?', date_text)
    if months_match:
        months = int(months_match.group(1))
        return (today - timedelta(days=months * 30)).strftime('%d/%m/%Y')

    # "X hours ago"
    hours_match = re.search(r'(\d+)\s*h(ours?)?(\s*ago)?', date_text)
    if hours_match:
        return today.strftime('%d/%m/%Y')

    return ''


# Sessão global
_session = None


def get_session():
    """Retorna a sessão global, criando se necessário."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate='chrome')
    return _session


async def get_ziprecruiter_jobs() -> list:
    """
    Extrai vagas do ZipRecruiter UK (internacional).
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()
    session = get_session()

    for stack in stacks:
        # Percorrer 10 páginas por stack
        for page in range(1, 11):
            try:
                url = f'https://www.ziprecruiter.co.uk/jobs/search?q={stack}&l=&page={page}'
                response = await asyncio.to_thread(session.get, url, timeout=30)

                if response.status_code != 200:
                    break

                soup = BeautifulSoup(response.text, 'html.parser')

                # ZipRecruiter usa <a class="jobList-title job-link">
                job_titles = soup.find_all('a', class_='jobList-title')

                # Se não tem vagas, para de paginar
                if not job_titles:
                    break

                for title_elem in job_titles:
                    try:
                        link = title_elem.get('href', '')
                        if not link:
                            continue
                        if not link.startswith('http'):
                            link = f'https://www.ziprecruiter.co.uk{link}'

                        if link in seen_links:
                            continue
                        seen_links.add(link)

                        job_title = title_elem.get_text(strip=True)
                        if not job_title:
                            continue

                        # Navegar para o pai para pegar mais dados
                        parent = title_elem.find_parent('article') or title_elem.find_parent('div', class_=lambda x: x and 'job' in str(x).lower())

                        # Empresa
                        company = ''
                        if parent:
                            company_elem = parent.find('a', class_=lambda x: x and 'company' in str(x).lower())
                            if company_elem:
                                company = company_elem.get_text(strip=True)

                        # Localização
                        location_raw = ''
                        if parent:
                            location_elem = parent.find('span', class_=lambda x: x and 'location' in str(x).lower())
                            if location_elem:
                                location_raw = location_elem.get_text(strip=True)

                        # Work type
                        title_lower = job_title.lower()
                        location_lower = location_raw.lower()

                        if 'remote' in title_lower or 'remote' in location_lower:
                            work_type = 'Remoto'
                            location = []
                        elif 'hybrid' in title_lower or 'hybrid' in location_lower:
                            work_type = 'Híbrido'
                            location = [location_raw] if location_raw else []
                        else:
                            work_type = 'Presencial'
                            location = [location_raw] if location_raw else []

                        # Regime
                        hiring_regime = 'Full-time'
                        if 'part-time' in title_lower or 'part time' in title_lower:
                            hiring_regime = 'Part-time'
                        elif 'contract' in title_lower:
                            hiring_regime = 'Contractor'
                        elif 'intern' in title_lower:
                            hiring_regime = 'Internship'

                        # Salário
                        salary = ''
                        if parent:
                            salary_elem = parent.find('span', class_=lambda x: x and 'salary' in str(x).lower())
                            if salary_elem:
                                salary = salary_elem.get_text(strip=True)

                        # Data de publicação
                        publication_date = ''
                        if parent:
                            # Tentar encontrar elemento de data
                            date_elem = parent.find('time') or parent.find('span', class_=lambda x: x and ('date' in str(x).lower() or 'posted' in str(x).lower() or 'ago' in str(x).lower()))
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

                            # Fallback: buscar texto com "ago"
                            if not publication_date:
                                card_text = parent.get_text()
                                ago_match = re.search(r'(\d+\s*(?:d|day|hour|week|month)s?\s*ago)', card_text, re.I)
                                if ago_match:
                                    publication_date = parse_relative_date(ago_match.group(1))

                        job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                        jobs.append(job)

                    except Exception:
                        continue

                await asyncio.sleep(0.3)

            except Exception:
                break

    print(f'Foram obtidas {len(jobs)} vagas do site ZipRecruiter')
    return jobs


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


if __name__ == "__main__":
    jobs = asyncio.run(get_ziprecruiter_jobs())
    for job in jobs[:5]:
        print(job)

import asyncio
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
    """Converte datas relativas do Remote.co para formato DD/MM/YYYY."""
    if not date_text:
        return ''

    date_text = date_text.lower().strip()
    today = datetime.now()

    if 'today' in date_text or 'just now' in date_text:
        return today.strftime('%d/%m/%Y')
    if 'yesterday' in date_text:
        return (today - timedelta(days=1)).strftime('%d/%m/%Y')

    # "X days ago"
    days_match = re.search(r'(\d+)\s*days?\s*ago', date_text)
    if days_match:
        days = int(days_match.group(1))
        return (today - timedelta(days=days)).strftime('%d/%m/%Y')

    # "X weeks ago"
    weeks_match = re.search(r'(\d+)\s*weeks?\s*ago', date_text)
    if weeks_match:
        weeks = int(weeks_match.group(1))
        return (today - timedelta(weeks=weeks)).strftime('%d/%m/%Y')

    # "X months ago"
    months_match = re.search(r'(\d+)\s*months?\s*ago', date_text)
    if months_match:
        months = int(months_match.group(1))
        return (today - timedelta(days=months * 30)).strftime('%d/%m/%Y')

    return ''


async def get_remoteco_jobs() -> list:
    """
    Extrai vagas do Remote.co.
    NOTA: Remote.co usa JavaScript para renderizar vagas, resultados podem ser limitados.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()
    session = get_session()

    # Categorias de developer do Remote.co
    categories = [
        'developer',
        'it',
        'software',
        'devops',
        'qa',
    ]

    for category in categories:
        try:
            url = f'https://remote.co/remote-jobs/{category}/'
            response = await asyncio.to_thread(session.get, url, timeout=30)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                # Buscar links de vagas diretamente
                all_links = soup.find_all('a', href=True)

                for link_elem in all_links:
                    try:
                        href = link_elem.get('href', '')
                        text = link_elem.get_text(strip=True)

                        # Filtrar apenas links de vagas específicas
                        if not href or not text:
                            continue
                        if '/remote-jobs/' not in href:
                            continue
                        # Ignorar links de categorias (terminam em /)
                        if href.endswith('/') and href.count('/') <= 3:
                            continue
                        # Ignorar links que são apenas categorias
                        if any(cat + '/' == href.split('/')[-2] + '/' for cat in categories):
                            if href.endswith('/'):
                                continue

                        link = href if href.startswith('http') else f'https://remote.co{href}'

                        if link in seen_links:
                            continue
                        seen_links.add(link)

                        job_title = text
                        if not job_title or len(job_title) < 3 or len(job_title) > 200:
                            continue

                        # Tentar extrair empresa do título (formato: "Company: Job Title")
                        company = ''
                        if ':' in job_title:
                            parts = job_title.split(':', 1)
                            if len(parts[0]) < 50:  # Nome de empresa razoável
                                company = parts[0].strip()
                                job_title = parts[1].strip()

                        # Remote.co é 100% remoto
                        location = []
                        work_type = 'Remoto'

                        # Regime baseado no título
                        title_lower = job_title.lower()
                        if 'contract' in title_lower:
                            hiring_regime = 'Contractor'
                        elif 'part-time' in title_lower or 'part time' in title_lower:
                            hiring_regime = 'Part-time'
                        elif 'intern' in title_lower:
                            hiring_regime = 'Internship'
                        else:
                            hiring_regime = 'Full-time'

                        salary = ''
                        publication_date = ''

                        job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                        jobs.append(job)

                    except Exception:
                        continue

        except Exception:
            continue

        await asyncio.sleep(0.3)

    print(f'Foram obtidas {len(jobs)} vagas do site Remote.co')
    return jobs


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


if __name__ == "__main__":
    jobs = asyncio.run(get_remoteco_jobs())
    for job in jobs[:5]:
        print(job)

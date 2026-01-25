import asyncio
import re
from datetime import datetime, timedelta
from curl_cffi import requests
from bs4 import BeautifulSoup

# Importar stacks do arquivo variavel
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from variavel import stacks


# Sessao global
_session = None


def get_session():
    """Retorna a sessao global, criando se necessario."""
    global _session
    if _session is None:
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

    # "X days ago" ou "Xd"
    days_match = re.search(r'(\d+)\s*d(ays?)?\s*(ago)?', date_text)
    if days_match:
        days = int(days_match.group(1))
        return (today - timedelta(days=days)).strftime('%d/%m/%Y')

    # "X weeks ago"
    weeks_match = re.search(r'(\d+)\s*w(eeks?)?\s*(ago)?', date_text)
    if weeks_match:
        weeks = int(weeks_match.group(1))
        return (today - timedelta(weeks=weeks)).strftime('%d/%m/%Y')

    # "X months ago"
    months_match = re.search(r'(\d+)\s*m(onths?)?\s*(ago)?', date_text)
    if months_match:
        months = int(months_match.group(1))
        return (today - timedelta(days=months * 30)).strftime('%d/%m/%Y')

    return ''


def extract_hiring_regime(text: str) -> str:
    """Extrai regime de contratacao do texto."""
    text_lower = text.lower()

    if 'full-time' in text_lower or 'full time' in text_lower:
        return 'Full-time'
    if 'part-time' in text_lower or 'part time' in text_lower:
        return 'Part-time'
    if 'contract' in text_lower or 'contractor' in text_lower or 'c2c' in text_lower or 'w2' in text_lower:
        return 'Contractor'
    # Detectar duracao de contrato (ex: "12 months", "6 month contract")
    if re.search(r'\d+\s*months?', text_lower):
        return 'Contractor'
    if 'intern' in text_lower:
        return 'Internship'
    if 'freelance' in text_lower:
        return 'Freelancer'
    if 'temporary' in text_lower or 'temp' in text_lower:
        return 'Temporary'

    return ''


def extract_work_type(text: str, location: str) -> str:
    """Extrai tipo de trabalho (Remoto/Hibrido/Presencial)."""
    combined = (text + ' ' + location).lower()

    if 'remote' in combined:
        return 'Remoto'
    if 'hybrid' in combined:
        return 'Hibrido'

    return 'Presencial'


async def get_dice_jobs() -> list:
    """
    Extrai vagas do Dice.com (foco em vagas de tech nos EUA).

    URL Pattern: https://www.dice.com/jobs?q={stack}&radius=30&radiusUnit=mi&page={page}

    Dice e um job board especializado em tecnologia, predominantemente EUA.
    Utiliza data-testid para identificar elementos.

    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()
    session = get_session()

    for stack in stacks:
        # Converter stack para query parameter
        stack_query = stack.replace('_', ' ')

        # Percorrer todas as paginas ate nao encontrar mais vagas
        page = 1
        consecutive_empty = 0
        max_pages = int(os.getenv("DICE_MAX_PAGES", "50"))
        max_empty_pages = int(os.getenv("DICE_MAX_EMPTY_PAGES", "2"))

        while page <= max_pages:
            try:
                url = f'https://www.dice.com/jobs?q={stack_query}&radius=30&radiusUnit=mi&page={page}'
                response = await asyncio.to_thread(session.get, url, timeout=30)

                if response.status_code != 200:
                    break

                soup = BeautifulSoup(response.text, 'html.parser')

                # Encontrar job cards usando data-testid
                cards = soup.find_all(attrs={'data-testid': 'job-card'})

                if not cards:
                    consecutive_empty += 1
                    if consecutive_empty >= max_empty_pages:
                        break
                    page += 1
                    continue

                consecutive_empty = 0
                jobs_found_this_page = 0

                for card in cards:
                    try:
                        # Link da vaga
                        link_elem = card.find('a', {'data-testid': 'job-search-job-card-link'})
                        if not link_elem:
                            continue

                        link = link_elem.get('href', '')
                        if not link:
                            continue

                        if link in seen_links:
                            continue
                        seen_links.add(link)

                        # Titulo - extrair do aria-label do link
                        aria_label = link_elem.get('aria-label', '')
                        # "View Details for Python Developer (hash)"
                        title_match = re.search(r'View Details for (.+?)(?:\s*\([a-f0-9]+\))?$', aria_label)
                        job_title = title_match.group(1).strip() if title_match else ''

                        if not job_title:
                            # Fallback: pegar texto do link
                            job_title = link_elem.get_text(strip=True)

                        if not job_title:
                            continue

                        # Extrair todos os textos do card para parsing
                        card_texts = [t.strip() for t in card.get_text(separator='|', strip=True).split('|') if t.strip()]

                        # Empresa - geralmente e o primeiro texto (antes de "Easy Apply")
                        company = ''
                        skip_words = ['easy apply', 'today', 'ago', 'remote', 'hybrid', 'full-time', 'part-time',
                                      'depends', 'salary', '$', 'experience', 'contract', 'contractor', 'intern',
                                      'internship', 'freelance', 'temporary', 'temp', 'per hour', 'per year',
                                      'competitive', 'negotiable', 'posted']
                        for text in card_texts:
                            if text and text not in ['Easy Apply', job_title] and len(text) < 100:
                                text_lower = text.lower()
                                # Verificar se parece nome de empresa (nao e data, localizacao, regime, etc)
                                if not any(x in text_lower for x in skip_words):
                                    # Verificar se nao e localizacao (geralmente tem virgula com estado)
                                    if ',' not in text or text.count(',') == 0:
                                        # Limpar caracteres nao-ASCII
                                        company = text.encode('ascii', 'ignore').decode('ascii').strip()
                                        if company and len(company) > 1:
                                            break

                        # Localizacao - procurar padrao "City, State"
                        location_raw = ''
                        for text in card_texts:
                            if ',' in text and len(text) < 50:
                                # Verificar se parece localizacao
                                if any(state in text for state in ['Arizona', 'California', 'Texas', 'New York', 'Florida', 'Washington', 'Colorado', 'Georgia', 'Illinois', 'Massachusetts', 'Virginia', 'North Carolina', 'Pennsylvania', 'Ohio', 'Michigan', 'New Jersey', 'Maryland', 'Minnesota', 'Oregon', 'Wisconsin', 'Tennessee', 'Indiana', 'Missouri', 'Connecticut', 'Utah', 'Nevada', 'Iowa', 'Kansas', 'Nebraska', 'Oklahoma', 'Arkansas', 'Kentucky', 'Louisiana', 'Alabama', 'Mississippi', 'South Carolina', 'West Virginia', 'Hawaii', 'Idaho', 'Maine', 'Montana', 'New Hampshire', 'New Mexico', 'North Dakota', 'Rhode Island', 'South Dakota', 'Vermont', 'Wyoming', 'Alaska', 'Delaware', 'DC', 'D.C.']):
                                    location_raw = text
                                    break

                        # Work type
                        card_text_full = ' '.join(card_texts)
                        work_type = extract_work_type(card_text_full, location_raw)

                        # Ajustar location baseado no work_type
                        if work_type == 'Remoto':
                            location = []
                        else:
                            location = [p.strip() for p in location_raw.split(',') if p.strip()][:2] if location_raw else []

                        # Hiring regime
                        hiring_regime = extract_hiring_regime(card_text_full)

                        # Salario - procurar padroes
                        salary = ''
                        for text in card_texts:
                            text_lower = text.lower()
                            # "Depends on Experience" ou valores como "$100k - $150k"
                            if '$' in text or 'depends' in text_lower or 'competitive' in text_lower or 'negotiable' in text_lower:
                                # Se texto curto (<50 chars), usar inteiro
                                if len(text) <= 50:
                                    salary = text
                                    break
                                # Para textos maiores, extrair apenas o valor do salario via regex
                                salary_match = re.search(r'\$[\d,]+(?:k)?(?:\.\d{2})?(?:\s*[-–]\s*\$?[\d,]+(?:k)?(?:\.\d{2})?)?(?:\s*/\s*(?:hr|hour|yr|year|mo|month|week))?', text, re.IGNORECASE)
                                if salary_match:
                                    salary = salary_match.group(0)
                                    break

                        # Data de publicacao - procurar "Today", "X days ago", etc
                        publication_date = ''
                        for text in card_texts:
                            if any(x in text.lower() for x in ['today', 'yesterday', 'ago', 'days', 'weeks', 'hours']):
                                publication_date = parse_relative_date(text)
                                break

                        # Limpar titulo (remover caracteres problematicos)
                        job_title = job_title.encode('ascii', 'ignore').decode('ascii').strip()

                        if job_title:
                            job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                            jobs.append(job)
                            jobs_found_this_page += 1

                    except Exception:
                        continue

                # Se nao encontrou novas vagas nesta pagina (todas duplicadas), parar
                if jobs_found_this_page == 0:
                    consecutive_empty += 1
                    if consecutive_empty >= max_empty_pages:
                        break

                page += 1
                await asyncio.sleep(0.3)

            except Exception:
                break

    print(f'Foram obtidas {len(jobs)} vagas do site Dice')
    return jobs


def reset_session():
    """Reseta a sessao (util em caso de bloqueio)."""
    global _session
    _session = None


if __name__ == "__main__":
    jobs = asyncio.run(get_dice_jobs())
    print(f'\n{"="*80}')
    print(f'RESULTADO: {len(jobs)} vagas encontradas')
    print(f'{"="*80}\n')

    for i, job in enumerate(jobs[:5]):
        link, title, company, location, work_type, hiring_regime, salary, pub_date = job
        print(f'--- Vaga {i+1} ---')
        print(f'Titulo: {title}')
        print(f'Empresa: {company}')
        print(f'Local: {location if location else "Nao especificado"}')
        print(f'Tipo: {work_type}')
        print(f'Regime: {hiring_regime if hiring_regime else "Nao especificado"}')
        print(f'Salario: {salary if salary else "Nao informado"}')
        print(f'Publicacao: {pub_date if pub_date else "Nao informado"}')
        print(f'Link: {link}')
        print()

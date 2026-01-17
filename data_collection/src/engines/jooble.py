import asyncio
from curl_cffi import requests
from bs4 import BeautifulSoup
from variavel import stacks


# Sessão global
_session = None


def get_session():
    """Retorna a sessão global, criando se necessário."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate='chrome')
    return _session


async def get_jooble_jobs() -> list:
    """
    Extrai vagas do Jooble Brasil.
    NOTA: Jooble usa JavaScript para renderizar vagas, resultados podem ser limitados.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()
    session = get_session()

    for stack in stacks:
        try:
            # Jooble usa ukw para keyword
            url = f'https://br.jooble.org/SearchResult?ukw={stack}'
            response = await asyncio.to_thread(session.get, url, timeout=30)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                # Jooble usa artigos com class que contém "vacancy"
                job_cards = soup.find_all('article')

                for card in job_cards:
                    try:
                        # Link da vaga
                        link_elem = card.find('a', href=True)
                        if not link_elem:
                            continue

                        link = link_elem.get('href', '')
                        if not link.startswith('http'):
                            link = f'https://br.jooble.org{link}'

                        if link in seen_links:
                            continue
                        seen_links.add(link)

                        # Título
                        title_elem = card.find('h2') or card.find('h3') or card.find('a')
                        job_title = title_elem.get_text(strip=True) if title_elem else ''
                        if not job_title:
                            continue

                        # Empresa
                        company_elem = card.find('p', class_=lambda x: x and 'company' in str(x).lower())
                        if not company_elem:
                            company_elem = card.find('span', class_=lambda x: x and 'company' in str(x).lower())
                        company = company_elem.get_text(strip=True) if company_elem else ''

                        # Localização
                        location_elem = card.find('span', class_=lambda x: x and 'location' in str(x).lower())
                        if not location_elem:
                            location_elem = card.find('div', class_=lambda x: x and 'location' in str(x).lower())

                        location_raw = location_elem.get_text(strip=True) if location_elem else ''

                        # Detectar work_type
                        title_lower = job_title.lower()
                        location_lower = location_raw.lower()

                        if 'remoto' in location_lower or 'remote' in location_lower or 'remoto' in title_lower:
                            work_type = 'Remoto'
                            location = []
                        elif 'híbrido' in location_lower or 'hibrido' in location_lower or 'hybrid' in location_lower:
                            work_type = 'Híbrido'
                            parts = [p.strip() for p in location_raw.split(',') if p.strip()]
                            location = parts[:2] if parts else []
                        else:
                            work_type = 'Presencial'
                            parts = [p.strip() for p in location_raw.split(',') if p.strip()]
                            location = parts[:2] if parts else []

                        # Regime de contratação (heurística do título)
                        if 'estágio' in title_lower or 'estagio' in title_lower or 'intern' in title_lower:
                            hiring_regime = 'Estágio'
                        elif 'pj' in title_lower or 'freelance' in title_lower:
                            hiring_regime = 'PJ'
                        elif 'temporário' in title_lower or 'temporario' in title_lower:
                            hiring_regime = 'Temporário'
                        else:
                            hiring_regime = ''

                        # Salário
                        salary_elem = card.find('span', class_=lambda x: x and 'salary' in str(x).lower())
                        salary = salary_elem.get_text(strip=True) if salary_elem else ''

                        # Data de publicação (Jooble mostra datas relativas)
                        publication_date = ''

                        job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                        jobs.append(job)

                    except Exception:
                        continue

        except Exception:
            continue

        # Rate limiting
        await asyncio.sleep(0.5)

    print(f'Foram obtidas {len(jobs)} vagas do site Jooble')
    return jobs


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


if __name__ == "__main__":
    jobs = asyncio.run(get_jooble_jobs())
    for job in jobs[:5]:
        print(job)

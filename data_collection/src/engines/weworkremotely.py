import asyncio
import xml.etree.ElementTree as ET
from curl_cffi import requests
from datetime import datetime


# Sessão global
_session = None


def get_session():
    """Retorna a sessão global, criando se necessário."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate='chrome')
    return _session


def parse_date(date_str):
    """Converte data do RSS para formato DD/MM/YYYY."""
    try:
        # Formato: Wed, 15 Jan 2026 00:00:00 +0000
        dt = datetime.strptime(date_str.strip(), '%a, %d %b %Y %H:%M:%S %z')
        return dt.strftime('%d/%m/%Y')
    except:
        try:
            # Formato alternativo
            dt = datetime.strptime(date_str.strip()[:16], '%a, %d %b %Y')
            return dt.strftime('%d/%m/%Y')
        except:
            return ''


async def get_weworkremotely_jobs() -> list:
    """
    Extrai vagas do We Work Remotely via RSS feed.
    Site 100% focado em vagas remotas.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()
    session = get_session()

    # Tech keywords para filtrar vagas relevantes
    tech_keywords = {
        'developer', 'engineer', 'programmer', 'software', 'frontend', 'backend',
        'full stack', 'fullstack', 'devops', 'data', 'python', 'java', 'javascript',
        'react', 'node', 'angular', 'vue', 'aws', 'cloud', 'mobile', 'ios', 'android',
        'flutter', 'kotlin', 'swift', 'go', 'rust', 'php', 'ruby', 'rails', '.net',
        'c#', 'typescript', 'design', 'ux', 'ui', 'product', 'qa', 'test', 'security',
        'machine learning', 'ml', 'ai', 'blockchain', 'web3', 'defi'
    }

    try:
        url = 'https://weworkremotely.com/remote-jobs.rss'
        response = await asyncio.to_thread(session.get, url, timeout=30)

        if response.status_code == 200:
            # Parse XML
            root = ET.fromstring(response.content)

            # Encontrar todos os itens
            for item in root.findall('.//item'):
                try:
                    # Título
                    title_elem = item.find('title')
                    job_title = title_elem.text.strip() if title_elem is not None and title_elem.text else ''
                    if not job_title:
                        continue

                    # Filtrar apenas vagas de tech
                    title_lower = job_title.lower()
                    is_tech = any(kw in title_lower for kw in tech_keywords)
                    if not is_tech:
                        continue

                    # Link
                    link_elem = item.find('link')
                    link = link_elem.text.strip() if link_elem is not None and link_elem.text else ''
                    if not link:
                        continue

                    if link in seen_links:
                        continue
                    seen_links.add(link)

                    # Empresa (no título geralmente: "Company: Job Title")
                    company = ''
                    if ':' in job_title:
                        parts = job_title.split(':', 1)
                        company = parts[0].strip()
                        job_title = parts[1].strip()

                    # Localização - sempre vazio pois é 100% remoto
                    location = []
                    work_type = 'Remoto'

                    # Regime (heurística do título)
                    if 'contract' in title_lower or 'contractor' in title_lower:
                        hiring_regime = 'Contractor'
                    elif 'part-time' in title_lower or 'part time' in title_lower:
                        hiring_regime = 'Part-time'
                    elif 'intern' in title_lower:
                        hiring_regime = 'Internship'
                    else:
                        hiring_regime = 'Full-time'

                    # Salário (não disponível no RSS)
                    salary = ''

                    # Data de publicação
                    pub_date_elem = item.find('pubDate')
                    publication_date = ''
                    if pub_date_elem is not None and pub_date_elem.text:
                        publication_date = parse_date(pub_date_elem.text)

                    job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                    jobs.append(job)

                except Exception:
                    continue

    except Exception:
        pass

    print(f'Foram obtidas {len(jobs)} vagas do site WeWorkRemotely')
    return jobs


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


if __name__ == "__main__":
    jobs = asyncio.run(get_weworkremotely_jobs())
    for job in jobs[:5]:
        print(job)

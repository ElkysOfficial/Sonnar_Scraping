import asyncio
import json
import re
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


def extract_title_from_content(content):
    """Extrai título limpo do conteúdo HTML."""
    if not content:
        return ''
    # Remove tags HTML
    soup = BeautifulSoup(content, 'html.parser')
    text = soup.get_text(strip=True)
    # Pega primeira linha/frase
    lines = text.split('\n')
    return lines[0][:100] if lines else text[:100]


async def get_jooble_jobs() -> list:
    """
    Extrai vagas do Jooble Brasil via __INITIAL_STATE__ embutido no HTML.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()
    session = get_session()

    for stack in stacks:
        try:
            url = f'https://br.jooble.org/SearchResult?ukw={stack}'
            response = await asyncio.to_thread(session.get, url, timeout=30)

            if response.status_code == 200:
                # Extrair __INITIAL_STATE__ do HTML
                match = re.search(r'__INITIAL_STATE__\s*=\s*({.+?});?\s*</script>', response.text, re.DOTALL)
                if not match:
                    continue

                try:
                    data = json.loads(match.group(1))
                except json.JSONDecodeError:
                    continue

                # Navegar até as vagas
                serp_jobs = data.get('serpJobs', {})
                jobs_pages = serp_jobs.get('jobs', [])
                if not jobs_pages:
                    continue

                items = jobs_pages[0].get('items', [])

                for item in items:
                    try:
                        # Pular componentes (banners, etc)
                        if item.get('componentName'):
                            continue

                        # Verificar se é uma vaga válida
                        if 'url' not in item:
                            continue

                        link = item.get('url', '')
                        if not link:
                            continue
                        if not link.startswith('http'):
                            link = f'https://br.jooble.org{link}'

                        if link in seen_links:
                            continue
                        seen_links.add(link)

                        # Título - extrair do fullContent ou content
                        full_content = item.get('fullContent', '') or item.get('content', '')
                        job_title = extract_title_from_content(full_content)
                        if not job_title:
                            continue

                        # Empresa
                        company_data = item.get('company', {})
                        company = company_data.get('name', '') if isinstance(company_data, dict) else ''

                        # Localização
                        location_data = item.get('location', {})
                        location_name = location_data.get('name', '') if isinstance(location_data, dict) else ''

                        # Detectar work_type
                        is_remote = item.get('isRemoteJob', False)
                        title_lower = job_title.lower()
                        location_lower = location_name.lower()

                        if is_remote or 'remoto' in title_lower or 'remote' in title_lower or 'remoto' in location_lower:
                            work_type = 'Remoto'
                            location = []
                        elif 'híbrido' in title_lower or 'hibrido' in title_lower or 'hybrid' in title_lower:
                            work_type = 'Híbrido'
                            parts = [p.strip() for p in location_name.split(',') if p.strip()]
                            location = parts[:2] if parts else []
                        else:
                            work_type = 'Presencial'
                            parts = [p.strip() for p in location_name.split(',') if p.strip()]
                            location = parts[:2] if parts else []

                        # Regime de contratação
                        job_type = item.get('jobType', '')
                        if 'estágio' in title_lower or 'estagio' in title_lower or 'intern' in title_lower:
                            hiring_regime = 'Estágio'
                        elif 'pj' in title_lower or 'freelance' in title_lower or 'contractor' in job_type.lower():
                            hiring_regime = 'PJ'
                        elif 'temporário' in title_lower or 'temporario' in title_lower:
                            hiring_regime = 'Temporário'
                        else:
                            hiring_regime = ''

                        # Salário
                        salary = item.get('salary', '') or ''
                        if isinstance(salary, dict):
                            salary = ''

                        # Data de publicação
                        date_caption = item.get('dateCaption', '')
                        # dateCaption vem como "há 2 dias", "hoje", etc - deixamos vazio
                        publication_date = ''

                        job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                        jobs.append(job)

                    except Exception:
                        continue

        except Exception:
            continue

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

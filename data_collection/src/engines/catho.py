import json
from bs4 import BeautifulSoup
from curl_cffi import requests
import asyncio
import random
import sys
import os

# Adiciona o diretório pai ao path para importar variavel
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import stacks


# Sessão global para reutilizar cookies
_session = None


def get_session():
    """Retorna a sessão global, criando se necessário."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate='chrome')
        # Acessa a home primeiro para inicializar cookies
        _session.get('https://www.catho.com.br/')
    return _session


async def get_catho_links() -> list:
    """Extrai links das vagas de emprego do Catho."""
    links = []
    session = get_session()

    max_pages = int(os.getenv("CATHO_MAX_PAGES", "20"))
    max_empty_pages = int(os.getenv("CATHO_MAX_EMPTY_PAGES", "1"))

    for stack in stacks:
        page = 1
        consecutive_empty = 0

        while page <= max_pages and consecutive_empty < max_empty_pages:
            try:
                if page > 1:
                    await asyncio.sleep(random.uniform(0.5, 1.5))

                url = f'https://www.catho.com.br/vagas/{stack}/?page={page}'
                response = await asyncio.to_thread(session.get, url)

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    cells = soup.find_all('li', class_=lambda x: x and 'jobItem' in str(x))

                    if not cells:
                        consecutive_empty += 1
                        page += 1
                        continue

                    consecutive_empty = 0

                    for cell in cells:
                        link_elem = cell.find('a', href=True)
                        if link_elem:
                            href = link_elem.get('href')
                            # Garantir URL completa
                            if href.startswith('/'):
                                href = 'https://www.catho.com.br' + href
                            if '/vagas/' in href and href not in links:
                                links.append(href)

                    page += 1
                else:
                    consecutive_empty += 1
                    page += 1

            except Exception:
                consecutive_empty += 1
                page += 1

    # Remover duplicatas mantendo ordem
    links = list(dict.fromkeys(links))
    return links


async def fetch_job_details(link, semaphore):
    """Extrai detalhes de uma vaga a partir do link."""
    async with semaphore:
        await asyncio.sleep(random.uniform(0.3, 0.8))

        session = get_session()

        try:
            response = await asyncio.to_thread(session.get, link, timeout=30)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                script = soup.find('script', type='application/json')

                if not script:
                    return None

                data = json.loads(script.text)

                if 'props' not in data or 'pageProps' not in data['props']:
                    return None

                job_data = data['props']['pageProps'].get('jobAdData')
                if not job_data:
                    return None

                job_title = job_data.get('titulo', '')

                # Empresa
                contratante = job_data.get('contratante', {})
                company = contratante.get('nome', 'Não informado') if isinstance(contratante, dict) else 'Não informado'

                # Localização
                location = []
                vagas = job_data.get('vagas', [])
                if vagas and isinstance(vagas, list) and len(vagas) > 0:
                    vaga = vagas[0]
                    cidade = vaga.get('cidade', '')
                    uf = vaga.get('uf', '')
                    if cidade:
                        location.append(str(cidade))
                    if uf:
                        location.append(uf)

                # Modalidade de trabalho
                modalidade = job_data.get('modeloTrabalho', '')
                if modalidade:
                    work_type = modalidade
                else:
                    titulo_lower = job_title.lower()
                    descricao = str(job_data.get('descricao', '')).lower()
                    if 'remoto' in titulo_lower or 'remoto' in descricao or 'home office' in descricao:
                        work_type = 'Remoto'
                    elif 'híbrido' in titulo_lower or 'hibrido' in titulo_lower or 'híbrido' in descricao:
                        work_type = 'Híbrido'
                    else:
                        work_type = 'Presencial'

                # Regime de contratação
                hiring_regime = job_data.get('regimeContrato', '') or 'Não informado'

                # Salário
                salary = job_data.get('faixaSalarial', '') or 'A combinar'

                # Data de publicação no formato brasileiro DD/MM/YYYY
                data_pub = job_data.get('data', '')
                date_raw = data_pub[:10] if data_pub else ''
                if date_raw and len(date_raw) == 10 and '-' in date_raw:
                    parts = date_raw.split('-')
                    publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                else:
                    publication_date = date_raw

                return [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]

        except Exception:
            pass

        return None


async def get_catho_jobs() -> list:
    """Extrai detalhes das vagas de emprego."""
    jobs = []
    job_links = await get_catho_links()

    # Semáforo para limitar requisições simultâneas
    semaphore = asyncio.Semaphore(5)

    job_details = await asyncio.gather(*[fetch_job_details(link, semaphore) for link in job_links])

    for job in job_details:
        if job is not None:
            jobs.append(job)

    print(f'Foram obtidas {len(jobs)} vagas do site Catho')
    return jobs


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


# Teste
if __name__ == "__main__":
    jobs = asyncio.run(get_catho_jobs())
    for job in jobs[:10]:
        print(job)

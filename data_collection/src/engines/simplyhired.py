import asyncio
import json
import os
import re
import sys
import urllib.parse
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from utils.google_enricher import GoogleEnricher, is_missing_field
from variavel import stacks


# Sessão global
_session = None


def get_session():
    """Retorna a sessão global, criando se necessário."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate='chrome')
    return _session


async def get_simplyhired_jobs() -> list:
    """
    Extrai vagas do SimplyHired Brasil via __NEXT_DATA__ embutido no HTML.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_links = set()
    session = get_session()

    for stack in stacks:
        # Percorrer 10 páginas por stack
        for page in range(1, 11):
            try:
                url = f'https://www.simplyhired.com.br/search?q={stack}&l=&pn={page}'
                response = await asyncio.to_thread(session.get, url, timeout=30)

                if response.status_code != 200:
                    break

                # Extrair __NEXT_DATA__ do HTML
                match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', response.text)
                if not match:
                    break

                try:
                    data = json.loads(match.group(1))
                except json.JSONDecodeError:
                    break

                # Navegar até as vagas
                page_props = data.get('props', {}).get('pageProps', {})
                job_list = page_props.get('jobs', [])

                # Se não tem vagas, para de paginar
                if not job_list:
                    break

                for item in job_list:
                    try:
                        # Link
                        encoded_url = item.get('encodedUrl', '')
                        if not encoded_url:
                            continue

                        # Decodificar URL
                        decoded_url = urllib.parse.unquote(encoded_url)
                        link = f'https://www.simplyhired.com.br{decoded_url}'

                        if link in seen_links:
                            continue
                        seen_links.add(link)

                        # Título
                        job_title = item.get('title', '')
                        if not job_title:
                            continue

                        # Empresa (geralmente no título após " - ")
                        company = ''
                        if ' - ' in job_title:
                            parts = job_title.rsplit(' - ', 1)
                            job_title = parts[0].strip()
                            company = parts[1].strip() if len(parts) > 1 else ''

                        # Localização e work_type
                        remote_attrs = item.get('remoteAttributes', [])
                        title_lower = job_title.lower()

                        if remote_attrs or 'remoto' in title_lower or 'remote' in title_lower:
                            work_type = 'Remoto'
                            location = []
                        elif 'híbrido' in title_lower or 'hybrid' in title_lower:
                            work_type = 'Híbrido'
                            location = []
                        else:
                            work_type = 'Presencial'
                            location = []

                        # Regime de contratação
                        job_types = item.get('jobTypes', [])
                        hiring_regime = ''
                        for jt in job_types:
                            jt_lower = jt.lower() if isinstance(jt, str) else ''
                            if 'integral' in jt_lower or 'full' in jt_lower:
                                hiring_regime = 'CLT'
                            elif 'parcial' in jt_lower or 'part' in jt_lower:
                                hiring_regime = 'Meio Período'
                            elif 'temporário' in jt_lower or 'temp' in jt_lower:
                                hiring_regime = 'Temporário'
                            elif 'estágio' in jt_lower or 'intern' in jt_lower:
                                hiring_regime = 'Estágio'
                            elif 'freelance' in jt_lower or 'contract' in jt_lower:
                                hiring_regime = 'PJ'

                        # Salário (não disponível na listagem)
                        salary = ''

                        # Data de publicação (não disponível na listagem)
                        publication_date = ''

                        job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                        jobs.append(job)

                    except Exception:
                        continue

                await asyncio.sleep(0.3)

            except Exception:
                break

    # Enriquecer vagas com location e salary vazios usando Google
    if jobs:
        async with GoogleEnricher() as enricher:
            for job_data in jobs:
                needs_location = job_data[4] != 'Remoto' and is_missing_field(job_data[3] if isinstance(job_data[3], str) else ", ".join(job_data[3]) if job_data[3] else "")
                needs_salary = is_missing_field(job_data[6])

                if needs_location or needs_salary:
                    enriched = await enricher.enrich_job({
                        "company": job_data[2],
                        "job_title": job_data[1],
                        "location": job_data[3] if isinstance(job_data[3], str) else ", ".join(job_data[3]) if job_data[3] else "",
                        "salary": job_data[6]
                    })
                    if needs_location and enriched.get("location"):
                        job_data[3] = enriched["location"]
                    if needs_salary and enriched.get("salary"):
                        job_data[6] = enriched["salary"]

    print(f'Foram obtidas {len(jobs)} vagas do site SimplyHired')
    return jobs


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


if __name__ == "__main__":
    jobs = asyncio.run(get_simplyhired_jobs())
    for job in jobs[:5]:
        print(job)

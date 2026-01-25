import asyncio
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from utils.google_enricher import GoogleEnricher, is_missing_field
from variavel import stacks


def parse_relative_date(date_text: str) -> str:
    """Converte datas relativas para formato DD/MM/YYYY."""
    if not date_text:
        return ''

    date_text = date_text.lower().strip()
    today = datetime.now()

    if 'hoje' in date_text or 'today' in date_text or 'just' in date_text:
        return today.strftime('%d/%m/%Y')
    if 'ontem' in date_text or 'yesterday' in date_text:
        return (today - timedelta(days=1)).strftime('%d/%m/%Y')

    # "X dias" ou "X days"
    days_match = re.search(r'(\d+)\s*(dias?|days?)', date_text)
    if days_match:
        days = int(days_match.group(1))
        return (today - timedelta(days=days)).strftime('%d/%m/%Y')

    # "X semanas" ou "X weeks"
    weeks_match = re.search(r'(\d+)\s*(semanas?|weeks?)', date_text)
    if weeks_match:
        weeks = int(weeks_match.group(1))
        return (today - timedelta(weeks=weeks)).strftime('%d/%m/%Y')

    # "X meses" ou "X months"
    months_match = re.search(r'(\d+)\s*(m[eê]s(es)?|months?)', date_text)
    if months_match:
        months = int(months_match.group(1))
        return (today - timedelta(days=months * 30)).strftime('%d/%m/%Y')

    return ''


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

    max_pages = int(os.getenv("SIMPLYHIRED_MAX_PAGES", "20"))
    max_empty_pages = int(os.getenv("SIMPLYHIRED_MAX_EMPTY_PAGES", "1"))

    for stack in stacks:
        page = 1
        empty_pages = 0
        while page <= max_pages and empty_pages < max_empty_pages:
            try:
                url = f'https://www.simplyhired.com.br/search?q={stack}&l=&pn={page}'
                response = await asyncio.to_thread(session.get, url, timeout=30)

                if response.status_code != 200:
                    empty_pages += 1
                    page += 1
                    continue

                # Extrair __NEXT_DATA__ do HTML
                match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', response.text)
                if not match:
                    empty_pages += 1
                    page += 1
                    continue

                try:
                    data = json.loads(match.group(1))
                except json.JSONDecodeError:
                    empty_pages += 1
                    page += 1
                    continue

                # Navegar até as vagas
                page_props = data.get('props', {}).get('pageProps', {})
                job_list = page_props.get('jobs', [])

                # Se não tem vagas, conta página vazia
                if not job_list:
                    empty_pages += 1
                    page += 1
                    continue

                empty_pages = 0

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

                        # Empresa - buscar em vários campos possíveis
                        company = item.get('company', '') or item.get('companyName', '') or item.get('employer', '')
                        if not company:
                            # Tentar extrair do campo companyRating ou similar
                            company_info = item.get('companyInfo', {})
                            if isinstance(company_info, dict):
                                company = company_info.get('name', '') or company_info.get('companyName', '')

                        # Fallback: extrair do título se ainda não tiver
                        if not company and ' - ' in job_title:
                            parts = job_title.rsplit(' - ', 1)
                            job_title = parts[0].strip()
                            company = parts[1].strip() if len(parts) > 1 else ''

                        # Localização
                        location_str = item.get('location', '') or item.get('formattedLocation', '')
                        if isinstance(location_str, str) and location_str:
                            location = [p.strip() for p in location_str.split(',') if p.strip()][:2]
                        else:
                            location = []

                        # Work type
                        remote_attrs = item.get('remoteAttributes', [])
                        title_lower = job_title.lower()
                        location_lower = location_str.lower() if isinstance(location_str, str) else ''

                        if remote_attrs or 'remoto' in title_lower or 'remote' in title_lower or 'remoto' in location_lower:
                            work_type = 'Remoto'
                            location = []
                        elif 'híbrido' in title_lower or 'hybrid' in title_lower or 'híbrido' in location_lower:
                            work_type = 'Híbrido'
                        else:
                            work_type = 'Presencial'

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

                        # Salário
                        salary = item.get('salary', '') or item.get('salaryText', '') or item.get('formattedSalary', '')

                        # Data de publicação
                        publication_date = ''
                        date_field = item.get('postedAt', '') or item.get('datePosted', '') or item.get('postedDate', '') or item.get('formattedDate', '')
                        if date_field:
                            # Tentar formato ISO primeiro
                            if isinstance(date_field, str) and len(date_field) >= 10 and '-' in date_field:
                                date_raw = date_field[:10]
                                parts = date_raw.split('-')
                                if len(parts) == 3:
                                    publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                            else:
                                # Tentar formato relativo
                                publication_date = parse_relative_date(str(date_field))

                        job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                        jobs.append(job)

                    except Exception:
                        continue

                page += 1
                await asyncio.sleep(0.3)

            except Exception:
                empty_pages += 1
                page += 1

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

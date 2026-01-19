import asyncio
from curl_cffi import requests


# Sessão global
_session = None


def get_session():
    """Retorna a sessão global, criando se necessário."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate='chrome')
    return _session


async def get_remotive_jobs() -> list:
    """
    Extrai vagas do Remotive via API JSON pública.
    Site 100% focado em vagas remotas.
    Percorre múltiplas categorias para maximizar cobertura.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_ids = set()
    session = get_session()

    # Categorias de vagas do Remotive (slugs da API)
    categories = [
        'software-dev',
        'data',
        'design',
        'product',
        'customer-support',
        'marketing',
        'sales',
        'devops-sysadmin',
        'finance-legal',
        'hr',
        'qa',
        'writing',
        'all-others',
    ]

    for category in categories:
        try:
            # API pública do Remotive com filtro de categoria
            url = f'https://remotive.com/api/remote-jobs?category={category}'
            response = await asyncio.to_thread(session.get, url, timeout=30)

            if response.status_code != 200:
                continue

            data = response.json()
            job_list = data.get('jobs', [])

            for item in job_list:
                try:
                    job_id = item.get('id')
                    if not job_id or job_id in seen_ids:
                        continue
                    seen_ids.add(job_id)

                    # Link
                    link = item.get('url', '')
                    if not link:
                        continue

                    # Título
                    job_title = item.get('title', '')
                    if not job_title:
                        continue

                    # Empresa
                    company = item.get('company_name', '')

                    # Localização - sempre vazio pois é 100% remoto
                    location = []
                    work_type = 'Remoto'

                    # Regime
                    job_type = item.get('job_type', '')
                    if job_type:
                        if 'contract' in job_type.lower():
                            hiring_regime = 'Contractor'
                        elif 'part' in job_type.lower():
                            hiring_regime = 'Part-time'
                        elif 'intern' in job_type.lower():
                            hiring_regime = 'Internship'
                        else:
                            hiring_regime = 'Full-time'
                    else:
                        hiring_regime = 'Full-time'

                    # Salário
                    salary = item.get('salary', '')

                    # Data de publicação
                    publication_date_raw = item.get('publication_date', '')
                    if publication_date_raw:
                        # Formato: 2024-01-15T00:00:00
                        date_raw = publication_date_raw[:10]
                        if date_raw and len(date_raw) == 10 and '-' in date_raw:
                            parts = date_raw.split('-')
                            publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                        else:
                            publication_date = date_raw
                    else:
                        publication_date = ''

                    job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                    jobs.append(job)

                except Exception:
                    continue

            await asyncio.sleep(0.3)

        except Exception:
            continue

    print(f'Foram obtidas {len(jobs)} vagas do site Remotive')
    return jobs


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


if __name__ == "__main__":
    jobs = asyncio.run(get_remotive_jobs())
    for job in jobs[:5]:
        print(job)

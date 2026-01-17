import httpx
import asyncio


async def get_remotive_jobs() -> list:
    """
    Extrai vagas do Remotive.
    Site 100% focado em vagas remotas com API JSON.
    Returns: [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    seen_ids = set()

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    }

    # Categorias de vagas do Remotive
    categories = [
        'software-dev',
        'frontend-dev',
        'backend-dev',
        'devops-sysadmin',
        'data',
        'design',
        'product',
        'qa',
    ]

    try:
        async with httpx.AsyncClient(timeout=30, headers=headers, follow_redirects=True) as client:
            # Remotive tem uma API pública
            url = 'https://remotive.com/api/remote-jobs'
            response = await client.get(url)

            if response.status_code == 200:
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

                        # Categoria pode indicar o tipo
                        category = item.get('category', '')

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

    except Exception:
        pass

    print(f'Foram obtidas {len(jobs)} vagas do site Remotive')
    return jobs


if __name__ == "__main__":
    jobs = asyncio.run(get_remotive_jobs())
    for job in jobs[:5]:
        print(job)

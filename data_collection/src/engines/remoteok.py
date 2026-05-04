import asyncio
import sys
import os
from curl_cffi import requests

# Adiciona o diretório pai ao path para importar variavel
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import stacks


# Sessão global
_session = None


def get_session():
    """Retorna a sessão global, criando se necessário."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate='chrome')
    return _session


async def get_remoteok_jobs(on_job=None) -> list:
    """
    Extrai vagas do RemoteOK via API JSON pública.

    Particularidade: a API devolve **todas** as vagas em uma única chamada, e
    nós filtramos client-side. Por isso esta engine **não usa batching** — o
    lote ativo seria irrelevante (uma chamada cobre tudo). Mantemos o set
    completo ``stacks`` como filtro primário e um conjunto tech amplo como
    fallback (sem ele, stacks restritas filtrariam vagas relevantes).

    Args:
        on_job: callback opcional invocado a cada vaga relevante.
    """
    session = get_session()

    try:
        response = await asyncio.to_thread(session.get, 'https://remoteok.com/api', timeout=30)

        if response.status_code != 200:
            print(f'Erro ao acessar API RemoteOK: {response.status_code}')
            return []

        data = response.json()

        # Primeiro item é metadata, vagas começam do índice 1
        if not data or len(data) < 2:
            print('Nenhuma vaga encontrada na API RemoteOK')
            return []

        # Stacks ativas em variavel.py + fallback tech amplo (RemoteOK é tech-only,
        # mas usa tags variadas tipo "dev", "engineer", "backend" — sem fallback,
        # uma stack restrita como {'Python'} filtra demais).
        stacks_lower = {s.lower().replace('_', ' ').replace('-', ' ') for s in stacks}
        tech_fallback = {
            'dev', 'developer', 'engineer', 'engineering', 'software', 'backend',
            'frontend', 'fullstack', 'full-stack', 'mobile', 'web', 'devops',
            'sre', 'data', 'ml', 'ai', 'machine learning', 'cloud', 'security',
            'qa', 'testing', 'design', 'ux', 'ui', 'product', 'sysadmin',
        }

        jobs = []
        seen_ids = set()

        for item in data[1:]:  # Pula metadata
            job_id = item.get('id')
            if not job_id or job_id in seen_ids:
                continue

            tags_raw = item.get('tags', []) or []
            tags = [str(t).lower() for t in tags_raw]
            position = (item.get('position') or '').lower()
            description = (item.get('description') or '').lower()[:500]

            haystack_terms = set(tags) | set(position.split()) | set(description.split())

            # Match prioritário: stacks declaradas. Fallback: tags tech genéricas.
            is_relevant = False
            for stack in stacks_lower:
                if any(word in haystack_terms for word in stack.split()):
                    is_relevant = True
                    break
            if not is_relevant:
                if haystack_terms & tech_fallback:
                    is_relevant = True

            if not is_relevant:
                continue

            seen_ids.add(job_id)

            # Extrair dados
            link = item.get('url', '')
            job_title = item.get('position', '')
            company = item.get('company', '')
            location = []  # RemoteOK é sempre remoto
            work_type = 'Remoto'
            hiring_regime = 'Full-time'  # Padrão para RemoteOK

            # Salário
            salary = ''
            salary_min = item.get('salary_min')
            salary_max = item.get('salary_max')
            if salary_min and salary_max:
                if salary_min == salary_max:
                    salary = f'USD {salary_min}'
                else:
                    salary = f'USD {salary_min} - {salary_max}'
            elif salary_min:
                salary = f'USD {salary_min}'

            # Data de publicação no formato brasileiro DD/MM/YYYY
            date_posted = item.get('date', '')
            date_raw = date_posted[:10] if date_posted else ''
            if date_raw and len(date_raw) == 10 and '-' in date_raw:
                parts = date_raw.split('-')
                publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
            else:
                publication_date = date_raw

            job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
            jobs.append(job)
            if on_job is not None:
                try:
                    await on_job(job)
                except Exception:
                    pass

        print(f'Foram obtidas {len(jobs)} vagas do site RemoteOK')
        return jobs

    except Exception:
        return []


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


# Teste
if __name__ == "__main__":
    jobs = asyncio.run(get_remoteok_jobs())
    print(f'Total: {len(jobs)}')
    for job in jobs[:10]:
        print(job)

import asyncio
import json
import re
from datetime import datetime, timedelta
from curl_cffi import requests
from bs4 import BeautifulSoup
from variavel import get_active_stacks


# Sessão global
_session = None


def get_session():
    """Retorna a sessão global, criando se necessário."""
    global _session
    if _session is None:
        # IMPORTANTE: Não adicionar headers personalizados!
        # impersonate='chrome120' já configura todos os headers corretos.
        # Headers extras conflitam e causam 403.
        _session = requests.Session(impersonate='chrome120')
    return _session


def parse_relative_date(date_caption: str) -> str:
    """
    Converte datas relativas do Jooble para formato DD/MM/YYYY.
    Exemplos: 'há 2 dias atrás', 'hoje', 'há 1 hora', 'ontem'
    """
    if not date_caption:
        return ''

    date_caption = date_caption.lower().strip()
    today = datetime.now()

    # Hoje
    if 'hoje' in date_caption or 'agora' in date_caption or 'hora' in date_caption or 'minuto' in date_caption:
        return today.strftime('%d/%m/%Y')

    # Ontem
    if 'ontem' in date_caption:
        return (today - timedelta(days=1)).strftime('%d/%m/%Y')

    # "há X dias"
    days_match = re.search(r'(\d+)\s*dias?', date_caption)
    if days_match:
        days = int(days_match.group(1))
        return (today - timedelta(days=days)).strftime('%d/%m/%Y')

    # "há X semanas"
    weeks_match = re.search(r'(\d+)\s*semanas?', date_caption)
    if weeks_match:
        weeks = int(weeks_match.group(1))
        return (today - timedelta(weeks=weeks)).strftime('%d/%m/%Y')

    # "há X meses" (aproximado)
    months_match = re.search(r'(\d+)\s*m[eê]s(es)?', date_caption)
    if months_match:
        months = int(months_match.group(1))
        return (today - timedelta(days=months * 30)).strftime('%d/%m/%Y')

    return ''


def parse_iso_date(date_str: str) -> str:
    """Converte data ISO (YYYY-MM-DD) para formato brasileiro (DD/MM/YYYY)."""
    if not date_str:
        return ''
    try:
        # Pega apenas a parte da data (ignora hora)
        date_part = date_str[:10]
        if len(date_part) == 10 and '-' in date_part:
            parts = date_part.split('-')
            return f"{parts[2]}/{parts[1]}/{parts[0]}"
    except Exception:
        pass
    return ''


def extract_hiring_regime(title: str, job_type: str = '') -> str:
    """Extrai regime de contratação do título ou tipo de vaga."""
    title_lower = title.lower()
    job_type_lower = (job_type or '').lower()

    if 'estágio' in title_lower or 'estagio' in title_lower or 'intern' in title_lower or 'estágio' in job_type_lower:
        return 'Estágio'
    if 'pj' in title_lower or 'pessoa jurídica' in title_lower or 'pessoa juridica' in title_lower:
        return 'PJ'
    if 'freelance' in title_lower or 'freelancer' in title_lower or 'contractor' in job_type_lower:
        return 'Freelancer'
    if 'temporário' in title_lower or 'temporario' in title_lower or 'temporary' in job_type_lower:
        return 'Temporário'
    if 'part-time' in title_lower or 'meio período' in title_lower or 'meio periodo' in title_lower:
        return 'Meio Período'
    if 'clt' in title_lower:
        return 'CLT'
    if 'full-time' in job_type_lower or 'full_time' in job_type_lower or 'integral' in job_type_lower:
        return 'Full-time'

    return ''


async def get_jooble_jobs(on_job=None) -> list:
    """
    Extrai vagas do Jooble Brasil via ``__INITIAL_STATE__`` embutido no HTML.

    O Jooble é um agregador que usa links de redirect — usamos o ``uid`` da
    vaga como chave de deduplicação para evitar gravar a mesma vaga sob URLs
    de redirect diferentes.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga.
    """
    import urllib.parse

    jobs = []
    seen_ids = set()
    session = get_session()

    for stack in get_active_stacks():
        encoded = urllib.parse.quote(stack)
        # Percorrer até 10 páginas por stack (~200 vagas por stack)
        for page in range(1, 11):
            try:
                url = f'https://br.jooble.org/SearchResult?ukw={encoded}&p={page}'
                response = await asyncio.to_thread(session.get, url, timeout=30)

                if response.status_code != 200:
                    break

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
                        # Pular componentes (banners, widgets, etc)
                        if item.get('componentName'):
                            continue

                        # Usar uid como identificador único
                        uid = item.get('uid', '')
                        if not uid:
                            continue

                        if uid in seen_ids:
                            continue
                        seen_ids.add(uid)

                        # === TÍTULO ===
                        # Usar campo 'position' que tem o título limpo
                        # Tratar encoding: remover caracteres problemáticos (emojis)
                        job_title = item.get('position', '') or ''
                        # Limpar caracteres não-ASCII problemáticos (emojis causam UnicodeEncodeError no Windows)
                        job_title = job_title.encode('ascii', 'ignore').decode('ascii').strip()

                        if not job_title:
                            # Fallback para fullContent
                            full_content = item.get('fullContent', '') or item.get('content', '')
                            if full_content:
                                soup = BeautifulSoup(full_content, 'html.parser')
                                text = soup.get_text(strip=True)
                                text = text.encode('ascii', 'ignore').decode('ascii')
                                job_title = text.split('\n')[0][:100] if text else ''

                        if not job_title:
                            continue

                        # === EMPRESA ===
                        company_data = item.get('company')
                        company = ''
                        if company_data is None:
                            company = 'Não informado'
                        elif isinstance(company_data, dict):
                            company = company_data.get('name') or 'Não informado'
                        elif isinstance(company_data, str):
                            company = company_data or 'Não informado'
                        else:
                            company = 'Não informado'

                        # Normalizar empresa confidencial
                        if company.lower() in ['confidencial', 'empresa confidencial', '']:
                            company = 'Confidencial'

                        # === LOCALIZAÇÃO ===
                        location_data = item.get('location')
                        location_name = ''
                        if location_data is None:
                            location_name = ''
                        elif isinstance(location_data, dict):
                            location_name = location_data.get('name') or ''
                        elif isinstance(location_data, str):
                            location_name = location_data

                        # === WORK TYPE (Remoto/Híbrido/Presencial) ===
                        is_remote = item.get('isRemoteJob', False)
                        title_lower = job_title.lower()
                        location_lower = location_name.lower()

                        if is_remote or 'remoto' in title_lower or 'remote' in title_lower or 'remoto' in location_lower:
                            work_type = 'Remoto'
                            location = []
                        elif 'híbrido' in title_lower or 'hibrido' in title_lower or 'hybrid' in title_lower or 'híbrido' in location_lower:
                            work_type = 'Híbrido'
                            parts = [p.strip() for p in location_name.split(',') if p.strip()]
                            location = parts[:2] if parts else []
                        else:
                            work_type = 'Presencial'
                            parts = [p.strip() for p in location_name.split(',') if p.strip()]
                            location = parts[:2] if parts else []

                        # === REGIME DE CONTRATAÇÃO ===
                        job_type = item.get('jobType', '') or ''
                        hiring_regime = extract_hiring_regime(job_title, job_type)

                        # === SALÁRIO ===
                        # Na prática, salary vem como string (geralmente vazia)
                        salary_raw = item.get('salary')
                        salary = ''

                        if salary_raw is None:
                            salary = ''
                        elif isinstance(salary_raw, str):
                            salary = salary_raw.strip()
                        elif isinstance(salary_raw, dict):
                            # Fallback caso mude para dict no futuro
                            min_sal = salary_raw.get('min', salary_raw.get('minValue', ''))
                            max_sal = salary_raw.get('max', salary_raw.get('maxValue', ''))
                            currency = salary_raw.get('currency', 'R$')
                            if min_sal and max_sal:
                                salary = f'{currency} {min_sal} - {max_sal}'
                            elif min_sal:
                                salary = f'{currency} {min_sal}'

                        # Verificar estimatedSalary como fallback
                        if not salary:
                            estimated = item.get('estimatedSalary')
                            if estimated and isinstance(estimated, dict):
                                min_sal = estimated.get('min', estimated.get('minValue', ''))
                                max_sal = estimated.get('max', estimated.get('maxValue', ''))
                                if min_sal:
                                    salary = f'R$ {min_sal}' + (f' - R$ {max_sal}' if max_sal else '')

                        # === DATA DE PUBLICAÇÃO ===
                        # Tentar dateUpdated primeiro (formato ISO)
                        date_updated = item.get('dateUpdated', '')
                        publication_date = parse_iso_date(date_updated)

                        # Fallback para dateCaption (formato relativo)
                        if not publication_date:
                            date_caption = item.get('dateCaption', '')
                            publication_date = parse_relative_date(date_caption)

                        # === LINK ===
                        # Construir link para página de detalhes do Jooble (mais estável que /away/)
                        link = f'https://br.jooble.org/desc/{uid}?ckey={encoded}'

                        # === VALIDAÇÃO FINAL ===
                        # Só adiciona vagas com título preenchido (empresa pode ser "Confidencial")
                        if job_title:
                            job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                            jobs.append(job)
                            if on_job is not None:
                                try:
                                    await on_job(job)
                                except Exception:
                                    pass

                    except Exception:
                        continue

                # Continuar paginando mesmo com duplicatas
                # Apenas parar se a página não tiver nenhum item (fim dos resultados)
                if len(items) == 0:
                    break

                await asyncio.sleep(0.3)

            except Exception:
                break

    print(f'Foram obtidas {len(jobs)} vagas do site Jooble')
    return jobs


def reset_session():
    """Reseta a sessão (útil em caso de bloqueio)."""
    global _session
    _session = None


if __name__ == "__main__":
    jobs = asyncio.run(get_jooble_jobs())
    print(f'\n{"="*80}')
    print(f'RESULTADO: {len(jobs)} vagas encontradas')
    print(f'{"="*80}\n')

    for i, job in enumerate(jobs[:5]):
        link, title, company, location, work_type, hiring_regime, salary, pub_date = job
        print(f'--- Vaga {i+1} ---')
        print(f'Título: {title}')
        print(f'Empresa: {company}')
        print(f'Local: {location if location else "Não especificado"}')
        print(f'Tipo: {work_type}')
        print(f'Regime: {hiring_regime if hiring_regime else "Não especificado"}')
        print(f'Salário: {salary if salary else "Não informado"}')
        print(f'Publicação: {pub_date if pub_date else "Não informado"}')
        print(f'Link: {link}')
        print()

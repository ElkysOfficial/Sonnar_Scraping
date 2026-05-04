import httpx
import asyncio
import json
from bs4 import BeautifulSoup


# Categorias válidas do MichaelPage Brasil (slugs pré-definidos)
# O site não suporta busca por texto livre - apenas categorias
MICHAELPAGE_CATEGORIES = [
    'ti-tecnologia',
    'engenharia',
    'financas-contabilidade',
    'vendas',
    'marketing',
    'recursos-humanos',
    'supply-chain',
    'juridico',
]


async def get_michaelpage_jobs(on_job=None) -> list:
    """
    Extrai vagas do Michael Page Brasil.

    O MichaelPage **não suporta busca por texto livre** — usa categorias
    pré-definidas (slugs em ``MICHAELPAGE_CATEGORIES``). Por isso esta engine
    não participa do batching: sempre cobre as mesmas 8 categorias.

    Args:
        on_job: callback opcional invocado a cada vaga emitida.
    """
    jobs = []
    seen_links = set()

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    }

    # Busca por categorias válidas do site
    for category in MICHAELPAGE_CATEGORIES:
        try:
            async with httpx.AsyncClient(timeout=30, headers=headers, follow_redirects=True) as client:
                # Michael Page Brasil - usar categorias ao invés de stacks
                url = f'https://www.michaelpage.com.br/jobs/{category}'
                response = await client.get(url)

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')

                    # ESTRATÉGIA PRINCIPAL: Buscar links /job-detail/ na página
                    # O MichaelPage não usa JSON-LD nas listagens, apenas nas páginas individuais
                    all_links = soup.find_all('a', href=True)
                    job_detail_links = [
                        a for a in all_links
                        if '/job-detail/' in a.get('href', '')
                    ]

                    for link_elem in job_detail_links:
                        try:
                            href = link_elem.get('href', '')
                            if not href:
                                continue

                            # Construir URL completa
                            if href.startswith('/'):
                                link = f'https://www.michaelpage.com.br{href}'
                            else:
                                link = href

                            # Deduplicar
                            if link in seen_links:
                                continue
                            seen_links.add(link)

                            # Extrair título do texto do link
                            job_title = link_elem.get_text(strip=True)
                            if not job_title or len(job_title) < 3:
                                continue

                            # Empresa - MichaelPage geralmente é consultoria, empresa = cliente confidencial
                            company = 'Michael Page'

                            # Localização e work_type - extrair do contexto pai
                            parent = link_elem.find_parent('div')
                            location_raw = ''
                            work_type = 'Presencial'
                            hiring_regime = ''
                            salary = ''

                            if parent:
                                parent_text = parent.get_text(strip=True).lower()

                                # Detectar localização no texto
                                if 'são paulo' in parent_text:
                                    location_raw = 'São Paulo'
                                elif 'rio de janeiro' in parent_text:
                                    location_raw = 'Rio de Janeiro'

                                # Detectar work_type
                                if 'home office' in parent_text or 'remoto' in parent_text:
                                    work_type = 'Remoto'
                                elif 'híbrido' in parent_text or 'hibrido' in parent_text:
                                    work_type = 'Híbrido'

                                # Detectar regime
                                if 'permanent' in parent_text or 'efetivo' in parent_text:
                                    hiring_regime = 'CLT'
                                elif 'temporár' in parent_text:
                                    hiring_regime = 'Temporário'

                            # Construir location como lista
                            title_lower = job_title.lower()
                            if work_type == 'Remoto':
                                location = []
                            elif location_raw:
                                location = [location_raw]
                            else:
                                location = []

                            # Detectar work_type também pelo título
                            if 'remoto' in title_lower or 'remote' in title_lower:
                                work_type = 'Remoto'
                                location = []
                            elif 'híbrido' in title_lower or 'hibrido' in title_lower:
                                work_type = 'Híbrido'

                            publication_date = ''

                            job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                            jobs.append(job)
                            if on_job is not None:
                                try:
                                    await on_job(job)
                                except Exception:
                                    pass

                        except Exception:
                            continue

        except Exception:
            continue

        await asyncio.sleep(0.5)

    print(f'Foram obtidas {len(jobs)} vagas do site MichaelPage')
    return jobs


if __name__ == "__main__":
    jobs = asyncio.run(get_michaelpage_jobs())
    for job in jobs[:5]:
        print(job)

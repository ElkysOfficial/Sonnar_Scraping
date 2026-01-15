"""
Serviço de busca dedicada para clientes VIP.
Executa buscas imediatas com keywords específicas em TODAS as engines disponíveis.

DINÂMICO: Detecta automaticamente todas as engines na pasta /engines/
Basta adicionar uma nova engine seguindo o padrão e ela será incluída automaticamente.

@author Sonar Bot
"""
import asyncio
import importlib
import inspect
import os
import sys
import logging
from typing import List, Dict, Any, Callable
from pathlib import Path

logging.basicConfig(filename="vip_search.log", level=logging.INFO)

# Diretório das engines
ENGINES_DIR = Path(__file__).parent.parent / "engines"


def discover_engines() -> Dict[str, Callable]:
    """
    Descobre dinamicamente todas as engines disponíveis na pasta /engines/.

    Procura por arquivos .py que contenham funções get_*_jobs().

    Returns:
        Dict com nome da engine e função de busca
    """
    engines = {}

    # Adiciona o diretório pai ao path para imports
    parent_dir = str(Path(__file__).parent.parent.parent)
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)

    # Lista todos os arquivos .py na pasta engines
    if not ENGINES_DIR.exists():
        logging.error(f"[DISCOVERY] Pasta de engines não encontrada: {ENGINES_DIR}")
        return engines

    for file_path in ENGINES_DIR.glob("*.py"):
        if file_path.name.startswith("_"):
            continue

        engine_name = file_path.stem  # Nome sem extensão

        try:
            # Importa o módulo dinamicamente
            module_name = f"src.engines.{engine_name}"
            module = importlib.import_module(module_name)

            # Procura por funções get_*_jobs
            for name, func in inspect.getmembers(module, inspect.isfunction):
                if name.startswith("get_") and name.endswith("_jobs"):
                    engines[engine_name] = {
                        'function': func,
                        'name': engine_name.title(),
                        'module': module_name
                    }
                    logging.info(f"[DISCOVERY] Engine encontrada: {engine_name} -> {name}()")
                    break

        except Exception as e:
            logging.error(f"[DISCOVERY] Erro ao carregar engine {engine_name}: {e}")
            continue

    logging.info(f"[DISCOVERY] Total de engines descobertas: {len(engines)}")
    return engines


async def run_engine_with_keywords(engine_info: Dict, keywords: List[str]) -> List[Dict[str, Any]]:
    """
    Executa uma engine e filtra resultados por keywords.

    As engines originais usam a variável global 'stacks' do variavel.py.
    Esta função executa a engine e filtra os resultados pelas keywords do VIP.

    Args:
        engine_info: Informações da engine (function, name)
        keywords: Lista de keywords para filtrar

    Returns:
        Lista de vagas que correspondem às keywords
    """
    engine_name = engine_info['name']
    engine_func = engine_info['function']

    try:
        logging.info(f"[{engine_name.upper()}] Iniciando busca...")

        # Executa a função da engine
        if asyncio.iscoroutinefunction(engine_func):
            raw_jobs = await engine_func()
        else:
            raw_jobs = await asyncio.to_thread(engine_func)

        if not raw_jobs:
            logging.info(f"[{engine_name.upper()}] Nenhuma vaga encontrada")
            return []

        # Normaliza e filtra por keywords
        filtered_jobs = []
        keywords_lower = [k.lower() for k in keywords]

        for job in raw_jobs:
            # Normaliza o formato (lista para dict)
            if isinstance(job, (list, tuple)):
                job_dict = normalize_job_from_list(job, engine_name)
            elif isinstance(job, dict):
                job_dict = job
                job_dict['source'] = engine_name
            else:
                continue

            # Filtra por keywords no título
            title_lower = job_dict.get('job_title', '').lower()

            matched_keyword = None
            for keyword in keywords_lower:
                if keyword in title_lower:
                    matched_keyword = keyword
                    break

            # Se "todas" está nas keywords, inclui todas as vagas
            if 'todas' in keywords_lower or 'all' in keywords_lower:
                matched_keyword = 'todas'

            if matched_keyword:
                job_dict['keyword_matched'] = matched_keyword
                filtered_jobs.append(job_dict)

        logging.info(f"[{engine_name.upper()}] {len(filtered_jobs)} vagas filtradas de {len(raw_jobs)} total")
        return filtered_jobs

    except Exception as e:
        logging.error(f"[{engine_name.upper()}] Erro: {e}")
        return []


def normalize_job_from_list(job_list: list, source: str) -> Dict[str, Any]:
    """
    Normaliza dados de vaga do formato lista para dicionário.

    Formato esperado das engines:
    [link, title, company, location, work_type, hiring_regime, salary, publication_date]

    Args:
        job_list: Lista com dados da vaga
        source: Nome da fonte (engine)

    Returns:
        Dict normalizado
    """
    # Trata location que pode ser lista ou string
    location = job_list[3] if len(job_list) > 3 else ''
    if isinstance(location, list):
        location = ' - '.join(str(l) for l in location if l)

    return {
        'job_url': str(job_list[0]) if len(job_list) > 0 else '',
        'job_title': str(job_list[1]) if len(job_list) > 1 else '',
        'company': str(job_list[2]) if len(job_list) > 2 else '',
        'location': str(location),
        'work_type': str(job_list[4]) if len(job_list) > 4 else '',
        'hiring_regime': str(job_list[5]) if len(job_list) > 5 else '',
        'salary': str(job_list[6]) if len(job_list) > 6 else '',
        'publication_date': str(job_list[7]) if len(job_list) > 7 else '',
        'source': source,
        'keyword_matched': ''
    }


async def search_vip_jobs(keywords: List[str], max_results: int = 100) -> List[Dict[str, Any]]:
    """
    Executa busca em TODAS as engines disponíveis para keywords VIP.

    Descobre dinamicamente todas as engines na pasta /engines/ e executa
    buscas em paralelo, filtrando pelos keywords do cliente VIP.

    Args:
        keywords: Lista de palavras-chave para buscar
        max_results: Número máximo de resultados totais

    Returns:
        Lista de vagas encontradas de todas as fontes
    """
    logging.info(f"[VIP SEARCH] Iniciando busca dinâmica para keywords: {keywords}")

    # Descobre todas as engines disponíveis
    engines = discover_engines()

    if not engines:
        logging.error("[VIP SEARCH] Nenhuma engine encontrada!")
        return []

    logging.info(f"[VIP SEARCH] Executando busca em {len(engines)} engines: {list(engines.keys())}")

    # Cria tasks para todas as engines
    tasks = []
    engine_names = []

    for engine_name, engine_info in engines.items():
        tasks.append(run_engine_with_keywords(engine_info, keywords))
        engine_names.append(engine_name)

    # Executa todas em paralelo
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Processa resultados
    all_jobs = []
    seen_urls = set()

    for i, result in enumerate(results):
        engine_name = engine_names[i] if i < len(engine_names) else f'Engine_{i}'

        if isinstance(result, Exception):
            logging.error(f"[VIP SEARCH] Erro em {engine_name}: {result}")
            continue

        jobs_from_engine = 0
        for job in result:
            # Deduplica por URL
            job_url = job.get('job_url', '')
            if job_url and job_url not in seen_urls:
                seen_urls.add(job_url)
                all_jobs.append(job)
                jobs_from_engine += 1

        if jobs_from_engine > 0:
            logging.info(f"[VIP SEARCH] {engine_name}: {jobs_from_engine} vagas únicas")

    logging.info(f"[VIP SEARCH] Busca finalizada. Total de vagas únicas: {len(all_jobs)}")

    # Ordena por data de publicação (mais recentes primeiro)
    def get_date(job):
        date_str = job.get('publication_date', '')
        if date_str:
            return str(date_str)
        return '0000-00-00'

    all_jobs.sort(key=get_date, reverse=True)

    return all_jobs[:max_results]


def run_vip_search(keywords: List[str], max_results: int = 100) -> List[Dict[str, Any]]:
    """
    Função síncrona para executar busca VIP.
    Útil para chamadas de outros processos.
    """
    return asyncio.run(search_vip_jobs(keywords, max_results))


def list_available_engines() -> List[str]:
    """
    Lista todas as engines disponíveis.

    Returns:
        Lista com nomes das engines
    """
    engines = discover_engines()
    return list(engines.keys())


if __name__ == "__main__":
    import sys

    # Mostra engines disponíveis
    print("=" * 60)
    print("   VIP JOB SEARCH - SISTEMA DINÂMICO")
    print("=" * 60)

    engines = list_available_engines()
    print(f"\nEngines disponíveis ({len(engines)}):")
    for engine in engines:
        print(f"  - {engine}")

    print()

    # Executa busca se keywords foram passadas
    if len(sys.argv) > 1:
        keywords = sys.argv[1:]
    else:
        keywords = ["estágio", "junior"]

    print(f"Buscando vagas para: {keywords}")
    print("-" * 60)

    jobs = run_vip_search(keywords, max_results=30)

    print(f"\nEncontradas {len(jobs)} vagas únicas:")
    print("-" * 60)

    # Agrupa por fonte
    sources = {}
    for job in jobs:
        source = job.get('source', 'Desconhecido')
        if source not in sources:
            sources[source] = []
        sources[source].append(job)

    for source, source_jobs in sources.items():
        print(f"\n[{source}] - {len(source_jobs)} vagas")
        for job in source_jobs[:2]:  # Mostra 2 de cada
            print(f"  - {job['job_title']} @ {job['company']}")
            print(f"    URL: {job['job_url'][:60]}...")

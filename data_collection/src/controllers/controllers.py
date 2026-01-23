import asyncio
import logging
import os
import csv
from .job_getters import getters
from ..routes.routes import send_to_embed_service_job
from ..models.models import Job
from ..utils.google_enricher import GoogleEnricher, is_missing_field
from ..utils.jobsUtils import process_salary

# Definindo sent_jobs como uma variável global
sent_jobs = set()

logging.basicConfig(filename="errors.log", level=logging.ERROR)

def load_existing_job_links():
    existing_links = set()
    csv_path = os.path.join("src", "data", "job_vacancies.csv")
    if os.path.exists(csv_path):
        with open(csv_path, "r", newline="", encoding="latin-1") as f:
            csv_reader = csv.reader(f)
            next(csv_reader, None)  # Pula o cabeçalho se existir
            for row in csv_reader:
                if row:  # Verifica se a linha não está vazia
                    # O link está na primeira coluna
                    existing_links.add(row[0])
    return existing_links

def normalize_job_result(result):
    location = result[3] if len(result) > 3 else ''
    if isinstance(location, list):
        location = ' - '.join(str(item) for item in location if item)

    return {
        'job_url': str(result[0]) if len(result) > 0 else '',
        'job_title': str(result[1]) if len(result) > 1 else '',
        'company': str(result[2]) if len(result) > 2 else '',
        'location': str(location),
        'work_type': str(result[4]) if len(result) > 4 else '',
        'hiring_regime': str(result[5]) if len(result) > 5 else '',
        'salary': str(result[6]) if len(result) > 6 else '',
        'publication_date': str(result[7]) if len(result) > 7 else ''
    }

async def scrape_jobs(max_tasks=3):
    """
    Busca vagas de emprego de várias fontes, processa e salva os resultados de forma assíncrona.

    Esta função executa continuamente, buscando vagas de emprego de múltiplas fontes (getters)
    de forma concorrente. Ela limita o número de buscas simultâneas, processa os resultados
    imediatamente após cada busca e salva os novos jobs encontrados.

    Args:
        max_tasks (int): Número máximo de tarefas concorrentes. Padrão é 2.

    O processo inclui:
    1. Busca de vagas usando diferentes getters.
    2. Processamento e envio dos resultados para um serviço de embed.
    3. Salvamento dos novos jobs em CSV.
    4. Execução contínua com intervalos de 1 hora entre os ciclos.

    A função usa um Semaphore para limitar o número de buscas simultâneas e um conjunto
    global para rastrear os jobs já processados, evitando duplicações.
    """
    global sent_jobs
    semaphore = asyncio.Semaphore(max_tasks)

    # Inicializa sent_jobs com os links existentes
    sent_jobs = load_existing_job_links()

    async with GoogleEnricher() as enricher:
        async def process_getter(getter):
            """
            Funcao interna para processar um getter especifico.
            """
            async with semaphore:
                try:
                    print(f'Buscando em {getter.__name__.split("_")[1]}...')
                    results = await getter()  # Executa o getter para obter os resultados
                    for result in results:
                        job_data = normalize_job_result(result)
                        job_url = job_data.get('job_url')
                        if not job_url or job_url in sent_jobs:
                            continue  # Verifica se o job ja foi processado

                        try:
                            job_title = job_data.get('job_title', '')
                            job_data['salary'] = process_salary(job_data.get('salary', ''), job_title)
                            needs_location = is_missing_field(job_data.get('location'))
                            needs_salary = is_missing_field(job_data.get('salary')) or job_data.get('salary') == 'a combinar'
                            if needs_location or needs_salary:
                                job_data = await enricher.enrich_job(job_data)
                                if needs_salary and job_data.get('salary'):
                                    job_data['salary'] = process_salary(job_data.get('salary', ''), job_title, is_estimated=True)
                        except Exception as e:
                            logging.error(f"Erro ao enriquecer job: {e}")
                            logging.error(f"Detalhes do job: {job_data}")

                        job = Job(
                            job_data.get('job_url', ''),
                            job_data.get('job_title', ''),
                            job_data.get('company', ''),
                            job_data.get('location', ''),
                            job_data.get('work_type', ''),
                            job_data.get('hiring_regime', ''),
                            job_data.get('salary', ''),
                            job_data.get('publication_date', '')
                        )
                        try:
                            # Envia o job para o servico de embed
                            response = await send_to_embed_service_job(job.to_dict())
                            if response and response.get("success"):
                                # Adiciona o job ao conjunto de jobs processados
                                sent_jobs.add(job_url)
                                save_job_to_csv(job)  # Salva o job no CSV
                            else:
                                print(f"Falha ao enviar job: {job.job_title}")
                        except Exception as e:
                            logging.error(f"Erro ao enviar job para o servico de embed: {e}")
                            logging.error(f"Detalhes do job: {job.to_dict()}")
                except Exception as e:
                    logging.error(f"Erro ao executar {getter.__name__.split('_')[1]}: {e}")

        while True:
            # Cria uma tarefa assincrona para cada getter
            tasks = [asyncio.create_task(process_getter(getter))for getter in getters]

            try:
                # Aguarda a conclusao de todas as tarefas
                await asyncio.gather(*tasks)
            except Exception as e:
                logging.error(f"Erro geral durante a execucao das tarefas: {e}")

            await asyncio.sleep(5 * 1)  # Pausa de 1 hora antes do proximo ciclo


def save_job_to_csv(job):
    """Salva os dados da vaga em um arquivo CSV."""
    data_dir = os.path.join('src', 'data')
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)

    with open(os.path.join(data_dir, 'job_vacancies.csv'), 'a+', newline='', encoding='latin-1') as f:
        csv_writer = csv.writer(f)
        # Usa o método to_dict() para obter os dados da vaga
        csv_writer.writerow(job.to_dict().values())

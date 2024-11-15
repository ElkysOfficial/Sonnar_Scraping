import asyncio
import logging
import os
import csv
from .job_getters import getters
from ..routes.routes import send_to_embed_service_job
from ..models.models import Job

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

    async def process_getter(getter):
        """
        Função interna para processar um getter específico.
        """
        async with semaphore:
            try:
                print(f'Buscando em {getter.__name__.split("_")[1]}...')
                results = await getter()  # Executa o getter para obter os resultados
                for result in results:
                    if (result[0] not in sent_jobs):  # Verifica se o job já foi processado
                        job = Job(*result)
                        try:
                            # Envia o job para o serviço de embed
                            response = await send_to_embed_service_job(job.to_dict())
                            if response and response.get("success"):
                                # Adiciona o job ao conjunto de jobs processados
                                sent_jobs.add(result[0])
                                save_job_to_csv(job)  # Salva o job no CSV
                            else:
                                print(f"Falha ao enviar job: {job.job_title}")
                        except Exception as e:
                            logging.error(f"Erro ao enviar job para o serviço de embed: {e}")
                            logging.error(f"Detalhes do job: {job.to_dict()}")
            except Exception as e:
                logging.error(f"Erro ao executar {getter.__name__.split('_')[1]}: {e}")

    while True:
        # Cria uma tarefa assíncrona para cada getter
        tasks = [asyncio.create_task(process_getter(getter))for getter in getters]

        try:
            # Aguarda a conclusão de todas as tarefas
            await asyncio.gather(*tasks)
        except Exception as e:
            logging.error(f"Erro geral durante a execução das tarefas: {e}")

        await asyncio.sleep(5 * 1)  # Pausa de 1 hora antes do próximo ciclo

def save_job_to_csv(job):
    """Salva os dados da vaga em um arquivo CSV."""
    data_dir = os.path.join('src', 'data')
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)

    with open(os.path.join(data_dir, 'job_vacancies.csv'), 'a+', newline='', encoding='latin-1') as f:
        csv_writer = csv.writer(f)
        # Usa o método to_dict() para obter os dados da vaga
        csv_writer.writerow(job.to_dict().values())

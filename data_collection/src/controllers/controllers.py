import asyncio
import logging
import os
import csv
from .job_getters import getters
from ..routes.routes import send_to_embed_service_job
from ..models.models import Job
from ..utils.google_enricher import GoogleEnricher, is_missing_field
from ..utils.jobsUtils import process_salary
from ..persistence.jobs_repository import JobsRepository

# URLs ja processados nesta execucao (memoria) — espelho do JSON local
sent_jobs = set()

logging.basicConfig(filename="errors.log", level=logging.ERROR)


def _engine_name(getter) -> str:
    """get_linkedin_jobs -> 'linkedin'."""
    parts = getter.__name__.split('_')
    return parts[1] if len(parts) > 1 else getter.__name__


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
    Busca vagas em fontes multiplas, normaliza, enriquece e persiste em:
      1. JSON local (src/data/jobs.json) — fonte para envio de mensagens
      2. Supabase public.jobs           — alimenta agregados da landing-page
      3. Servico de embed (Discord)     — best effort
      4. CSV legado                     — backwards compat

    Limita concorrencia via Semaphore. Loop continuo com sleep entre ciclos.
    """
    global sent_jobs
    semaphore = asyncio.Semaphore(max_tasks)

    async with JobsRepository() as repo, GoogleEnricher() as enricher:
        # Inicializa o set de dedup com o que ja existe no JSON local
        sent_jobs = repo.known_urls()

        async def process_getter(getter):
            engine = _engine_name(getter)
            async with semaphore:
                try:
                    print(f'Buscando em {engine}...')
                    results = await getter()
                    for result in results:
                        job_data = normalize_job_result(result)
                        job_url = job_data.get('job_url')
                        if not job_url or job_url in sent_jobs:
                            continue

                        try:
                            job_title = job_data.get('job_title', '')
                            job_data['salary'] = process_salary(job_data.get('salary', ''), job_title)
                            needs_location = is_missing_field(job_data.get('location'))
                            needs_salary = is_missing_field(job_data.get('salary'))
                            if needs_location or needs_salary:
                                job_data = await enricher.enrich_job(job_data)
                                if needs_salary and job_data.get('salary'):
                                    job_data['salary'] = process_salary(
                                        job_data.get('salary', ''), job_title, is_estimated=True
                                    )
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

                        # 1+2) Persistencia (JSON local + Supabase)
                        try:
                            persisted = await repo.save(job_data, source=engine)
                        except Exception as e:
                            logging.error(f"Erro ao persistir job: {e}")
                            logging.error(f"Detalhes do job: {job.to_dict()}")
                            persisted = False

                        if not persisted:
                            continue

                        sent_jobs.add(job_url)
                        save_job_to_csv(job)  # 4) CSV legado

                        # 3) Embed Discord — best effort, nao bloqueia o fluxo
                        try:
                            response = await send_to_embed_service_job(job.to_dict())
                            if not (response and response.get("success")):
                                logging.warning(f"Embed service nao confirmou: {job.job_title}")
                        except Exception as e:
                            logging.error(f"Erro ao enviar job para o servico de embed: {e}")

                except Exception as e:
                    logging.error(f"Erro ao executar {engine}: {e}")

        while True:
            tasks = [asyncio.create_task(process_getter(getter)) for getter in getters]
            try:
                await asyncio.gather(*tasks)
            except Exception as e:
                logging.error(f"Erro geral durante a execucao das tarefas: {e}")

            await asyncio.sleep(5 * 1)


def save_job_to_csv(job):
    """Backup CSV legado. Mantido para nao quebrar consumidores externos."""
    data_dir = os.path.join('src', 'data')
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)

    with open(os.path.join(data_dir, 'job_vacancies.csv'), 'a+', newline='', encoding='latin-1') as f:
        csv_writer = csv.writer(f)
        csv_writer.writerow(job.to_dict().values())


def load_existing_job_links():
    """Mantido para compatibilidade externa. O scrape_jobs agora dedupa via JobsRepository."""
    existing_links = set()
    csv_path = os.path.join("src", "data", "job_vacancies.csv")
    if os.path.exists(csv_path):
        with open(csv_path, "r", newline="", encoding="latin-1") as f:
            csv_reader = csv.reader(f)
            next(csv_reader, None)
            for row in csv_reader:
                if row:
                    existing_links.add(row[0])
    return existing_links

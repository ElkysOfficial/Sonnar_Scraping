import asyncio
import logging
import time
from .job_getters import getters
from ..routes.routes import send_jobs_batch, get_existing_job_urls, record_scraper_stats
from ..models.models import Job
from ..utils.google_enricher import GoogleEnricher, is_missing_field
from ..utils.jobsUtils import process_salary

# Global set to track processed jobs (loaded from database at startup)
sent_jobs = set()

# Configuração de batch
BATCH_SIZE = 500  # Jobs por batch
BATCH_FLUSH_INTERVAL = 30  # Segundos para forçar flush

logging.basicConfig(filename="errors.log", level=logging.ERROR, encoding="utf-8")


def normalize_job_result(result):
    """Normalize job result from scraper to standard format."""
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


def get_source_name(getter) -> str:
    """Extract source name from getter function name."""
    try:
        name = getter.__name__
        # getter functions are named like "getter_indeed", "getter_linkedin"
        if name.startswith("getter_"):
            return name.replace("getter_", "")
        return name
    except Exception:
        return "unknown"


class JobBatchBuffer:
    """
    Buffer para acumular jobs antes de enviar em batch.
    Reduz número de requests de 112k para ~224 (500 jobs/request).
    """

    def __init__(self, batch_size=BATCH_SIZE, flush_interval=BATCH_FLUSH_INTERVAL):
        self.buffer = []
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.last_flush = time.time()
        self.lock = asyncio.Lock()
        self.stats = {
            "total_jobs": 0,
            "batches_sent": 0,
            "jobs_saved": 0,
            "errors": 0
        }

    async def add(self, job_data: dict, source: str):
        """Adiciona job ao buffer. Faz flush se atingir o tamanho do batch."""
        async with self.lock:
            job_data["source"] = source
            self.buffer.append(job_data)
            self.stats["total_jobs"] += 1

            # Flush se atingir tamanho do batch
            if len(self.buffer) >= self.batch_size:
                await self._flush_locked()

    async def flush(self):
        """Força flush do buffer."""
        async with self.lock:
            await self._flush_locked()

    async def _flush_locked(self):
        """Flush interno (deve ser chamado com lock)."""
        if not self.buffer:
            return

        jobs_to_send = self.buffer.copy()
        self.buffer = []
        self.last_flush = time.time()

        try:
            result = await send_jobs_batch(jobs_to_send)
            if result and result.get("success"):
                self.stats["batches_sent"] += 1
                self.stats["jobs_saved"] += result.get("count", 0)
                print(f"[batch] Enviados {len(jobs_to_send)} jobs em batch (total: {self.stats['jobs_saved']})")
            else:
                self.stats["errors"] += 1
                logging.error(f"Erro no batch: {result}")
        except Exception as e:
            self.stats["errors"] += 1
            logging.error(f"Erro ao enviar batch: {e}")

    async def should_flush(self):
        """Verifica se deve fazer flush por tempo."""
        return (time.time() - self.last_flush) > self.flush_interval and len(self.buffer) > 0

    def get_stats(self):
        return self.stats.copy()


# Buffer global de jobs
job_buffer = JobBatchBuffer()


async def scrape_jobs(max_tasks=3):
    """
    Fetch job vacancies from multiple sources, process and save results asynchronously.
    OTIMIZADO: Usa batch insert para reduzir requests de 112k para ~224.

    This function runs continuously, fetching job vacancies from multiple sources (getters)
    concurrently. It limits the number of simultaneous fetches, processes results
    immediately after each fetch, and saves new jobs to the database IN BATCHES.

    Args:
        max_tasks (int): Maximum number of concurrent tasks. Default is 3.

    The process includes:
    1. Fetching vacancies using different getters
    2. Processing and accumulating results in a buffer
    3. Sending jobs in batches of 500 to reduce egress
    4. Continuous execution with 5-second intervals between cycles
    5. Recording scraper statistics for monitoring

    Uses a Semaphore to limit concurrent fetches and a global set
    to track already processed jobs, avoiding duplications.
    """
    global sent_jobs, job_buffer
    semaphore = asyncio.Semaphore(max_tasks)

    # Load existing job URLs from database
    print("[scraper] Loading existing job URLs from database...")
    sent_jobs = get_existing_job_urls()
    print(f"[scraper] Loaded {len(sent_jobs)} existing jobs")
    print(f"[scraper] Batch mode: {BATCH_SIZE} jobs/batch, flush every {BATCH_FLUSH_INTERVAL}s")

    async with GoogleEnricher() as enricher:
        async def process_getter(getter):
            """Internal function to process a specific getter."""
            source_name = get_source_name(getter)
            start_time = time.time()
            stats = {
                "jobs_found": 0,
                "jobs_new": 0,
                "jobs_enriched": 0,
                "errors": 0,
            }

            async with semaphore:
                try:
                    print(f'[{source_name}] Searching...')
                    results = await getter()
                    stats["jobs_found"] = len(results) if results else 0

                    jobs_to_add = []

                    for result in results:
                        job_data = normalize_job_result(result)
                        job_url = job_data.get('job_url')

                        # Deduplicação local (evita enviar duplicados)
                        if not job_url or job_url in sent_jobs:
                            continue

                        try:
                            job_title = job_data.get('job_title', '')
                            raw_salary = job_data.get('salary', '')
                            needs_salary = is_missing_field(raw_salary)
                            job_data['salary'] = process_salary(raw_salary, job_title)
                            needs_location = is_missing_field(job_data.get('location'))

                            if needs_location or needs_salary:
                                job_data = await enricher.enrich_job(job_data)
                                stats["jobs_enriched"] += 1
                                if needs_salary and job_data.get('salary'):
                                    job_data['salary'] = process_salary(
                                        job_data.get('salary', ''),
                                        job_title,
                                        is_estimated=True
                                    )
                        except Exception as e:
                            logging.error(f"Error enriching job: {e}")
                            logging.error(f"Job details: {job_data}")
                            stats["errors"] += 1

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

                        # Adiciona ao buffer (sem esperar pelo envio)
                        jobs_to_add.append((job.to_dict(), source_name, job_url))

                    # Adiciona todos os jobs ao buffer de uma vez
                    for job_dict, source, job_url in jobs_to_add:
                        await job_buffer.add(job_dict, source)
                        sent_jobs.add(job_url)
                        stats["jobs_new"] += 1

                except Exception as e:
                    logging.error(f"Error executing {source_name}: {e}")
                    stats["errors"] += 1

                # Record scraper statistics
                duration_ms = int((time.time() - start_time) * 1000)
                try:
                    await record_scraper_stats(
                        source=source_name,
                        jobs_found=stats["jobs_found"],
                        jobs_new=stats["jobs_new"],
                        jobs_enriched=stats["jobs_enriched"],
                        errors=stats["errors"],
                        duration_ms=duration_ms,
                    )
                except Exception as e:
                    logging.error(f"Error recording stats for {source_name}: {e}")

                if stats["jobs_new"] > 0:
                    print(f"[{source_name}] Found {stats['jobs_found']} jobs, {stats['jobs_new']} new (buffered)")

        while True:
            # Create an async task for each getter
            tasks = [asyncio.create_task(process_getter(getter)) for getter in getters]

            try:
                # Wait for all tasks to complete
                await asyncio.gather(*tasks)
            except Exception as e:
                logging.error(f"General error during task execution: {e}")

            # Flush buffer se necessário (por tempo)
            if await job_buffer.should_flush():
                await job_buffer.flush()

            # Print batch stats periodically
            buffer_stats = job_buffer.get_stats()
            if buffer_stats["batches_sent"] > 0:
                print(f"[batch] Stats: {buffer_stats['jobs_saved']} jobs salvos em {buffer_stats['batches_sent']} batches")

            # Pause before next cycle
            await asyncio.sleep(5)

import asyncio
import logging
import time
from .job_getters import getters
from ..routes.routes import send_to_embed_service_job, get_existing_job_urls, record_scraper_stats
from ..models.models import Job
from ..utils.google_enricher import GoogleEnricher, is_missing_field
from ..utils.jobsUtils import process_salary

# Global set to track processed jobs (loaded from database at startup)
sent_jobs = set()

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


async def scrape_jobs(max_tasks=3):
    """
    Fetch job vacancies from multiple sources, process and save results asynchronously.

    This function runs continuously, fetching job vacancies from multiple sources (getters)
    concurrently. It limits the number of simultaneous fetches, processes results
    immediately after each fetch, and saves new jobs to the database.

    Args:
        max_tasks (int): Maximum number of concurrent tasks. Default is 3.

    The process includes:
    1. Fetching vacancies using different getters
    2. Processing and sending results directly to Supabase database
    3. Continuous execution with 5-second intervals between cycles
    4. Recording scraper statistics for monitoring

    Uses a Semaphore to limit concurrent fetches and a global set
    to track already processed jobs, avoiding duplications.
    """
    global sent_jobs
    semaphore = asyncio.Semaphore(max_tasks)

    # Load existing job URLs from database
    print("[scraper] Loading existing job URLs from database...")
    sent_jobs = get_existing_job_urls()
    print(f"[scraper] Loaded {len(sent_jobs)} existing jobs")

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

                    for result in results:
                        job_data = normalize_job_result(result)
                        job_url = job_data.get('job_url')

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

                        try:
                            # Send job directly to database
                            response = await send_to_embed_service_job(
                                job.to_dict(),
                                source=source_name
                            )

                            if response and response.get("success"):
                                sent_jobs.add(job_url)
                                stats["jobs_new"] += 1
                            else:
                                print(f"[{source_name}] Failed to save job: {job.job_title}")
                                stats["errors"] += 1
                        except Exception as e:
                            logging.error(f"Error saving job to database: {e}")
                            logging.error(f"Job details: {job.to_dict()}")
                            stats["errors"] += 1

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
                    print(f"[{source_name}] Found {stats['jobs_found']} jobs, {stats['jobs_new']} new")

        while True:
            # Create an async task for each getter
            tasks = [asyncio.create_task(process_getter(getter)) for getter in getters]

            try:
                # Wait for all tasks to complete
                await asyncio.gather(*tasks)
            except Exception as e:
                logging.error(f"General error during task execution: {e}")

            # Pause before next cycle
            await asyncio.sleep(5)

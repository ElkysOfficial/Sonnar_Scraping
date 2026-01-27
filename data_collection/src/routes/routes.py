"""
Routes module for data_collection service.
Sends job data directly to Supabase database.
"""

import os
import sys
from datetime import datetime

# Add database lib to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "database", "lib"))

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Supabase client
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("[routes] WARNING: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    print("[routes] Job data will NOT be persisted!")
    supabase = None
else:
    from supabase import create_client
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


async def send_to_embed_service_job(job_data: dict, source: str = "unknown") -> dict:
    """
    Send job data directly to Supabase database.

    Args:
        job_data: Dictionary with job information
        source: Name of the scraper/engine that collected this job

    Returns:
        Dictionary with success status and job data
    """
    if not supabase:
        print("[routes] Supabase not configured, skipping job persistence")
        return {"success": False, "message": "Supabase not configured"}

    try:
        # Prepare job data for database
        db_job = {
            "job_title": job_data.get("job_title", ""),
            "job_url": job_data.get("job_url", ""),
            "company": job_data.get("company", ""),
            "location": job_data.get("location", ""),
            "work_type": job_data.get("work_type", ""),
            "hiring_regime": job_data.get("hiring_regime", ""),
            "salary": job_data.get("salary", ""),
            "publication_date": job_data.get("publication_date", ""),
            "source": source,
            "status_discord": False,
            "status_whatsapp": False,
            "status_telegram": False,
        }

        # Upsert job (insert or update if job_url already exists)
        result = (
            supabase.table("jobs")
            .upsert(db_job, on_conflict="job_url")
            .execute()
        )

        if result.data:
            job = result.data[0]
            return {
                "success": True,
                "job": {
                    "id": job.get("id"),
                    "statuses": {
                        "discord": job.get("status_discord", False),
                        "whatsapp": job.get("status_whatsapp", False),
                        "telegram": job.get("status_telegram", False),
                    }
                }
            }
        else:
            return {"success": False, "message": "No data returned from upsert"}

    except Exception as e:
        print(f"[routes] Error saving job to Supabase: {e}")
        return {"success": False, "message": str(e)}


async def check_job_exists(job_url: str) -> bool:
    """
    Check if a job URL already exists in the database.

    Args:
        job_url: The URL to check

    Returns:
        True if the job exists, False otherwise
    """
    if not supabase:
        return False

    try:
        result = (
            supabase.table("jobs")
            .select("id")
            .eq("job_url", job_url)
            .maybe_single()
            .execute()
        )
        return result.data is not None
    except Exception as e:
        print(f"[routes] Error checking job existence: {e}")
        return False


def get_existing_job_urls() -> set:
    """
    Get all existing job URLs from the database.
    Used for initial deduplication at startup.

    Returns:
        Set of job URLs that already exist in the database
    """
    if not supabase:
        return set()

    try:
        # Fetch all job URLs (paginated if needed)
        all_urls = set()
        page_size = 1000
        offset = 0

        while True:
            result = (
                supabase.table("jobs")
                .select("job_url")
                .range(offset, offset + page_size - 1)
                .execute()
            )

            if not result.data:
                break

            for job in result.data:
                all_urls.add(job["job_url"])

            if len(result.data) < page_size:
                break

            offset += page_size

        print(f"[routes] Loaded {len(all_urls)} existing job URLs from database")
        return all_urls

    except Exception as e:
        print(f"[routes] Error loading existing job URLs: {e}")
        return set()


async def record_scraper_stats(
    source: str,
    jobs_found: int = 0,
    jobs_new: int = 0,
    jobs_enriched: int = 0,
    errors: int = 0,
    duration_ms: int = None,
) -> bool:
    """
    Record scraper statistics for monitoring and analytics.

    Args:
        source: Name of the scraper/engine
        jobs_found: Total jobs found in this run
        jobs_new: New jobs added (not duplicates)
        jobs_enriched: Jobs that needed enrichment
        errors: Number of errors during scraping
        duration_ms: Time taken in milliseconds

    Returns:
        True if stats were recorded successfully
    """
    if not supabase:
        return False

    try:
        supabase.table("scraper_stats").insert({
            "source": source,
            "jobs_found": jobs_found,
            "jobs_new": jobs_new,
            "jobs_enriched": jobs_enriched,
            "errors": errors,
            "duration_ms": duration_ms,
        }).execute()
        return True
    except Exception as e:
        print(f"[routes] Error recording scraper stats: {e}")
        return False

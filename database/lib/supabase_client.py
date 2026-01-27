"""
Supabase Client Library for Python
Centralized database access for data_collection service
"""

import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# =====================================================
# JOBS
# =====================================================

def upsert_job(job: Dict[str, Any]) -> Dict[str, Any]:
    """Insert or update a job (upsert by job_url)"""
    data = {
        "job_title": job.get("job_title", ""),
        "job_url": job.get("job_url", ""),
        "company": job.get("company", ""),
        "location": job.get("location", ""),
        "work_type": job.get("work_type", ""),
        "hiring_regime": job.get("hiring_regime", ""),
        "salary": job.get("salary", ""),
        "publication_date": job.get("publication_date", ""),
        "source": job.get("source", ""),
        "status_discord": job.get("status_discord", False),
        "status_whatsapp": job.get("status_whatsapp", False),
        "status_telegram": job.get("status_telegram", False),
    }

    if "id" in job:
        data["id"] = job["id"]

    result = supabase.table("jobs").upsert(data, on_conflict="job_url").execute()
    return result.data[0] if result.data else None


def get_all_jobs() -> List[Dict[str, Any]]:
    """Get all jobs"""
    result = supabase.table("jobs").select("*").order("created_at", desc=True).execute()
    return result.data


def get_pending_jobs(channel: str) -> List[Dict[str, Any]]:
    """Get pending jobs for a specific channel"""
    status_column = f"status_{channel}"
    result = (
        supabase.table("jobs")
        .select("*")
        .eq(status_column, False)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def get_job_by_id(job_id: str) -> Optional[Dict[str, Any]]:
    """Get a job by ID"""
    result = supabase.table("jobs").select("*").eq("id", job_id).single().execute()
    return result.data


def get_job_by_url(url: str) -> Optional[Dict[str, Any]]:
    """Get a job by URL"""
    result = supabase.table("jobs").select("*").eq("job_url", url).maybe_single().execute()
    return result.data


def update_job_status(job_id: str, channel: str, status: bool) -> Dict[str, Any]:
    """Update job channel status"""
    status_column = f"status_{channel}"
    result = (
        supabase.table("jobs")
        .update({status_column: status})
        .eq("id", job_id)
        .execute()
    )
    return result.data[0] if result.data else None


def job_url_exists(url: str) -> bool:
    """Check if a job URL already exists"""
    result = supabase.table("jobs").select("id").eq("job_url", url).maybe_single().execute()
    return result.data is not None


def bulk_upsert_jobs(jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Bulk insert or update jobs"""
    data = []
    for job in jobs:
        item = {
            "job_title": job.get("job_title", ""),
            "job_url": job.get("job_url", ""),
            "company": job.get("company", ""),
            "location": job.get("location", ""),
            "work_type": job.get("work_type", ""),
            "hiring_regime": job.get("hiring_regime", ""),
            "salary": job.get("salary", ""),
            "publication_date": job.get("publication_date", ""),
            "source": job.get("source", ""),
            "status_discord": job.get("status_discord", False),
            "status_whatsapp": job.get("status_whatsapp", False),
            "status_telegram": job.get("status_telegram", False),
        }
        if "id" in job:
            item["id"] = job["id"]
        data.append(item)

    result = supabase.table("jobs").upsert(data, on_conflict="job_url").execute()
    return result.data


# =====================================================
# ENRICHMENT CACHE
# =====================================================

def get_cached_enrichment(cache_type: str, cache_key: str) -> Optional[str]:
    """Get cached enrichment value"""
    result = (
        supabase.table("enrichment_cache")
        .select("cache_value, expires_at")
        .eq("cache_type", cache_type)
        .eq("cache_key", cache_key)
        .maybe_single()
        .execute()
    )

    if not result.data:
        return None

    # Check if expired
    expires_at = datetime.fromisoformat(result.data["expires_at"].replace("Z", "+00:00"))
    if expires_at < datetime.now(expires_at.tzinfo):
        return None

    return result.data["cache_value"]


def set_cached_enrichment(
    cache_type: str, cache_key: str, cache_value: str, expires_in_days: int = 30
) -> Dict[str, Any]:
    """Set cached enrichment value"""
    expires_at = datetime.utcnow() + timedelta(days=expires_in_days)

    result = (
        supabase.table("enrichment_cache")
        .upsert(
            {
                "cache_type": cache_type,
                "cache_key": cache_key,
                "cache_value": cache_value,
                "expires_at": expires_at.isoformat(),
            },
            on_conflict="cache_type,cache_key",
        )
        .execute()
    )
    return result.data[0] if result.data else None


def get_company_location(company: str) -> Optional[str]:
    """Get cached company location"""
    normalized_key = company.lower().strip()
    return get_cached_enrichment("company_location", normalized_key)


def set_company_location(company: str, location: str) -> Dict[str, Any]:
    """Set cached company location"""
    normalized_key = company.lower().strip()
    return set_cached_enrichment("company_location", normalized_key, location)


def get_salary_estimate(company: str, role: str) -> Optional[str]:
    """Get cached salary estimate"""
    normalized_key = f"{company.lower().strip()}|{role.lower().strip()}"
    return get_cached_enrichment("salary_estimate", normalized_key)


def set_salary_estimate(company: str, role: str, salary: str) -> Dict[str, Any]:
    """Set cached salary estimate"""
    normalized_key = f"{company.lower().strip()}|{role.lower().strip()}"
    return set_cached_enrichment("salary_estimate", normalized_key, salary)


# =====================================================
# SCRAPER STATS
# =====================================================

def record_scraper_stats(
    source: str,
    jobs_found: int = 0,
    jobs_new: int = 0,
    jobs_enriched: int = 0,
    errors: int = 0,
    duration_ms: int = None,
) -> Dict[str, Any]:
    """Record scraper statistics"""
    result = (
        supabase.table("scraper_stats")
        .insert(
            {
                "source": source,
                "jobs_found": jobs_found,
                "jobs_new": jobs_new,
                "jobs_enriched": jobs_enriched,
                "errors": errors,
                "duration_ms": duration_ms,
            }
        )
        .execute()
    )
    return result.data[0] if result.data else None


def get_scraper_stats_summary(hours: int = 24) -> Dict[str, Dict[str, int]]:
    """Get scraper stats summary for the last N hours"""
    since = datetime.utcnow() - timedelta(hours=hours)

    result = (
        supabase.table("scraper_stats")
        .select("source, jobs_found, jobs_new, errors")
        .gte("scraped_at", since.isoformat())
        .execute()
    )

    # Aggregate by source
    summary = {}
    for stat in result.data:
        source = stat["source"]
        if source not in summary:
            summary[source] = {"jobs_found": 0, "jobs_new": 0, "errors": 0, "runs": 0}
        summary[source]["jobs_found"] += stat["jobs_found"]
        summary[source]["jobs_new"] += stat["jobs_new"]
        summary[source]["errors"] += stat["errors"]
        summary[source]["runs"] += 1

    return summary


# =====================================================
# VIP SUBSCRIBERS (for data_collection filtering)
# =====================================================

def get_active_vip_subscribers() -> List[Dict[str, Any]]:
    """Get all active VIP subscribers"""
    result = supabase.table("vip_subscribers").select("*").eq("active", True).execute()
    return result.data


def get_vip_subscriber_by_lid(lid: str) -> Optional[Dict[str, Any]]:
    """Get VIP subscriber by LID"""
    result = (
        supabase.table("vip_subscribers")
        .select("*")
        .eq("lid", lid)
        .maybe_single()
        .execute()
    )
    return result.data


# =====================================================
# VIP DELIVERY HISTORY
# =====================================================

def record_vip_delivery(subscriber_id: str, job_id: str) -> Dict[str, Any]:
    """Record job delivery to VIP subscriber"""
    result = (
        supabase.table("vip_delivery_history")
        .upsert(
            {"vip_subscriber_id": subscriber_id, "job_id": job_id},
            on_conflict="vip_subscriber_id,job_id",
        )
        .execute()
    )
    return result.data[0] if result.data else None


def was_job_sent_to_vip(subscriber_id: str, job_id: str) -> bool:
    """Check if job was sent to VIP subscriber"""
    result = (
        supabase.table("vip_delivery_history")
        .select("id")
        .eq("vip_subscriber_id", subscriber_id)
        .eq("job_id", job_id)
        .maybe_single()
        .execute()
    )
    return result.data is not None


def get_vip_sent_job_ids(subscriber_id: str) -> List[str]:
    """Get sent job IDs for a VIP subscriber"""
    result = (
        supabase.table("vip_delivery_history")
        .select("job_id")
        .eq("vip_subscriber_id", subscriber_id)
        .execute()
    )
    return [d["job_id"] for d in result.data]


# =====================================================
# UTILITY FUNCTIONS
# =====================================================

def get_existing_job_urls() -> set:
    """Get all existing job URLs (for deduplication at startup)"""
    result = supabase.table("jobs").select("job_url").execute()
    return {job["job_url"] for job in result.data}


def run_cleanup() -> List[Dict[str, Any]]:
    """Run cleanup with policies (calls database function)"""
    result = supabase.rpc("run_cleanup_with_policies").execute()
    return result.data

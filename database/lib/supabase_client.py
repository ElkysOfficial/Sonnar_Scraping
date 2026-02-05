"""
Supabase Client Library for Python
Centralized database access for data_collection service
OTIMIZADO: Redução de egress com campos específicos e batch operations
"""

import os
import logging
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

logger = logging.getLogger(__name__)

# =====================================================
# CAMPOS ESPECÍFICOS (evita SELECT *)
# =====================================================

JOB_SELECT_FIELDS = "id, job_title, job_url, company, location, work_type, hiring_regime, salary, publication_date, source, created_at, status_discord, status_whatsapp, status_telegram"
JOB_LIST_FIELDS = "id, job_title, company, location, work_type, created_at"
JOB_MINIMAL_FIELDS = "id, job_url, created_at"
VIP_SUBSCRIBER_FIELDS = "id, user_name, lid, phone, stacks, filters, active"
VIP_DELIVERY_FIELDS = "id, vip_subscriber_id, job_id, sent_at"

# =====================================================
# CONFIGURAÇÃO DE BATCH
# =====================================================

BATCH_SIZE = int(os.getenv("SUPABASE_BATCH_SIZE", "500"))
MAX_BATCH_SIZE = 1000

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


def get_all_jobs(limit: int = 100) -> List[Dict[str, Any]]:
    """Get all jobs - OTIMIZADO com campos específicos e limite"""
    result = (
        supabase.table("jobs")
        .select(JOB_SELECT_FIELDS)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


def get_jobs_list(limit: int = 100) -> List[Dict[str, Any]]:
    """Get jobs list with minimal fields (para listagem)"""
    result = (
        supabase.table("jobs")
        .select(JOB_LIST_FIELDS)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


def get_pending_jobs(channel: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Get pending jobs for a specific channel - OTIMIZADO"""
    status_column = f"status_{channel}"
    result = (
        supabase.table("jobs")
        .select(JOB_SELECT_FIELDS)
        .eq(status_column, False)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


def get_job_by_id(job_id: str) -> Optional[Dict[str, Any]]:
    """Get a job by ID"""
    result = (
        supabase.table("jobs")
        .select(JOB_SELECT_FIELDS)
        .eq("id", job_id)
        .single()
        .execute()
    )
    return result.data


def get_job_by_url(url: str) -> Optional[Dict[str, Any]]:
    """Get a job by URL - OTIMIZADO com campos mínimos"""
    result = (
        supabase.table("jobs")
        .select(JOB_MINIMAL_FIELDS)
        .eq("job_url", url)
        .maybe_single()
        .execute()
    )
    return result.data


def update_job_status(job_id: str, channel: str, status: bool) -> Dict[str, Any]:
    """Update job channel status - COM WHERE obrigatório"""
    if not job_id:
        raise ValueError("job_id é obrigatório para update")

    status_column = f"status_{channel}"
    result = (
        supabase.table("jobs")
        .update({status_column: status})
        .eq("id", job_id)
        .execute()
    )
    return result.data[0] if result.data else None


def job_url_exists(url: str) -> bool:
    """Check if a job URL already exists - OTIMIZADO (só retorna id)"""
    result = (
        supabase.table("jobs")
        .select("id")
        .eq("job_url", url)
        .maybe_single()
        .execute()
    )
    return result.data is not None


def bulk_upsert_jobs(jobs: List[Dict[str, Any]], batch_size: int = None) -> List[Dict[str, Any]]:
    """
    Bulk insert or update jobs - OTIMIZADO
    Processa em batches de até 500 jobs por request
    """
    if not jobs:
        return []

    batch_size = min(batch_size or BATCH_SIZE, MAX_BATCH_SIZE)
    all_results = []

    # Processa em batches
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i:i + batch_size]

        data = []
        for job in batch:
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

        try:
            result = supabase.table("jobs").upsert(data, on_conflict="job_url").execute()
            if result.data:
                all_results.extend(result.data)
            logger.info(f"Batch upsert: {len(batch)} jobs processados")
        except Exception as e:
            logger.error(f"Erro no batch upsert: {e}")
            raise

    return all_results


# =====================================================
# DELTA FETCH (para senders)
# =====================================================

def get_jobs_delta(since_created_at: str = None, limit: int = 100) -> List[Dict[str, Any]]:
    """
    Get jobs delta (novos desde timestamp)
    Para uso com sender_state
    """
    query = (
        supabase.table("jobs")
        .select(JOB_SELECT_FIELDS)
        .order("created_at", desc=False)  # ASC para processar em ordem
        .limit(limit)
    )

    if since_created_at:
        query = query.gt("created_at", since_created_at)

    result = query.execute()
    return result.data


def get_sender_state(sender_type: str) -> Optional[Dict[str, Any]]:
    """Get sender state for delta fetch"""
    result = (
        supabase.table("sender_state")
        .select("id, sender_type, last_sent_at, last_processed_created_at, last_processed_job_id, jobs_processed_count")
        .eq("sender_type", sender_type)
        .maybe_single()
        .execute()
    )
    return result.data


def update_sender_state(
    sender_type: str,
    last_job_id: str = None,
    last_created_at: str = None,
    jobs_count: int = 0
) -> Dict[str, Any]:
    """Update sender state after processing delta"""
    data = {
        "sender_type": sender_type,
        "last_sent_at": datetime.utcnow().isoformat(),
    }

    if last_job_id:
        data["last_processed_job_id"] = last_job_id
    if last_created_at:
        data["last_processed_created_at"] = last_created_at
    if jobs_count:
        data["jobs_processed_count"] = jobs_count

    result = (
        supabase.table("sender_state")
        .upsert(data, on_conflict="sender_type")
        .execute()
    )
    return result.data[0] if result.data else None


# =====================================================
# KEYSET PAGINATION
# =====================================================

def get_jobs_page(
    cursor_created_at: str = None,
    cursor_id: str = None,
    limit: int = 50,
    status_filter: str = None
) -> Dict[str, Any]:
    """
    Get jobs using keyset pagination
    Retorna { data: [], next_cursor: { created_at, id } | None }
    """
    query = (
        supabase.table("jobs")
        .select(JOB_LIST_FIELDS)
        .order("created_at", desc=True)
        .order("id", desc=True)
        .limit(limit + 1)
    )

    # Keyset pagination
    if cursor_created_at and cursor_id:
        query = query.or_(f"created_at.lt.{cursor_created_at},and(created_at.eq.{cursor_created_at},id.lt.{cursor_id})")

    # Status filter
    if status_filter == "pending_whatsapp":
        query = query.eq("status_whatsapp", False)
    elif status_filter == "pending_discord":
        query = query.eq("status_discord", False)
    elif status_filter == "pending_telegram":
        query = query.eq("status_telegram", False)

    result = query.execute()
    data = result.data

    has_more = len(data) > limit
    page_data = data[:limit] if has_more else data

    next_cursor = None
    if has_more and page_data:
        last_item = page_data[-1]
        next_cursor = {
            "created_at": last_item["created_at"],
            "id": last_item["id"]
        }

    return {"data": page_data, "next_cursor": next_cursor}


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
    """Get all active VIP subscribers - OTIMIZADO"""
    result = (
        supabase.table("vip_subscribers")
        .select(VIP_SUBSCRIBER_FIELDS)
        .eq("active", True)
        .execute()
    )
    return result.data


def get_vip_subscriber_by_lid(lid: str) -> Optional[Dict[str, Any]]:
    """Get VIP subscriber by LID - OTIMIZADO"""
    result = (
        supabase.table("vip_subscribers")
        .select(VIP_SUBSCRIBER_FIELDS)
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


def get_vip_sent_job_ids(subscriber_id: str, limit: int = 2000) -> List[str]:
    """Get sent job IDs for a VIP subscriber - OTIMIZADO com limite"""
    result = (
        supabase.table("vip_delivery_history")
        .select("job_id")
        .eq("vip_subscriber_id", subscriber_id)
        .order("sent_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [d["job_id"] for d in result.data]


# =====================================================
# JOB MATCHES (Cache de matching VIP)
# =====================================================

def get_job_matches(subscriber_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Get cached job matches for subscriber"""
    result = (
        supabase.table("job_matches")
        .select("job_id, match_score, computed_at")
        .eq("subscriber_id", subscriber_id)
        .gt("expires_at", datetime.utcnow().isoformat())
        .order("match_score", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


def upsert_job_matches(matches: List[Dict[str, Any]]) -> int:
    """Bulk upsert job matches - OTIMIZADO com batch"""
    if not matches:
        return 0

    batch_size = 500
    total = 0

    for i in range(0, len(matches), batch_size):
        batch = matches[i:i + batch_size]

        data = []
        for m in batch:
            data.append({
                "subscriber_id": m["subscriber_id"],
                "job_id": m["job_id"],
                "match_score": m.get("match_score", 0),
                "computed_at": datetime.utcnow().isoformat(),
                "expires_at": (datetime.utcnow() + timedelta(hours=12)).isoformat()
            })

        try:
            result = supabase.table("job_matches").upsert(
                data,
                on_conflict="subscriber_id,job_id"
            ).execute()
            total += len(result.data) if result.data else 0
        except Exception as e:
            logger.error(f"Erro no upsert de job_matches: {e}")

    return total


def cleanup_expired_matches() -> int:
    """Remove expired job matches"""
    result = (
        supabase.table("job_matches")
        .delete()
        .lt("expires_at", datetime.utcnow().isoformat())
        .execute()
    )
    return len(result.data) if result.data else 0


# =====================================================
# UTILITY FUNCTIONS
# =====================================================

def get_existing_job_urls(limit: int = 50000) -> set:
    """
    Get existing job URLs (for deduplication at startup)
    OTIMIZADO: Usa paginação e limite
    """
    all_urls = set()
    page_size = 1000
    offset = 0

    while offset < limit:
        result = (
            supabase.table("jobs")
            .select("job_url")
            .order("created_at", desc=True)
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

    return all_urls


def run_cleanup() -> List[Dict[str, Any]]:
    """Run cleanup with policies (calls database function)"""
    result = supabase.rpc("run_cleanup_with_policies").execute()
    return result.data


# =====================================================
# OBSERVABILIDADE
# =====================================================

def record_egress_stat(
    service: str,
    operation: str,
    rows: int,
    bytes_estimate: int = None,
    duration_ms: int = None,
    metadata: dict = None
) -> None:
    """Record egress statistics for monitoring"""
    try:
        supabase.table("egress_stats").insert({
            "service": service,
            "operation": operation,
            "rows_returned": rows,
            "estimated_bytes": bytes_estimate or (rows * 500),
            "duration_ms": duration_ms,
            "metadata": metadata or {}
        }).execute()
    except Exception as e:
        logger.warning(f"Falha ao registrar egress stat: {e}")

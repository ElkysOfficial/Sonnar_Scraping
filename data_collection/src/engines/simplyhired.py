"""
Engine SimplyHired — usa Playwright porque o site fica atrás do Cloudflare.
Extrai dados do __NEXT_DATA__ embutido após renderização.
"""
import asyncio
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from utils.browser_fetch import fetch_html
from utils.google_enricher import GoogleEnricher, is_missing_field
from variavel import get_active_stacks

ENRICH_ENABLED = os.getenv("ENABLE_GOOGLE_ENRICHMENT", "0") == "1"
SH_MAX_PAGES = int(os.getenv("SIMPLYHIRED_MAX_PAGES", "5"))


def parse_relative_date(date_text: str) -> str:
    if not date_text:
        return ""
    date_text = date_text.lower().strip()
    today = datetime.now()
    if "hoje" in date_text or "today" in date_text or "just" in date_text:
        return today.strftime("%d/%m/%Y")
    if "ontem" in date_text or "yesterday" in date_text:
        return (today - timedelta(days=1)).strftime("%d/%m/%Y")
    days_match = re.search(r"(\d+)\s*(dias?|days?)", date_text)
    if days_match:
        return (today - timedelta(days=int(days_match.group(1)))).strftime("%d/%m/%Y")
    weeks_match = re.search(r"(\d+)\s*(semanas?|weeks?)", date_text)
    if weeks_match:
        return (today - timedelta(weeks=int(weeks_match.group(1)))).strftime("%d/%m/%Y")
    months_match = re.search(r"(\d+)\s*(m[eê]s(es)?|months?)", date_text)
    if months_match:
        return (today - timedelta(days=int(months_match.group(1)) * 30)).strftime("%d/%m/%Y")
    return ""


_RE_NEXT_DATA = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>',
    re.DOTALL,
)


def _parse_item(item: dict, seen: set) -> list | None:
    encoded_url = item.get("encodedUrl", "")
    if not encoded_url:
        return None
    decoded_url = urllib.parse.unquote(encoded_url)
    link = f"https://www.simplyhired.com.br{decoded_url}"
    if link in seen:
        return None
    seen.add(link)

    job_title = item.get("title", "")
    if not job_title:
        return None

    company = (
        item.get("company", "")
        or item.get("companyName", "")
        or item.get("employer", "")
    )
    if not company:
        ci = item.get("companyInfo", {})
        if isinstance(ci, dict):
            company = ci.get("name", "") or ci.get("companyName", "")
    if not company and " - " in job_title:
        parts = job_title.rsplit(" - ", 1)
        job_title = parts[0].strip()
        company = parts[1].strip() if len(parts) > 1 else ""

    location_str = item.get("location", "") or item.get("formattedLocation", "")
    if isinstance(location_str, str) and location_str:
        location = [p.strip() for p in location_str.split(",") if p.strip()][:2]
    else:
        location = []
        location_str = ""

    title_lower = job_title.lower()
    location_lower = location_str.lower()
    remote_attrs = item.get("remoteAttributes", [])
    if remote_attrs or "remoto" in title_lower or "remote" in title_lower or "remoto" in location_lower:
        work_type = "Remoto"
        location = []
    elif "híbrido" in title_lower or "hybrid" in title_lower or "híbrido" in location_lower:
        work_type = "Híbrido"
    else:
        work_type = "Presencial"

    hiring_regime = ""
    for jt in item.get("jobTypes", []) or []:
        jt_lower = jt.lower() if isinstance(jt, str) else ""
        if "integral" in jt_lower or "full" in jt_lower:
            hiring_regime = "CLT"
            break
        if "parcial" in jt_lower or "part" in jt_lower:
            hiring_regime = "Meio Período"
            break
        if "temporário" in jt_lower or "temp" in jt_lower:
            hiring_regime = "Temporário"
            break
        if "estágio" in jt_lower or "intern" in jt_lower:
            hiring_regime = "Estágio"
            break
        if "freelance" in jt_lower or "contract" in jt_lower:
            hiring_regime = "PJ"
            break

    salary = item.get("salary", "") or item.get("salaryText", "") or item.get("formattedSalary", "")

    publication_date = ""
    date_field = (
        item.get("postedAt", "")
        or item.get("datePosted", "")
        or item.get("postedDate", "")
        or item.get("formattedDate", "")
    )
    if isinstance(date_field, str) and date_field:
        if len(date_field) >= 10 and "-" in date_field:
            d = date_field[:10].split("-")
            if len(d) == 3:
                publication_date = f"{d[2]}/{d[1]}/{d[0]}"
        else:
            publication_date = parse_relative_date(date_field)

    return [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]


async def get_simplyhired_jobs(on_job=None) -> list:
    """
    Coleta vagas do SimplyHired Brasil via Playwright (CF bypass) parseando
    o ``__NEXT_DATA__`` embutido na página.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga.
    """
    jobs = []
    seen = set()

    for stack in get_active_stacks():
        for page in range(1, SH_MAX_PAGES + 1):
            url = f"https://www.simplyhired.com.br/search?q={urllib.parse.quote(stack)}&pn={page}"
            try:
                html = await fetch_html(url, wait_until="domcontentloaded", timeout_ms=30000)
            except Exception:
                break
            if not html:
                break

            match = _RE_NEXT_DATA.search(html)
            if not match:
                break
            try:
                data = json.loads(match.group(1))
            except json.JSONDecodeError:
                break

            job_list = data.get("props", {}).get("pageProps", {}).get("jobs", [])
            if not job_list:
                break

            added = 0
            for item in job_list:
                try:
                    parsed = _parse_item(item, seen)
                    if parsed:
                        jobs.append(parsed)
                        added += 1
                        if on_job is not None:
                            try:
                                await on_job(parsed)
                            except Exception:
                                pass
                except Exception:
                    continue

            if added == 0:
                break
            await asyncio.sleep(0.3)

    if jobs and ENRICH_ENABLED:
        async with GoogleEnricher() as enricher:
            sem = asyncio.Semaphore(5)

            async def _enrich_one(job_data):
                async with sem:
                    loc_str = job_data[3] if isinstance(job_data[3], str) else ", ".join(job_data[3]) if job_data[3] else ""
                    needs_location = job_data[4] != "Remoto" and is_missing_field(loc_str)
                    needs_salary = is_missing_field(job_data[6])
                    if not (needs_location or needs_salary):
                        return
                    try:
                        enriched = await enricher.enrich_job({
                            "company": job_data[2], "job_title": job_data[1],
                            "location": loc_str, "salary": job_data[6],
                        })
                    except Exception:
                        return
                    if needs_location and enriched.get("location"):
                        job_data[3] = enriched["location"]
                    if needs_salary and enriched.get("salary"):
                        job_data[6] = enriched["salary"]

            await asyncio.gather(*(_enrich_one(j) for j in jobs[:30]), return_exceptions=True)

    print(f"Foram obtidas {len(jobs)} vagas do site SimplyHired")
    return jobs


def reset_session():
    pass


if __name__ == "__main__":
    result = asyncio.run(get_simplyhired_jobs())
    for j in result[:5]:
        print(j)

"""Valida cobertura do parser Remotive em fetch real da API."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "scraper"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "scraper", "src"))

from curl_cffi import requests
from engines.remotive import _parse_job_item, REMOTIVE_CATEGORIES
from persistence.location_normalizer import normalize_location

s = requests.Session(impersonate="chrome")
parsed_jobs = []
for cat in REMOTIVE_CATEGORIES[:5]:
    r = s.get(f"https://remotive.com/api/remote-jobs?category={cat}", timeout=30)
    if r.status_code != 200:
        continue
    for item in r.json().get("jobs", []):
        try:
            p = _parse_job_item(item)
        except Exception:
            continue
        if not p:
            continue
        loc = p[3] if isinstance(p[3], str) else (" - ".join(p[3]) if p[3] else "")
        state, country = normalize_location(loc)
        parsed_jobs.append({
            "job_url": p[0], "title": p[1], "company": p[2],
            "location_raw": loc, "work_type": p[4], "hiring_regime": p[5],
            "publication_date": p[7], "description": p[9],
            "country_code": country, "state_code": state,
        })

seen = set()
unique = []
for p in parsed_jobs:
    if p["job_url"] in seen: continue
    seen.add(p["job_url"]); unique.append(p)
parsed_jobs = unique

n = len(parsed_jobs)
print(f"vagas parseadas (dedupe): {n}\n")
CRITICAL = ["title", "job_url", "company", "location_raw", "work_type",
            "hiring_regime", "publication_date", "description",
            "country_code", "state_code"]
print(f"{'campo':<22} {'preenchido':>12} {'%':>7}")
for k in CRITICAL:
    filled = sum(1 for p in parsed_jobs if p.get(k) not in (None, "", []))
    pct = filled / n * 100 if n else 0
    mark = "OK " if pct >= 95 else "!! "
    print(f"  {mark}{k:<20} {filled:>5}/{n:<3} {pct:>6.1f}%")

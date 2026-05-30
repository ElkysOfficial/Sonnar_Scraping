"""Valida cobertura do parser RemoteOK em fetch real da API.

Mede % de campos preenchidos apos parse_job_item + normalize_location.
Meta: >= 95% por campo critico.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "scraper"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "scraper", "src"))

from curl_cffi import requests
from engines.remoteok import _parse_job_item
from persistence.location_normalizer import normalize_location

# Stacks amplas pra maximizar amostra
STACKS = {"python", "javascript", "typescript", "react", "vue", "angular",
          "node", "go", "rust", "java", "kotlin", "swift", "ruby", "php",
          "engineer", "developer", "designer", "data", "ml", "ai", "devops"}

s = requests.Session(impersonate="chrome")
data = s.get("https://remoteok.com/api", timeout=30).json()
items = data[1:]

parsed_jobs = []
for item in items:
    p = _parse_job_item(item, STACKS)
    if p is None:
        continue
    # canonical[3] = location (str ou list)
    loc = p[3]
    if isinstance(loc, list):
        loc = " - ".join(loc)
    state, country = normalize_location(loc or "")
    parsed_jobs.append({
        "job_url": p[0], "title": p[1], "company": p[2],
        "location_raw": loc, "work_type": p[4], "hiring_regime": p[5],
        "salary": p[6], "publication_date": p[7],
        "skills": p[8], "description": p[9],
        "country_code": country, "state_code": state,
    })

n = len(parsed_jobs)
print(f"vagas parseadas: {n}\n")
CRITICAL = ["title", "job_url", "company", "location_raw", "work_type",
            "hiring_regime", "publication_date", "description",
            "country_code", "state_code"]
print(f"{'campo':<22} {'preenchido':>12} {'%':>7}")
for k in CRITICAL:
    filled = sum(1 for p in parsed_jobs if p.get(k) not in (None, "", []))
    pct = filled / n * 100 if n else 0
    mark = "OK " if pct >= 95 else "!! "
    print(f"  {mark}{k:<20} {filled:>5}/{n:<3} {pct:>6.1f}%")

# amostra
print("\n--- amostra ---")
for p in parsed_jobs[:2]:
    for k in CRITICAL:
        v = p.get(k)
        if isinstance(v, str) and len(v) > 70:
            v = v[:70] + "..."
        print(f"  {k:<22} {v!r}")
    print()

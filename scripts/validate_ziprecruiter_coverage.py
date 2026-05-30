"""Faz fetch de 3 paginas reais do ziprecruiter e mede % de extracao
por campo apos parse + normalize_location. Meta: >= 95% por campo."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "scraper"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "scraper", "src"))

import urllib.parse
from curl_cffi import requests
from bs4 import BeautifulSoup
from engines.ziprecruiter import parse_card
from persistence.location_normalizer import normalize_location

CRITICAL = ["title", "link", "company", "location_raw", "work_type",
            "hiring_regime", "publication_date", "description",
            "country_code", "state_code"]

s = requests.Session(impersonate="chrome")
all_parsed = []
for q in ["python", "javascript", "data engineer"]:
    for page in (1, 2):
        url = f"https://www.ziprecruiter.co.uk/jobs/search?q={urllib.parse.quote(q)}&l=&page={page}"
        r = s.get(url, timeout=30)
        soup = BeautifulSoup(r.text, "html.parser")
        wraps = soup.find_all("div", class_="jobList-introWrap")
        for w in wraps:
            p = parse_card(w)
            if not p:
                continue
            state, country = normalize_location(p["location_raw"])
            p["state_code"] = state or ""
            p["country_code"] = country or ""
            all_parsed.append(p)

n = len(all_parsed)
print(f"vagas parseadas: {n}\n")
print(f"{'campo':<20} {'preenchido':>12} {'%':>7}")
for k in CRITICAL:
    filled = sum(1 for p in all_parsed if p.get(k) not in (None, "", []))
    pct = filled / n * 100 if n else 0
    mark = "OK " if pct >= 95 else "!! "
    print(f"  {mark}{k:<18} {filled:>5}/{n:<3} {pct:>6.1f}%")

# amostra
print("\n--- 2 vagas de exemplo ---")
for p in all_parsed[:2]:
    for k in CRITICAL:
        v = p.get(k)
        if isinstance(v, str) and len(v) > 80:
            v = v[:80] + "..."
        print(f"  {k:<20} {v!r}")
    print()

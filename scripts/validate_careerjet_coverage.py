"""Valida cobertura do parser CareerJet aplicando normalize_location
sobre as locations REAIS ja armazenadas no banco.

CareerJet exige API key e roda em ciclos longos — testamos a parte
normalizavel (mapeamento DE) sobre dados existentes.
"""
import json, os, ssl, urllib.request
from pathlib import Path
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "scraper"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "scraper", "src"))
from persistence.location_normalizer import normalize_location
from engines.careerjet import _infer_regime

SUPA_URL = "https://cqiaiwpjrxqxvhvmcgfs.supabase.co"
env = Path(__file__).resolve().parent.parent / "apps" / "scraper" / ".env"
SUPA_KEY = next(l.split("=", 1)[1].strip()
                for l in env.read_text(encoding="utf-8").splitlines()
                if l.startswith("SUPABASE_SERVICE_ROLE_KEY="))

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = (f"{SUPA_URL}/rest/v1/jobs?select=job_title,description,location_raw"
       f"&source=eq.careerjet&order=scraped_at.desc&limit=80")
req = urllib.request.Request(url, headers={
    "apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
})
rows = json.loads(urllib.request.urlopen(req, context=ctx).read())
n = len(rows)
print(f"vagas: {n}\n")

# Simula o resultado do v3.10.3
country_filled = 0
state_filled = 0
regime_filled = 0
regime_dist = {}
country_fails = []
for r in rows:
    loc = r.get("location_raw") or ""
    title = r.get("job_title") or ""
    desc = (r.get("description") or "")[:1000]
    state, country = normalize_location(loc)
    regime = _infer_regime(title, desc)
    if country:
        country_filled += 1
    else:
        country_fails.append(loc)
    if state:
        state_filled += 1
    if regime:
        regime_filled += 1
        regime_dist[regime] = regime_dist.get(regime, 0) + 1

print(f"country_code: {country_filled}/{n} ({country_filled/n*100:.1f}%)")
print(f"state_code:   {state_filled}/{n} ({state_filled/n*100:.1f}%)")
print(f"hiring_regime: {regime_filled}/{n} ({regime_filled/n*100:.1f}%)")
print(f"  distribuicao: {regime_dist}")
print()
if country_fails:
    print("country fails:")
    for f in country_fails: print(f"  {f!r}")

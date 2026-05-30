"""Valida cobertura do parser LinkedIn aplicando normalize_location
sobre as 100 vagas mais recentes ja no banco.

LinkedIn eh scrape HTML real com auth complexo — testamos a parte
normalizavel (mapeamento de cidades LATAM + fix de mojibake) sobre
dados existentes.
"""
import json, os, ssl, urllib.request
from pathlib import Path
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "scraper"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "scraper", "src"))
from persistence.location_normalizer import normalize_location

SUPA_URL = "https://cqiaiwpjrxqxvhvmcgfs.supabase.co"
env = Path(__file__).resolve().parent.parent / "apps" / "scraper" / ".env"
SUPA_KEY = next(l.split("=", 1)[1].strip()
                for l in env.read_text(encoding="utf-8").splitlines()
                if l.startswith("SUPABASE_SERVICE_ROLE_KEY="))

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = (f"{SUPA_URL}/rest/v1/jobs?select=location_raw,job_title,hiring_regime,responsibilities"
       f"&source=eq.linkedin&order=scraped_at.desc&limit=100")
req = urllib.request.Request(url, headers={
    "apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
})
rows = json.loads(urllib.request.urlopen(req, context=ctx).read())
n = len(rows)
print(f"vagas: {n}\n")

country_filled = sum(1 for r in rows if normalize_location(r.get("location_raw") or "")[1])
state_filled = sum(1 for r in rows if normalize_location(r.get("location_raw") or "")[0])
regime_filled = sum(1 for r in rows if r.get("hiring_regime"))
resp_filled = sum(1 for r in rows if r.get("responsibilities"))

print(f"country_code:    {country_filled}/{n} ({country_filled/n*100:.1f}%)")
print(f"state_code:      {state_filled}/{n} ({state_filled/n*100:.1f}%)")
print(f"hiring_regime:   {regime_filled}/{n} ({regime_filled/n*100:.1f}%)")
print(f"responsibilities:{resp_filled}/{n} ({resp_filled/n*100:.1f}%)")

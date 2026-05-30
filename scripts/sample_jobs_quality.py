"""Amostra 50 vagas mais recentes por engine e mede missing rate por campo critico.

Saida: tabela ordenada por pior cobertura.
"""
import json
import os
import ssl
import urllib.request
from collections import defaultdict
from pathlib import Path

SUPA_URL = "https://cqiaiwpjrxqxvhvmcgfs.supabase.co"
SUPA_KEY = None
env = Path(__file__).resolve().parent.parent / "apps" / "scraper" / ".env"
for line in env.read_text(encoding="utf-8").splitlines():
    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
        SUPA_KEY = line.split("=", 1)[1].strip()
assert SUPA_KEY

ENGINES = [
    "bne", "careerjet", "catho", "dice", "geekhunter", "gupy",
    "indeed", "infojobs", "jooble", "linkedin", "michaelpage",
    "programathor", "remoteok", "remotive", "simplyhired",
    "weworkremotely", "ziprecruiter",
]
FIELDS = [
    "publication_date", "hiring_regime", "country_code", "state_code",
    "location_raw", "company", "description", "responsibilities",
]

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def fetch(source: str, limit: int = 50):
    url = (
        f"{SUPA_URL}/rest/v1/jobs"
        f"?select={','.join(['id', 'source'] + FIELDS)}"
        f"&source=eq.{source}"
        f"&order=scraped_at.desc"
        f"&limit={limit}"
    )
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {SUPA_KEY}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def is_missing(val) -> bool:
    if val is None:
        return True
    if isinstance(val, str) and not val.strip():
        return True
    return False


def main():
    print(f"{'engine':<16} {'N':>4}", end="")
    for f in FIELDS:
        print(f" {f[:10]:>10}", end="")
    print()
    print("-" * (16 + 5 + 11 * len(FIELDS)))

    summary = []
    for eng in ENGINES:
        try:
            rows = fetch(eng)
        except Exception as e:
            print(f"{eng:<16} ERR  {e}")
            continue
        n = len(rows)
        if n == 0:
            print(f"{eng:<16} {n:>4}  (sem vagas)")
            summary.append((eng, n, {}))
            continue
        miss = {f: 0 for f in FIELDS}
        for row in rows:
            for f in FIELDS:
                if is_missing(row.get(f)):
                    miss[f] += 1
        print(f"{eng:<16} {n:>4}", end="")
        for f in FIELDS:
            pct = (miss[f] / n) * 100
            mark = "!" if pct > 10 else " "
            print(f" {pct:>8.0f}%{mark}", end="")
        print()
        summary.append((eng, n, miss))

    # piores ofensores: maior % medio de missing
    print("\nRanking (pior cobertura primeiro):")
    scored = []
    for eng, n, miss in summary:
        if not n:
            continue
        avg = sum(miss.values()) / (len(FIELDS) * n) * 100
        scored.append((avg, eng, n, miss))
    scored.sort(reverse=True)
    for avg, eng, n, miss in scored:
        worst = sorted(miss.items(), key=lambda x: -x[1])[:3]
        worst_s = ", ".join(f"{k}={v}/{n}" for k, v in worst if v > 0) or "-"
        print(f"  {eng:<16} avg_miss={avg:5.1f}%  N={n:<3}  top: {worst_s}")


if __name__ == "__main__":
    main()

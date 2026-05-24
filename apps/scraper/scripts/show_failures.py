"""Mostra as vagas que extract_responsibilities NAO conseguiu extrair.

Le N vagas de uma engine, roda enrich_sync, e imprime so as que
voltaram com responsibilities=None. Util pra identificar padroes
de description nao cobertos pela heuristica.

Uso:
    python -m scripts.show_failures <engine> [--limit N]
"""
from __future__ import annotations

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRAPER_ROOT = os.path.dirname(HERE)
sys.path.insert(0, SCRAPER_ROOT)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

try:
    from dotenv import load_dotenv  # type: ignore[import-not-found]
    load_dotenv()
    load_dotenv(os.path.join(SCRAPER_ROOT, ".env"))
except ImportError:
    pass

import httpx  # noqa: E402

from src.utils.lang_detect import detect_lang  # noqa: E402
from src.utils.section_extractor import extract_responsibilities  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("engine")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    params = {
        "select": "job_title,description",
        "source": f"eq.{args.engine}",
        "order": "scraped_at.desc",
        "limit": str(args.limit),
        "description": "not.is.null",
    }
    with httpx.Client(timeout=15.0) as c:
        r = c.get(f"{url}/rest/v1/jobs", params=params, headers=headers)
        jobs = r.json()

    failures = 0
    for j in jobs:
        title = j.get("job_title") or ""
        desc = j.get("description") or ""
        lang = detect_lang(f"{title}\n{desc}")
        lang_use = lang if lang in ("pt", "en") else "pt"
        resp = extract_responsibilities(desc, lang_use)
        if resp is None:
            failures += 1
            print(f"\n--- FAIL #{failures}: '{title[:60]}' (lang={lang}, len={len(desc)}) ---")
            print(desc[:700].replace("\n", " | "))

    print(f"\n=== {failures}/{len(jobs)} falhas ===")


if __name__ == "__main__":
    main()

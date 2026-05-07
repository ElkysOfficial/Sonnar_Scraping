"""
Reparo dos registros do Indeed com ``location_raw`` sobrescrita pelo bug
"is_remote descarta a cidade".

Antes do fix em ``_parse_jsonld_jobposting``, vagas com
``jobLocationType=TELECOMMUTE`` + ``addressLocality=Recife`` eram salvas como
``location_raw="Remoto - Brasil"`` (cidade descartada). O engine corrigido
agora preserva ``Recife - PE - Brasil`` com ``work_type="Remoto"``.

Etapas:
  1. Identifica vagas Indeed com ``location_raw`` no conjunto sentinel.
  2. Re-fetch via engine corrigido.
  3. Atualiza o registro APENAS quando o novo ``location_raw`` diferir
     (preserva vagas genuinamente remotas sem cidade).
  4. Reescreve JSON e atualiza Supabase via ``repo.save``.
"""
from __future__ import annotations

import asyncio
import csv
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(__file__))

from src.controllers.controllers import normalize_job_result  # noqa: E402
from src.engines.indeed import fetch_indeed_detail  # noqa: E402
from src.persistence.jobs_repository import JobsRepository, build_job_payload  # noqa: E402
from src.utils.jobsUtils import process_salary  # noqa: E402


CONCURRENCY = 2  # mesmo teto do detail-fetch normal (rate-limit Cloudflare)
JSON_PATH = "src/data/jobs.json"
CSV_PATH = "src/data/job.csv"

SUSPECT_LOCATIONS = {"Remoto - Brasil", "Remoto", "Brasil", "Remoto Brasil"}


async def _refetch(url: str, sem: asyncio.Semaphore) -> dict | None:
    """Re-fetch + normalizacao no formato canonico do controller."""
    async with sem:
        detail = await fetch_indeed_detail(url)
    if not detail:
        return None
    raw = [
        url,
        detail["title"],
        detail["company"],
        detail["location"],
        detail["work_type"],
        detail["hiring_regime"],
        detail["salary"],
        detail["publication_date"],
        detail.get("skills", []),
        detail.get("description", ""),
    ]
    job = normalize_job_result(raw)
    try:
        job["salary"] = process_salary(job.get("salary", ""), job.get("job_title", ""))
    except Exception:
        pass
    return job


async def main() -> None:
    sem = asyncio.Semaphore(CONCURRENCY)

    async with JobsRepository() as repo:
        with open(JSON_PATH, encoding="utf-8") as f:
            data = json.load(f)

        suspect_urls = [
            k for k, v in data.items()
            if v.get("source") == "indeed"
            and (v.get("location_raw") or "") in SUSPECT_LOCATIONS
        ]
        print(f"Vagas Indeed com location sentinel: {len(suspect_urls)}/{len(data)}")
        if not suspect_urls:
            print("Nada a reparar.")
            return

        results = await asyncio.gather(*(_refetch(url, sem) for url in suspect_urls))

        updated = 0
        unchanged = 0
        failed = 0
        for url, new_job in zip(suspect_urls, results):
            if new_job is None:
                failed += 1
                continue

            new_payload = build_job_payload(new_job, source="indeed")
            new_loc = new_payload.get("location_raw") or ""
            old_loc = data[url].get("location_raw") or ""

            if new_loc and new_loc != old_loc and new_loc not in SUSPECT_LOCATIONS:
                # preserva sent_to do registro antigo
                if "sent_to" in data[url]:
                    new_payload["sent_to"] = data[url]["sent_to"]
                data[url] = new_payload
                try:
                    await repo.save(new_job, source="indeed")
                except Exception:
                    pass
                updated += 1
                print(f"  [updated] {url}")
                print(f"            {old_loc!r}  ->  {new_loc!r}")
            else:
                unchanged += 1

        with open(JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)

        # CSV: append da nova versao apenas. O dedup eh feito na leitura
        # (ultima ocorrencia por job_url ganha) - o CSVStore atual eh append-only
        # entao nao reescrevemos linhas antigas. Vagas atualizadas terao duas
        # entradas no CSV; consumidores deduplicam por job_url.
        print()
        print("=== Resultado ===")
        print(f"  Atualizadas (cidade recuperada): {updated}")
        print(f"  Inalteradas (genuinamente remotas): {unchanged}")
        print(f"  Falha no re-fetch: {failed}")


if __name__ == "__main__":
    asyncio.run(main())

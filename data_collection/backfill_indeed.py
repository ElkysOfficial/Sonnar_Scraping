"""
Re-fetch das vagas do Indeed já em ``jobs.json`` usando o engine corrigido,
para preencher campos que ficaram vazios na versão antiga do parser
(``location_raw``/``country_code`` em vagas remotas, ``hiring_regime`` quando
o JSON-LD não trazia ``employmentType``).

Uso:
    python backfill_indeed.py            # backfill de tudo que veio do indeed
    python backfill_indeed.py --dry      # só mostra o diff, não grava
"""
from __future__ import annotations

import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))

from src.controllers.controllers import normalize_job_result  # noqa: E402
from src.engines.indeed import _fetch_job_detail  # noqa: E402
from src.persistence.jobs_repository import JobsRepository, build_job_payload  # noqa: E402
from src.utils.jobsUtils import process_salary  # noqa: E402


CONCURRENCY = 8


async def _refetch(url: str, sem: asyncio.Semaphore) -> dict | None:
    raw = await _fetch_job_detail(url, sem)
    if not raw:
        return None
    job = normalize_job_result(raw)
    try:
        job["salary"] = process_salary(job.get("salary", ""), job.get("job_title", ""))
    except Exception:
        pass
    return job


async def main(dry: bool) -> None:
    sem = asyncio.Semaphore(CONCURRENCY)

    async with JobsRepository() as repo:
        all_jobs = list(repo.local._data.values())  # cache em memória do LocalJobStore
        # alvo: indeed + (location_raw vazio OU country_code vazio OU hiring_regime vazio)
        targets = [
            j for j in all_jobs
            if j.get("source") == "indeed"
            and (not j.get("location_raw") or not j.get("country_code") or not j.get("hiring_regime"))
        ]
        print(f"Total indeed: {sum(1 for j in all_jobs if j.get('source')=='indeed')}")
        print(f"Vagas a reprocessar: {len(targets)}")
        if not targets:
            return

        results = await asyncio.gather(*(_refetch(j["job_url"], sem) for j in targets))

        upgraded = {"location_raw": 0, "country_code": 0, "state_code": 0, "hiring_regime": 0}
        unchanged = 0
        failed = 0

        for old, new in zip(targets, results):
            if not new:
                failed += 1
                continue
            new_payload = build_job_payload(new, source="indeed")
            changed = False
            for f in upgraded:
                if not old.get(f) and new_payload.get(f):
                    upgraded[f] += 1
                    changed = True
            if changed:
                if not dry:
                    await repo.save(new, source="indeed")
            else:
                unchanged += 1

        print()
        print("=== Resultado do backfill ===")
        for f, n in upgraded.items():
            print(f"  {f:<18} preenchidos +{n}")
        print(f"  sem mudança         {unchanged}")
        print(f"  re-fetch falhou     {failed}")


if __name__ == "__main__":
    dry = "--dry" in sys.argv
    asyncio.run(main(dry))

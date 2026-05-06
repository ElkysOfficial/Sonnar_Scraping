"""
Reparo dos registros do Indeed que foram salvos como página de challenge
do Cloudflare ("Security Check") em vez do conteúdo real da vaga.

Etapas:
  1. Identifica vagas com ``job_title`` invalido (challenge/login/erro).
  2. Re-fetch com o engine corrigido (que agora detecta e descarta).
  3. Substitui no JSON; vagas que continuam falhando sao removidas.
  4. Reescreve o CSV (filtra linhas invalidas, regrava as boas).
"""
from __future__ import annotations

import asyncio
import csv
import json
import os
import re
import sys

from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(__file__))

from src.controllers.controllers import normalize_job_result  # noqa: E402
from src.engines.indeed import _fetch_job_detail, _is_invalid_title  # noqa: E402
from src.persistence.jobs_repository import JobsRepository, build_job_payload  # noqa: E402
from src.utils.jobsUtils import process_salary  # noqa: E402


CONCURRENCY = 4
JSON_PATH = "src/data/jobs.json"
CSV_PATH = "src/data/job.csv"


def _is_bad_record(j: dict) -> bool:
    title = (j.get("job_title") or "").strip()
    if _is_invalid_title(title):
        return True
    if not j.get("company") and not j.get("description"):
        return True
    return False


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


async def main() -> None:
    sem = asyncio.Semaphore(CONCURRENCY)

    async with JobsRepository() as repo:
        with open(JSON_PATH, encoding="utf-8") as f:
            data = json.load(f)

        bad_keys = [k for k, v in data.items() if v.get("source") == "indeed" and _is_bad_record(v)]
        print(f"Registros ruins identificados: {len(bad_keys)}/{len(data)}")
        if not bad_keys:
            print("Nada a reparar."); return

        # 1) Tenta re-fetch
        results = await asyncio.gather(*(_refetch(url, sem) for url in bad_keys))

        recovered = 0
        removed = 0
        for url, new_job in zip(bad_keys, results):
            if new_job:
                payload = build_job_payload(new_job, source="indeed")
                # mantem ``sent_to`` antigo se existir
                if "sent_to" in data[url]:
                    payload["sent_to"] = data[url]["sent_to"]
                data[url] = payload
                # tambem grava no supabase
                try:
                    await repo.save(new_job, source="indeed")
                except Exception:
                    pass
                recovered += 1
            else:
                # nao conseguiu recuperar - remove
                del data[url]
                removed += 1

        # 2) Persiste JSON limpo
        with open(JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)

        # 3) Reescreve CSV filtrando registros ruins
        with open(CSV_PATH, encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        before = len(rows)
        # Mantemos so os que existem no JSON novo (URLs validas pos-limpeza).
        valid_urls = set(data.keys())
        clean_rows = [r for r in rows if r.get("job_url") in valid_urls
                      and not _is_invalid_title(r.get("job_title", ""))]
        if clean_rows:
            fieldnames = list(clean_rows[0].keys())
            with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                w.writerows(clean_rows)
        print()
        print("=== Resultado ===")
        print(f"  Recuperadas (re-fetch ok):  {recovered}")
        print(f"  Removidas (nao recuperaveis): {removed}")
        print(f"  CSV: {before} -> {len(clean_rows)} linhas")


if __name__ == "__main__":
    asyncio.run(main())

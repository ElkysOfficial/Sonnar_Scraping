"""
Cleanup retroativo de vagas non-tech do Michael Page no jobs.json e job.csv.

Antes do filtro defensivo no engine (commit que adiciona _is_non_tech_title)
o MP varria 8 categorias - 6 non-tech. Como resultado o jobs.json acumulou
vagas como "Gerente de Vendas", "Plant Manager", "Contador", "Engenheiro
Mecanico", etc. Esse script remove essas entradas dos arquivos locais.

Uso:
    python cleanup_michaelpage_non_tech.py            # dry-run (so lista)
    python cleanup_michaelpage_non_tech.py --apply    # aplica mudancas

Nao toca em Supabase - so arquivos locais. Se quiser limpar Supabase, e
melhor faze-lo via SQL com o mesmo regex.
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
import os
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from src.engines.michaelpage import _is_non_tech_title  # noqa: E402

JOBS_JSON = os.path.join(os.path.dirname(__file__), "src", "data", "jobs.json")
JOB_CSV = os.path.join(os.path.dirname(__file__), "src", "data", "job.csv")


def is_mp(url: str) -> bool:
    return "michaelpage" in (url or "").lower()


def cleanup_jobs_json(apply: bool) -> tuple[int, int, list[str]]:
    with open(JOBS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    total_mp = sum(1 for u in data if is_mp(u))
    to_remove: list[str] = []
    for url, job in data.items():
        if not is_mp(url):
            continue
        title = (job.get("job_title") or "").strip()
        # Sem title (refetch_one bug pre-fix) -> usar slug do URL como proxy
        slug = urllib.parse.unquote(
            url.split("/job-detail/")[-1].split("/ref/")[0]
        ).replace("-", " ")
        proxy_title = title or slug
        if _is_non_tech_title(proxy_title):
            to_remove.append(url)
    if apply:
        backup = JOBS_JSON + f".bak.{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
        shutil.copy2(JOBS_JSON, backup)
        for url in to_remove:
            data.pop(url, None)
        with open(JOBS_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  jobs.json: backup salvo em {backup}")
    return total_mp, len(to_remove), to_remove


def cleanup_csv(apply: bool, removed_urls: set[str]) -> tuple[int, int]:
    with open(JOB_CSV, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    total_mp = sum(1 for r in rows if is_mp(r.get("job_url", "")))
    kept: list[dict] = []
    removed = 0
    for r in rows:
        url = r.get("job_url", "")
        if is_mp(url):
            title = (r.get("job_title") or "").strip()
            slug = url.split("/job-detail/")[-1].split("/ref/")[0].replace("-", " ")
            proxy_title = title or slug
            if url in removed_urls or _is_non_tech_title(proxy_title):
                removed += 1
                continue
        kept.append(r)
    if apply and removed:
        backup = JOB_CSV + f".bak.{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
        shutil.copy2(JOB_CSV, backup)
        with open(JOB_CSV, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(kept)
        print(f"  job.csv: backup salvo em {backup}")
    return total_mp, removed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="aplica mudancas (default: dry-run)")
    args = ap.parse_args()

    print(f"Modo: {'APPLY' if args.apply else 'DRY-RUN'}")
    print()

    total_mp_json, removed_json, urls_removed = cleanup_jobs_json(args.apply)
    print(f"jobs.json: {total_mp_json} MP totais, {removed_json} a remover")
    if removed_json and not args.apply:
        for u in urls_removed[:10]:
            print(f"  - {u}")
        if removed_json > 10:
            print(f"  ... +{removed_json - 10} URLs")
    print()

    total_mp_csv, removed_csv = cleanup_csv(args.apply, set(urls_removed))
    print(f"job.csv:   {total_mp_csv} MP totais, {removed_csv} a remover")

    if not args.apply:
        print("\n(dry-run; rode com --apply para efetivar)")


if __name__ == "__main__":
    main()

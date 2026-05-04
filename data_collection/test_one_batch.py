"""
Teste end-to-end de UM lote de scraping.

Executa exatamente um lote (sem loop infinito), com um subset pequeno de
engines rápidas, e verifica que JSON e CSV foram populados.

Uso:
    python test_one_batch.py            # lote padrão (1º lote da 1ª categoria)
    python test_one_batch.py --batch-size 5
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Forçar UTF-8 no stdout pra Windows (caracteres acentuados em prints)
if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from variavel import iter_batches, set_active_batch
from src.controllers.controllers import _run_one_batch, _engine_name
from src.controllers.job_getters import getters as ALL_GETTERS
from src.persistence.jobs_repository import JobsRepository


# Engines rápidas (não dependem de Playwright e iteração leve por stack)
FAST_ENGINES = {"geekhunter", "gupy", "remoteok", "remotive"}


async def run(batch_size: int, only_fast: bool):
    json_path = os.path.abspath("src/data/jobs.json")
    csv_path = os.path.abspath("src/data/job.csv")

    print(f"\nDestinos:")
    print(f"  JSON: {json_path}")
    print(f"  CSV:  {csv_path}\n")

    # Pega o primeiro lote
    cat, batch = next(iter_batches(batch_size))
    print(f"Lote escolhido: '{cat}' → {batch}")
    set_active_batch(batch)

    # Filtra getters se for modo --only-fast
    getters = (
        [g for g in ALL_GETTERS if _engine_name(g) in FAST_ENGINES]
        if only_fast
        else ALL_GETTERS
    )
    print(f"Engines ativas: {[_engine_name(g) for g in getters]}\n")

    # Patch: o controllers usa a lista global `getters`. Como _run_one_batch
    # importa de job_getters, basta substituir a referência:
    import src.controllers.controllers as ctrl
    ctrl.getters = getters

    # Tamanho inicial do JSON pra calcular delta
    json_before = 0
    if os.path.exists(json_path):
        try:
            with open(json_path, encoding="utf-8") as f:
                json_before = len(json.load(f))
        except Exception:
            json_before = 0

    csv_before_lines = 0
    if os.path.exists(csv_path):
        with open(csv_path, encoding="utf-8") as f:
            csv_before_lines = sum(1 for _ in f)

    started = time.monotonic()
    async with JobsRepository() as repo:
        sent_jobs: set = repo.known_urls()
        print(f"Vagas conhecidas no JSON antes do lote: {len(sent_jobs)}")
        await _run_one_batch(repo=repo, sent_jobs=sent_jobs)
    elapsed = time.monotonic() - started

    set_active_batch(None)

    # Verificação
    json_after = 0
    if os.path.exists(json_path):
        with open(json_path, encoding="utf-8") as f:
            json_after = len(json.load(f))

    csv_after_lines = 0
    if os.path.exists(csv_path):
        with open(csv_path, encoding="utf-8") as f:
            csv_after_lines = sum(1 for _ in f)

    print("\n" + "=" * 60)
    print(f"RESULTADO ({elapsed:.1f}s = {elapsed/60:.1f}min)")
    print("=" * 60)
    print(f"JSON: {json_before} → {json_after}  (delta: {json_after - json_before})")
    print(f"CSV : {csv_before_lines} → {csv_after_lines}  (delta: {csv_after_lines - csv_before_lines} linhas)")
    print(f"Tamanho dos arquivos:")
    if os.path.exists(json_path):
        print(f"  jobs.json: {os.path.getsize(json_path):,} bytes")
    if os.path.exists(csv_path):
        print(f"  job.csv:   {os.path.getsize(csv_path):,} bytes")

    # Breakdown por engine
    print("\nVagas por engine:")
    if os.path.exists(json_path):
        import collections
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        counts = collections.Counter(j.get("source", "?") for j in data.values())
        active = {_engine_name(g) for g in getters}
        # Engines ativas no teste (mostra zero pra quem não retornou nada)
        for name in sorted(active):
            print(f"  {name:20} {counts.get(name, 0)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=5)
    parser.add_argument("--only-fast", action="store_true", default=True,
                        help="Roda só geekhunter/gupy/remoteok/remotive (default).")
    parser.add_argument("--all-engines", action="store_true",
                        help="Inclui todas as engines (mais lento).")
    args = parser.parse_args()

    asyncio.run(run(args.batch_size, only_fast=not args.all_engines))

"""Backfill de description_lang + responsibilities pra vagas antigas.

Le vagas que ainda nao passaram pelo pipeline de enriquecimento (epico
v3.0.0) direto do Supabase, roda enrich_sync(title, description) e
atualiza os 2 campos. Resumivel: cada execucao processa apenas vagas
com responsibilities IS NULL E description_lang IS NULL.

Idempotente: processar duas vezes a mesma vaga nao gera trabalho extra
(a query filtra quem ja tem os campos preenchidos). Falha em uma vaga
nao bloqueia o resto - so loga e segue.

Cuidado: Argos baixa modelo na 1a vez que ve cada par de idioma
(~250MB por par). Em servidor com pouca RAM, deixe sem --workers
(default 1) pra que so 1 modelo fique residente.

Exemplos:

    # ver quantas vagas precisariam de tratamento (dry-run)
    python -m scripts.backfill_enrichment --all --limit 1000 --dry-run

    # processa 200 vagas do LinkedIn (descontando JP/EN nao traduzidas)
    python -m scripts.backfill_enrichment --engine linkedin --limit 200

    # processa todas em chunks de 500
    python -m scripts.backfill_enrichment --all --chunk-size 500
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Iterable

# Suporta `python -m scripts.backfill_enrichment` a partir de apps/scraper/
HERE = os.path.dirname(os.path.abspath(__file__))
SCRAPER_ROOT = os.path.dirname(HERE)
sys.path.insert(0, SCRAPER_ROOT)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

import httpx  # noqa: E402

from src.utils.job_enrichment import enrich_sync  # noqa: E402


ENGINES = [
    "linkedin", "dice", "careerjet", "indeed", "catho", "infojobs",
    "bne", "geekhunter", "gupy", "jooble", "michaelpage", "programathor",
    "simplyhired", "remoteok", "remotive", "weworkremotely", "ziprecruiter",
]


def _supabase_creds() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
    )
    if not url or not key:
        sys.exit("ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no env.")
    return url, key


def fetch_pending(
    client: httpx.Client,
    url: str,
    key: str,
    engine: str | None,
    chunk_size: int,
) -> list[dict]:
    """Pega proxima pagina de vagas pendentes (description preenchida +
    description_lang ou responsibilities ainda NULL)."""
    # Vagas com description nao-nula e PELO MENOS um dos 2 campos NULL.
    # PostgREST: 'or' query.
    params = {
        "select": "id,job_url,job_title,description,source,description_lang,responsibilities",
        "description": "not.is.null",
        "or": "(description_lang.is.null,responsibilities.is.null)",
        "order": "scraped_at.desc",
        "limit": str(chunk_size),
    }
    if engine:
        params["source"] = f"eq.{engine}"
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    resp = client.get(f"{url}/rest/v1/jobs", params=params, headers=headers)
    resp.raise_for_status()
    return resp.json()


def update_job(
    client: httpx.Client,
    url: str,
    key: str,
    job_id: str,
    description_lang: str | None,
    responsibilities: str | None,
    description_pt: str | None = None,
) -> bool:
    """Atualiza 1 vaga. Devolve True em sucesso."""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload: dict[str, object] = {}
    payload["description_lang"] = description_lang or "unknown"
    if responsibilities is not None:
        payload["responsibilities"] = responsibilities
    # Quando a description foi traduzida pra PT (idioma original != pt),
    # sobrescreve a description original. Cliente sempre recebe PT.
    if description_pt and description_lang and description_lang not in ("pt", "unknown"):
        payload["description"] = description_pt
    resp = client.patch(
        f"{url}/rest/v1/jobs",
        params={"id": f"eq.{job_id}"},
        headers=headers,
        json=payload,
        timeout=30.0,
    )
    return resp.status_code in (200, 204)


def process_chunk(
    client: httpx.Client,
    url: str,
    key: str,
    jobs: Iterable[dict],
    dry_run: bool,
) -> dict[str, int]:
    """Processa N vagas, atualiza no banco (a menos que dry_run). Retorna
    contadores agregados."""
    stats = {
        "total": 0,
        "with_resp": 0,
        "without_resp": 0,
        "by_lang": {},
        "errors": 0,
    }
    for job in jobs:
        stats["total"] += 1
        title = job.get("job_title") or ""
        desc = job.get("description") or ""
        try:
            lang, resp, description_pt = enrich_sync(title, desc)
        except Exception as exc:  # noqa: BLE001
            print(f"  ERRO enrich job={job.get('id')} url={job.get('job_url')}: {exc}")
            stats["errors"] += 1
            continue

        lang_key = lang or "null"
        stats["by_lang"][lang_key] = stats["by_lang"].get(lang_key, 0) + 1
        if resp:
            stats["with_resp"] += 1
        else:
            stats["without_resp"] += 1

        if not dry_run:
            ok = update_job(
                client, url, key, job["id"], lang, resp, description_pt,
            )
            if not ok:
                stats["errors"] += 1
    return stats


def merge_stats(grand: dict, chunk: dict) -> None:
    grand["total"] += chunk["total"]
    grand["with_resp"] += chunk["with_resp"]
    grand["without_resp"] += chunk["without_resp"]
    grand["errors"] += chunk["errors"]
    for lang, cnt in chunk["by_lang"].items():
        grand["by_lang"][lang] = grand["by_lang"].get(lang, 0) + cnt


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Backfill description_lang + responsibilities")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--engine", choices=ENGINES, help="Processa so 1 engine")
    group.add_argument("--all", action="store_true", help="Processa qualquer engine")
    parser.add_argument(
        "--chunk-size", type=int, default=200,
        help="Quantas vagas por pagina (default 200)",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Para apos N vagas no total (default: roda ate esgotar)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    url, key = _supabase_creds()
    engine_filter = None if args.all else args.engine

    grand = {"total": 0, "with_resp": 0, "without_resp": 0, "errors": 0, "by_lang": {}}
    started = time.time()
    chunk_no = 0

    with httpx.Client(timeout=30.0) as client:
        while True:
            chunk_no += 1
            try:
                jobs = fetch_pending(client, url, key, engine_filter, args.chunk_size)
            except Exception as exc:  # noqa: BLE001
                print(f"ERRO buscar chunk {chunk_no}: {exc}")
                return 2

            if not jobs:
                break

            print(
                f"chunk {chunk_no}: {len(jobs)} vagas "
                f"(engine={engine_filter or 'all'}, dry_run={args.dry_run})",
                flush=True,
            )

            # Limita ao --limit total se setado
            if args.limit is not None:
                remaining = args.limit - grand["total"]
                if remaining <= 0:
                    break
                if len(jobs) > remaining:
                    jobs = jobs[:remaining]

            t0 = time.time()
            stats = process_chunk(client, url, key, jobs, args.dry_run)
            merge_stats(grand, stats)
            elapsed = time.time() - t0
            print(
                f"  -> processadas {stats['total']} em {elapsed:.1f}s "
                f"(with_resp={stats['with_resp']}, lang={stats['by_lang']}, err={stats['errors']})",
                flush=True,
            )

            if args.limit is not None and grand["total"] >= args.limit:
                break
            # Se nao estamos atualizando, a query nao "drena" - precisa parar
            # apos 1 chunk pra nao iterar infinitamente.
            if args.dry_run:
                break

    total_time = time.time() - started
    print("\n" + "=" * 60)
    print("RESUMO BACKFILL")
    print("=" * 60)
    print(f"  Total processado:   {grand['total']}")
    print(f"  Com responsibilities: {grand['with_resp']}")
    print(f"  Sem responsibilities: {grand['without_resp']} (ficam NULL)")
    print(f"  Erros:              {grand['errors']}")
    print(f"  Idiomas detectados: {grand['by_lang']}")
    print(f"  Tempo total:        {total_time:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())

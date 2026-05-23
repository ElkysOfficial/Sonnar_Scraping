"""Smoke test individual de uma engine (epico v3.0.0).

Le N vagas recentes do Supabase (tabela public.jobs) filtradas pela
engine, roda lang_detect + section_extractor (+ Argos translator
opcional) em cada uma, e imprime metricas + amostras.

Exemplos:

    # ver o que LinkedIn coleta hoje (sem traduzir)
    python -m scripts.validate_engine linkedin --limit 30

    # validar fluxo completo com traducao real (lento na 1a vez)
    python -m scripts.validate_engine dice --limit 10 --translate

    # saida JSON pra agregacao
    python -m scripts.validate_engine linkedin --json

Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no env.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

# Garante UTF-8 no stdout/stderr: amostras CJK quebrariam o cp1252 do Windows.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

# Roda como `python -m scripts.validate_engine` a partir de apps/scraper/
HERE = os.path.dirname(os.path.abspath(__file__))
SCRAPER_ROOT = os.path.dirname(HERE)
sys.path.insert(0, SCRAPER_ROOT)

import httpx  # noqa: E402

from src.utils.lang_detect import detect_lang  # noqa: E402
from src.utils.section_extractor import (  # noqa: E402
    clean_html,
    extract_responsibilities,
)


ENGINES = [
    "linkedin", "dice", "careerjet", "indeed", "catho", "infojobs",
    "bne", "geekhunter", "gupy", "jooble", "michaelpage", "programathor",
    "simplyhired", "remoteok", "remotive", "weworkremotely", "ziprecruiter",
]


def _short(s: str | None, n: int = 80) -> str:
    if not s:
        return "(empty)"
    cleaned = " ".join(s.split())
    return cleaned[:n] + ("..." if len(cleaned) > n else "")


def fetch_jobs(engine: str, limit: int) -> list[dict]:
    """Puxa as N vagas mais recentes da engine via PostgREST."""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
    )
    if not url or not key:
        sys.exit("ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no env.")
    params = {
        "select": (
            "job_title,description,description_lang,responsibilities,"
            "job_url,source"
        ),
        "source": f"eq.{engine}",
        "order": "scraped_at.desc",
        "limit": str(limit),
        "description": "not.is.null",
    }
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    with httpx.Client(timeout=15.0) as client:
        resp = client.get(f"{url}/rest/v1/jobs", params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()


def analyze_jobs(jobs: list[dict], translate: bool = False) -> list[dict]:
    """Processa cada vaga pelo pipeline e devolve a tabela de resultados."""
    translator_mod = None
    if translate:
        try:
            from src.utils import translator as translator_mod
        except Exception as e:  # noqa: BLE001
            print(f"AVISO: nao foi possivel importar translator ({e})", file=sys.stderr)
            translate = False

    rows = []
    for job in jobs:
        title = job.get("job_title") or ""
        desc = job.get("description") or ""
        full = f"{title}\n{desc}"
        lang = detect_lang(full)
        # section_extractor cobre so pt/en hoje. Pra outros, usa 'en' como
        # default (vai precisar passar pela traducao depois).
        lang_for_extract = lang if lang in ("pt", "en") else "en"
        resp = extract_responsibilities(desc, lang_for_extract)

        translated = None
        translate_err = None
        needs_trans = lang not in ("pt", "unknown")
        if translate and needs_trans and translator_mod is not None:
            # Limpa HTML antes de mandar pro tradutor pra nao acumular <br>
            # no output. resp ja vem limpo do section_extractor.
            src_text = resp or clean_html(desc)[:1500]
            try:
                translated = translator_mod.translate_to_pt(src_text, lang)
            except Exception as e:  # noqa: BLE001
                translate_err = str(e)

        rows.append({
            "title": _short(title, 70),
            "lang_detected": lang,
            "lang_in_db": job.get("description_lang"),
            "extracted": bool(resp),
            "extracted_chars": len(resp) if resp else 0,
            "desc_chars": len(desc),
            "responsibilities_sample": _short(resp, 200) if resp else None,
            "translated_sample": _short(translated, 220) if translated else None,
            "translate_error": translate_err,
            "needs_translation": needs_trans,
            "url": job.get("job_url"),
        })
    return rows


def summarize(rows: list[dict]) -> dict:
    """Agrega contadores prontos pra imprimir ou consumir em JSON."""
    total = len(rows)
    by_lang: dict[str, int] = {}
    extracted = 0
    needing_trans = 0
    translated_ok = 0
    translate_errors = 0
    for r in rows:
        by_lang[r["lang_detected"]] = by_lang.get(r["lang_detected"], 0) + 1
        if r["extracted"]:
            extracted += 1
        if r["needs_translation"]:
            needing_trans += 1
            if r["translated_sample"]:
                translated_ok += 1
            elif r["translate_error"]:
                translate_errors += 1
    return {
        "total": total,
        "by_lang": by_lang,
        "extracted": extracted,
        "extracted_pct": round(extracted / total * 100, 1) if total else 0.0,
        "needing_translation": needing_trans,
        "translated_ok": translated_ok,
        "translate_errors": translate_errors,
    }


def print_human(engine: str, rows: list[dict], summary: dict) -> None:
    print(f"\n== AMOSTRAS de {engine} ({summary['total']} vagas) ==\n")
    for i, r in enumerate(rows[:10], 1):
        print(f"{i:>2}. [{r['lang_detected']}] {r['title']}")
        print(
            f"    extracted={r['extracted']} "
            f"({r['extracted_chars']}/{r['desc_chars']} chars)"
        )
        if r["responsibilities_sample"]:
            print(f"    resp: {r['responsibilities_sample']}")
        if r["translated_sample"]:
            print(f"    PT:   {r['translated_sample']}")
        if r["translate_error"]:
            print(f"    ERR translate: {r['translate_error']}")
        print()

    print(f"== RESUMO de {engine} ==")
    print(f"  Total:           {summary['total']}")
    print(f"  Idiomas:         {summary['by_lang']}")
    print(
        f"  Extracted:       {summary['extracted']}/{summary['total']} "
        f"({summary['extracted_pct']}%)"
    )
    if summary["needing_translation"]:
        ok = summary["translated_ok"]
        tot = summary["needing_translation"]
        pct = round(ok / tot * 100, 1) if tot else 0.0
        print(f"  Traduzidas:      {ok}/{tot} ({pct}%)")
        if summary["translate_errors"]:
            print(f"  Erros traducao:  {summary['translate_errors']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Smoke test de uma engine")
    parser.add_argument("engine", choices=ENGINES)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument(
        "--translate",
        action="store_true",
        help="Chama o Argos translator nas vagas nao-pt (lento na 1a vez)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Saida JSON pra agregacao em scripts maiores",
    )
    args = parser.parse_args(argv)

    jobs = fetch_jobs(args.engine, args.limit)
    if not jobs:
        sys.exit(f"Nenhuma vaga encontrada para source={args.engine}")

    rows = analyze_jobs(jobs, translate=args.translate)
    summary = summarize(rows)

    if args.json:
        print(json.dumps(
            {
                "engine": args.engine,
                **summary,
                "sample": rows[:5],
            },
            indent=2,
            ensure_ascii=False,
        ))
    else:
        print_human(args.engine, rows, summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())

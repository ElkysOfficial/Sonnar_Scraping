"""Smoke test em grupo (epico v3.0.0).

Roda validate_engine pra cada engine listada e agrega as metricas num
unico relatorio. Pula engines sem vagas no banco.

Exemplos:

    # todas as engines, 10 vagas cada, sem traduzir (rapido)
    python -m scripts.validate_engines --limit 10

    # subset com traducao real
    python -m scripts.validate_engines --engines linkedin dice --translate

    # saida JSON pra integracao
    python -m scripts.validate_engines --json
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRAPER_ROOT = os.path.dirname(HERE)
sys.path.insert(0, SCRAPER_ROOT)

from scripts.validate_engine import ENGINES  # noqa: E402


def run_engine(engine: str, limit: int, translate: bool) -> dict | None:
    """Roda validate_engine em subprocess e devolve o JSON. None em erro."""
    cmd = [
        sys.executable, "-m", "scripts.validate_engine", engine,
        "--limit", str(limit), "--json",
    ]
    if translate:
        cmd.append("--translate")
    out = subprocess.run(cmd, capture_output=True, text=True, cwd=SCRAPER_ROOT)
    if out.returncode != 0:
        msg = out.stderr.strip() or out.stdout.strip()
        print(f"  ERRO em {engine}: {msg[:200]}", flush=True)
        return None
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        print(f"  ERRO parsing JSON de {engine}: {out.stdout[:200]}", flush=True)
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Smoke em grupo de engines")
    parser.add_argument("--engines", nargs="*", default=None, choices=ENGINES)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--translate", action="store_true")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Saida JSON com relatorio agregado",
    )
    args = parser.parse_args(argv)
    target_engines = args.engines or ENGINES

    per_engine: dict[str, dict] = {}
    for eng in target_engines:
        print(f">>> {eng}", flush=True)
        data = run_engine(eng, args.limit, args.translate)
        if data is not None:
            per_engine[eng] = data

    # Agrega
    grand_total = 0
    grand_extracted = 0
    grand_needing = 0
    grand_translated = 0
    grand_by_lang: dict[str, int] = {}
    for d in per_engine.values():
        grand_total += d["total"]
        grand_extracted += d["extracted"]
        grand_needing += d["needing_translation"]
        grand_translated += d["translated_ok"]
        for lang, cnt in d["by_lang"].items():
            grand_by_lang[lang] = grand_by_lang.get(lang, 0) + cnt

    report = {
        "engines": {
            eng: {
                "total": d["total"],
                "by_lang": d["by_lang"],
                "extracted_pct": d["extracted_pct"],
                "needing_translation": d["needing_translation"],
                "translated_ok": d["translated_ok"],
            }
            for eng, d in per_engine.items()
        },
        "grand": {
            "total": grand_total,
            "by_lang": grand_by_lang,
            "extracted": grand_extracted,
            "extracted_pct": (
                round(grand_extracted / grand_total * 100, 1)
                if grand_total else 0.0
            ),
            "needing_translation": grand_needing,
            "translated_ok": grand_translated,
        },
    }

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0

    print()
    print("=" * 72)
    print("RESUMO GERAL")
    print("=" * 72)
    for eng, d in per_engine.items():
        print(
            f"  {eng:<14} {d['total']:>3} vagas | "
            f"extracted={d['extracted_pct']:>5}% | "
            f"langs={d['by_lang']}"
        )
    g = report["grand"]
    print()
    print(f"  TOTAL:       {g['total']} vagas")
    print(f"  Idiomas:     {g['by_lang']}")
    print(
        f"  Extracted:   {g['extracted']}/{g['total']} "
        f"({g['extracted_pct']}%)"
    )
    if g["needing_translation"]:
        pct = round(
            g["translated_ok"] / g["needing_translation"] * 100, 1
        ) if g["needing_translation"] else 0.0
        print(
            f"  Traduzidas:  {g['translated_ok']}/{g['needing_translation']} "
            f"({pct}%)"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())

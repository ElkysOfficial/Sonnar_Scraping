"""
Harness de auditoria - testa cada engine isoladamente.
Captura: count, tempo, sample (1ª vaga), exceção.
Uso:
  python test_engines.py            # todas
  python test_engines.py bne gupy   # só essas
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
import traceback
from importlib import import_module

ENGINES = [
    "bne", "careerjet", "catho", "dice", "geekhunter", "gupy",
    "indeed", "infojobs", "jooble", "linkedin", "michaelpage",
    "programathor", "remoteok", "remotive",
    "simplyhired", "weworkremotely", "ziprecruiter",
]

PER_ENGINE_TIMEOUT = int(os.getenv("ENGINE_TIMEOUT", "1800"))  # 30 min por engine (tunável)


async def run_engine(name: str) -> dict:
    started = time.monotonic()
    try:
        mod = import_module(f"src.engines.{name}")
        getter = getattr(mod, f"get_{name}_jobs")
    except Exception as e:
        return {
            "engine": name, "status": "import_error",
            "error": f"{type(e).__name__}: {e}",
            "count": 0, "elapsed": 0.0, "sample": None,
            "trace": traceback.format_exc(),
        }

    try:
        result = await asyncio.wait_for(getter(), timeout=PER_ENGINE_TIMEOUT)
    except asyncio.TimeoutError:
        return {
            "engine": name, "status": "timeout",
            "error": f"timeout > {PER_ENGINE_TIMEOUT}s",
            "count": 0, "elapsed": time.monotonic() - started, "sample": None,
            "trace": "",
        }
    except Exception as e:
        return {
            "engine": name, "status": "runtime_error",
            "error": f"{type(e).__name__}: {e}",
            "count": 0, "elapsed": time.monotonic() - started, "sample": None,
            "trace": traceback.format_exc(),
        }

    elapsed = time.monotonic() - started

    # Normaliza: pode ser list de tuples ou dict
    items = list(result.values()) if isinstance(result, dict) else list(result or [])
    sample = items[0] if items else None

    return {
        "engine": name,
        "status": "ok" if items else "empty",
        "count": len(items),
        "elapsed": elapsed,
        "sample": sample,
        "error": None if items else "retornou 0 vagas",
        "trace": "",
    }


def fmt_sample(sample) -> str:
    if sample is None:
        return "-"
    if isinstance(sample, tuple):
        # tuple típica: (url, title, company, location, work_type, regime, salary, date)
        text = " | ".join(str(x)[:40] for x in sample[:4])
        return f"({len(sample)} cols) {text}"
    if isinstance(sample, dict):
        return f"dict keys={list(sample.keys())[:5]}"
    return repr(sample)[:120]


async def main(targets):
    engines = targets if targets else ENGINES
    results = []
    for name in engines:
        print(f"\n{'='*70}\n>>> {name}", flush=True)
        r = await run_engine(name)
        results.append(r)
        status = r["status"]
        emoji = {"ok": "OK", "empty": "EMPTY", "timeout": "TIMEOUT",
                 "runtime_error": "RUNTIME_ERR", "import_error": "IMPORT_ERR"}.get(status, "??")
        print(f"  [{emoji}] count={r['count']} elapsed={r['elapsed']:.1f}s")
        if r["error"]:
            print(f"  error: {r['error']}")
        if r["sample"]:
            print(f"  sample: {fmt_sample(r['sample'])}")
        if r["trace"] and status in ("runtime_error", "import_error"):
            print("  trace (head):")
            for line in r["trace"].splitlines()[-10:]:
                print(f"    {line}")

    # Sumário final
    print("\n" + "=" * 70)
    print("SUMÁRIO DA AUDITORIA")
    print("=" * 70)
    print(f"{'engine':<16} {'status':<14} {'count':>6} {'tempo':>8}  {'erro':<40}")
    print("-" * 90)
    for r in results:
        err = (r["error"] or "")[:40]
        print(f"{r['engine']:<16} {r['status']:<14} {r['count']:>6} {r['elapsed']:>7.1f}s  {err:<40}")

    ok = [r for r in results if r["status"] == "ok"]
    empty = [r for r in results if r["status"] == "empty"]
    broken = [r for r in results if r["status"] in ("runtime_error", "timeout", "import_error")]
    print(f"\nTotais: {len(ok)} OK | {len(empty)} VAZIO | {len(broken)} QUEBRADO | {sum(r['count'] for r in results)} vagas total")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))

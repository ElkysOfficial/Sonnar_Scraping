"""
Script para limpar valores invalidos do cache do Google Enricher.
Execute: python -m data_collection.src.utils.clean_cache
"""
import json
import os
import re

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE_PATH = os.path.join(DATA_DIR, "google_cache.json")


def to_int(value: str) -> int:
    numeric = re.sub(r"[.,]", "", value)
    return int(numeric) if numeric.isdigit() else 0


def is_valid_salary(min_salary: str, max_salary: str) -> bool:
    min_value = to_int(min_salary)
    max_value = to_int(max_salary)
    if min_value <= 0 or max_value <= 0:
        return False
    # Salario realista para vagas de tech no Brasil (2000 a 80000 BRL)
    if min_value < 2000 or max_value < 2000:
        return False
    if min_value > 80000 or max_value > 80000:
        return False
    if max_value > min_value * 3:
        return False
    return True


def clean_cache():
    if not os.path.exists(CACHE_PATH):
        print("Cache nao encontrado.")
        return

    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        cache = json.load(f)

    salary_cache = cache.get("salary_by_company_role", {})

    invalid_entries = []
    valid_entries = {}

    for key, value in salary_cache.items():
        if "|" in value:
            min_sal, max_sal = value.split("|", 1)
        else:
            min_sal = max_sal = value

        if is_valid_salary(min_sal, max_sal):
            valid_entries[key] = value
        else:
            invalid_entries.append((key, value, min_sal, max_sal))

    print(f"Total de entradas no cache: {len(salary_cache)}")
    print(f"Entradas validas: {len(valid_entries)}")
    print(f"Entradas invalidas: {len(invalid_entries)}")
    print()

    if invalid_entries:
        print("Entradas invalidas encontradas:")
        print("-" * 60)
        for key, value, min_sal, max_sal in invalid_entries[:20]:
            min_val = to_int(min_sal)
            max_val = to_int(max_sal)
            reason = ""
            if min_val < 2000:
                reason = "min < 2000"
            elif max_val > 80000:
                reason = "max > 80000"
            elif max_val > min_val * 3:
                reason = "range > 3x"
            print(f"  {key}: {value} ({reason})")

        if len(invalid_entries) > 20:
            print(f"  ... e mais {len(invalid_entries) - 20} entradas")
        print()

        # Atualizar o cache
        cache["salary_by_company_role"] = valid_entries

        # Fazer backup
        backup_path = CACHE_PATH + ".backup"
        with open(backup_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
        print(f"Backup salvo em: {backup_path}")

        # Salvar cache limpo
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
        print(f"Cache limpo salvo em: {CACHE_PATH}")
        print(f"Removidas {len(invalid_entries)} entradas invalidas.")
    else:
        print("Nenhuma entrada invalida encontrada.")


if __name__ == "__main__":
    clean_cache()

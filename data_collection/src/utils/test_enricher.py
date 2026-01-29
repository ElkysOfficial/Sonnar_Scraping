"""
Testes para validar as funções do Google Enricher.
Execute: python -m data_collection.src.utils.test_enricher
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.utils.google_enricher import _is_valid_salary_range, _parse_salary_text


def test_salary_validation():
    """Testa a validação de ranges de salário."""
    print("=" * 60)
    print("TESTE: _is_valid_salary_range")
    print("=" * 60)

    test_cases = [
        # (min, max, expected, description)
        ("500", "500", False, "Salário muito baixo (500)"),
        ("1500", "1500", False, "Salário abaixo do mínimo (1500)"),
        ("2000", "2000", True, "Salário mínimo válido (2000)"),
        ("5000", "8000", True, "Range válido junior/pleno"),
        ("10000", "15000", True, "Range válido pleno/senior"),
        ("20000", "30000", True, "Range válido senior/lead"),
        ("50000", "80000", True, "Range válido diretor"),
        ("90000", "100000", False, "Salário acima do máximo"),
        ("390000", "390000", False, "Salário absurdo (390k)"),
        ("72600", "72600", True, "Salário alto mas válido"),
        ("5000", "50000", False, "Range muito amplo (10x)"),
        ("10000", "25000", True, "Range aceitável (2.5x)"),
    ]

    all_passed = True
    for min_sal, max_sal, expected, desc in test_cases:
        result = _is_valid_salary_range(min_sal, max_sal)
        status = "[PASS]" if result == expected else "[FAIL]"
        if result != expected:
            all_passed = False
        print(f"{status}: {desc}")
        print(f"       Input: min={min_sal}, max={max_sal}")
        print(f"       Expected: {expected}, Got: {result}")
        print()

    return all_passed


def test_salary_parsing():
    """Testa o parsing de texto de salário."""
    print("=" * 60)
    print("TESTE: _parse_salary_text")
    print("=" * 60)

    test_cases = [
        # (text, expected_result, description)
        ("R$ 5.000 - R$ 8.000", ("5.000", "8.000"), "Range normal"),
        ("R$ 500", None, "Valor muito baixo"),
        ("R$ 10.000", ("10.000", "10.000"), "Valor único válido"),
        ("R$ 390.000", None, "Valor absurdamente alto"),
        ("R$ 50.000 - R$ 80.000", ("50.000", "80.000"), "Range alto válido"),
        ("Salário de R$ 3.000 reais", ("3.000", "3.000"), "Texto com salário embutido"),
        ("O salário é R$ 100.000 por mês", None, "Salário acima do limite"),
        ("glassdoor diz R$ 15.000 a R$ 25.000", ("15.000", "25.000"), "Texto Glassdoor"),
    ]

    all_passed = True
    for text, expected, desc in test_cases:
        result = _parse_salary_text(text)
        status = "[PASS]" if result == expected else "[FAIL]"
        if result != expected:
            all_passed = False
        print(f"{status}: {desc}")
        print(f"       Input: '{text}'")
        print(f"       Expected: {expected}, Got: {result}")
        print()

    return all_passed


def main():
    print("\n" + "=" * 60)
    print("TESTES DO GOOGLE ENRICHER")
    print("=" * 60 + "\n")

    test1 = test_salary_validation()
    test2 = test_salary_parsing()

    print("=" * 60)
    print("RESULTADO FINAL")
    print("=" * 60)

    if test1 and test2:
        print("[OK] Todos os testes passaram!")
        return 0
    else:
        print("[ERRO] Alguns testes falharam.")
        return 1


if __name__ == "__main__":
    sys.exit(main())

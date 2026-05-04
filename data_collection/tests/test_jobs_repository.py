"""Testes para helpers de jobs_repository: _parse_salary_range e _parse_date."""
import pytest

from src.persistence.jobs_repository import _parse_salary_range, _parse_date


class TestParseSalaryRange:
    @pytest.mark.parametrize("text,expected", [
        ("R$ 8.000 - R$ 12.000", (8000, 12000)),
        ("R$ 5.000", (5000, 5000)),
        ("R$ 10.000,00", (10000, 10000)),
        ("R$ 8.000,00 - R$ 12.000,00", (8000, 12000)),
        ("R$ 3.500 a R$ 7.000", (3500, 7000)),
    ])
    def test_brazilian_format(self, text, expected):
        assert _parse_salary_range(text) == expected

    @pytest.mark.parametrize("text", [
        "",
        None,
        "a combinar",
        "salario nao informado",
    ])
    def test_no_numbers_or_empty(self, text):
        assert _parse_salary_range(text) == (None, None)

    def test_filters_noise_too_low(self):
        # valores < 500 são considerados ruído (ex.: ano 2024 numa string)
        assert _parse_salary_range("vaga publicada em 2024") == (None, None)

    def test_filters_noise_too_high(self):
        # > 200000 é considerado ruído
        assert _parse_salary_range("R$ 500.000.000") == (None, None)

    def test_single_value_returns_min_eq_max(self):
        result = _parse_salary_range("R$ 7.500")
        assert result == (7500, 7500)

    def test_returns_min_max_from_multiple_values(self):
        result = _parse_salary_range("entre R$ 4.000 e R$ 9.500")
        assert result == (4000, 9500)

    def test_non_string_input(self):
        assert _parse_salary_range(12345) == (None, None)
        assert _parse_salary_range([]) == (None, None)


class TestParseDate:
    @pytest.mark.parametrize("text,expected", [
        ("2026-04-13", "2026-04-13"),
        ("2026-04-13T10:30:00", "2026-04-13"),
        ("2026-04-13 extra noise", "2026-04-13"),
    ])
    def test_iso_format(self, text, expected):
        assert _parse_date(text) == expected

    @pytest.mark.parametrize("text,expected", [
        ("13/04/2026", "2026-04-13"),
        ("01/01/2026", "2026-01-01"),
        ("31/12/2025", "2025-12-31"),
    ])
    def test_brazilian_format(self, text, expected):
        assert _parse_date(text) == expected

    @pytest.mark.parametrize("text,expected", [
        ("2026/04/13", "2026-04-13"),
        ("13-04-2026", "2026-04-13"),
    ])
    def test_alternative_separators(self, text, expected):
        assert _parse_date(text) == expected

    @pytest.mark.parametrize("text", ["", None, "   ", "data invalida", "abc"])
    def test_invalid_inputs(self, text):
        assert _parse_date(text) is None

    def test_non_string_input_coerced(self):
        # _parse_date faz str(value) - datetime/date deveriam funcionar via repr
        assert _parse_date(12345) is None  # "12345" não bate em nenhum formato

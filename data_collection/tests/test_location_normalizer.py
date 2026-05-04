"""Testes para normalize_location — heurística (state_code, country_code)."""
import pytest

from src.persistence.location_normalizer import normalize_location


class TestBrazilianStates:
    @pytest.mark.parametrize("raw,expected", [
        ("Sao Paulo - SP", ("SP", "BR")),
        ("São Paulo - SP", ("SP", "BR")),
        ("Rio de Janeiro - RJ", ("RJ", "BR")),
        ("Rio de Janeiro, RJ, Brasil", ("RJ", "BR")),
        ("Belo Horizonte - MG", ("MG", "BR")),
        ("Curitiba/PR", ("PR", "BR")),
        ("Florianopolis, SC", ("SC", "BR")),
        ("Porto Alegre - RS", ("RS", "BR")),
        ("Brasilia - DF", ("DF", "BR")),
    ])
    def test_uf_with_dash(self, raw, expected):
        assert normalize_location(raw) == expected

    @pytest.mark.parametrize("raw,expected_uf", [
        ("Trabalho em Sao Paulo", "SP"),
        ("Vaga em Minas Gerais", "MG"),
        ("Localizada no Rio Grande do Sul", "RS"),
        ("Empresa de Santa Catarina", "SC"),
    ])
    def test_uf_by_full_name(self, raw, expected_uf):
        state, country = normalize_location(raw)
        assert state == expected_uf
        assert country == "BR"


class TestForeignCountries:
    @pytest.mark.parametrize("raw,expected_country", [
        ("Lisboa, Portugal", "PT"),
        ("Remote - United States", "US"),
        ("New York, USA", "US"),
        ("London, United Kingdom", "GB"),
        ("Berlin, Germany", "DE"),
        ("Madrid, Spain", "ES"),
        ("Paris, France", "FR"),
        ("Toronto, Canada", "CA"),
        ("Buenos Aires, Argentina", "AR"),
    ])
    def test_country_detection(self, raw, expected_country):
        state, country = normalize_location(raw)
        assert country == expected_country
        assert state is None


class TestEdgeCases:
    @pytest.mark.parametrize("raw", ["", "   ", None])
    def test_empty_inputs(self, raw):
        assert normalize_location(raw) == (None, None)

    @pytest.mark.parametrize("raw", [
        "Remote",
        "remoto",
        "Home Office",
        "Anywhere",
        "Worldwide",
    ])
    def test_remote_without_location(self, raw):
        # remoto puro não dá pra atribuir país
        assert normalize_location(raw) == (None, None)

    def test_uf_takes_precedence_over_country_keyword(self):
        # mesmo com "Brasil" no texto, a UF é o que vale
        assert normalize_location("Sao Paulo - SP, Brasil") == ("SP", "BR")

    def test_unknown_location(self):
        # localidade desconhecida não deve crashar
        result = normalize_location("Cidade Inventada Z9")
        assert isinstance(result, tuple)
        assert len(result) == 2

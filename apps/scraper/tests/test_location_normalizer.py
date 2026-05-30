"""Testes para normalize_location - heurística (state_code, country_code)."""
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


class TestUSStates:
    @pytest.mark.parametrize("raw,expected", [
        ("Pittsburgh, PA, US", ("PA", "US")),
        ("San Diego, CA, US", ("CA", "US")),
        ("New York, NY, US", ("NY", "US")),
        ("Dallas, TX, US", ("TX", "US")),
        ("Atlanta, GA, US", ("GA", "US")),
    ])
    def test_us_state_with_city(self, raw, expected):
        assert normalize_location(raw) == expected

    @pytest.mark.parametrize("raw,expected", [
        # Sem cidade: ainda deve detectar state pelo country code explicito.
        # Caso comum no Dice quando a vaga eh 100% remota.
        ("PA, US", ("PA", "US")),
        ("CA, US", ("CA", "US")),
        ("NY, US", ("NY", "US")),
        ("Remote in PA, US", ("PA", "US")),
        ("Remote in CA, US", ("CA", "US")),
    ])
    def test_us_state_without_city(self, raw, expected):
        assert normalize_location(raw) == expected


class TestForeignCountries:
    @pytest.mark.parametrize("raw,expected_country", [
        ("Lisboa, Portugal", "PT"),
        ("Remote - United States", "US"),
        ("Boston, USA", "US"),
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


class TestGermanLander:
    """v3.10.3: CareerJet entrega "Cidade - Land" para vagas alemas.
    Mapeia o Bundesland pra ISO 3166-2:DE-* (BY, BW, NW, ...)."""

    @pytest.mark.parametrize("raw,expected", [
        ("Stuttgart - Baden-Württemberg", ("BW", "DE")),
        ("München - Bayern", ("BY", "DE")),
        ("Köln - Nordrhein-Westfalen", ("NW", "DE")),
        ("Dresden - Sachsen", ("SN", "DE")),
        ("Magdeburg - Sachsen-Anhalt", ("ST", "DE")),
        ("Erfurt - Thüringen", ("TH", "DE")),
        ("Darmstadt - Hessen", ("HE", "DE")),
        ("Konstanz - Baden-Württemberg", ("BW", "DE")),
        ("Bad Tölz - Bayern", ("BY", "DE")),
    ])
    def test_cidade_land(self, raw, expected):
        assert normalize_location(raw) == expected

    @pytest.mark.parametrize("raw", [
        "Berlin", "Hamburg", "Bremen",  # Stadtstaaten
        "München", "Frankfurt", "Dresden", "Köln", "Düsseldorf",
    ])
    def test_cidade_alema_so(self, raw):
        state, country = normalize_location(raw)
        assert country == "DE"


class TestUKSubdivisions:
    """v3.10.0: ZipRecruiter UK entrega 'Cidade, REGIAO, GB' — mapeia a
    subdivisao ISO 3166-2:GB-* pra state_code dedicado."""

    @pytest.mark.parametrize("raw,expected", [
        ("London, ENG, GB", ("ENG", "GB")),
        ("Edinburgh, SCT, GB", ("SCT", "GB")),
        ("Cardiff, WLS, GB", ("WLS", "GB")),
        ("Belfast, NIR, GB", ("NIR", "GB")),
        ("manchester, eng, gb", ("ENG", "GB")),  # case-insensitive
    ])
    def test_uk_subdivision(self, raw, expected):
        assert normalize_location(raw) == expected


class TestEdgeCases:
    @pytest.mark.parametrize("raw", ["", "   ", None])
    def test_empty_inputs(self, raw):
        assert normalize_location(raw) == (None, None)

    @pytest.mark.parametrize("raw", [
        "Home Office",  # nao explicitamente worldwide
    ])
    def test_remote_without_location_no_country(self, raw):
        # tokens vagos que nao casam com nada -> (None, None)
        assert normalize_location(raw) == (None, None)

    @pytest.mark.parametrize("raw", [
        "Remote",
        "remoto",
        "Anywhere",
        "Worldwide",
        "Global",
        "Anywhere in the World",
        "LATAM",
        "EMEA",
        "Americas, Europe, Asia, Oceania",
    ])
    def test_worldwide_strings_return_ww(self, raw):
        """v3.10.13: vagas explicitamente globais sao marcadas com country_code='WW'."""
        state, country = normalize_location(raw)
        assert country == "WW"
        assert state is None

    def test_uf_takes_precedence_over_country_keyword(self):
        # mesmo com "Brasil" no texto, a UF é o que vale
        assert normalize_location("Sao Paulo - SP, Brasil") == ("SP", "BR")

    def test_unknown_location(self):
        # localidade desconhecida não deve crashar
        result = normalize_location("Cidade Inventada Z9")
        assert isinstance(result, tuple)
        assert len(result) == 2

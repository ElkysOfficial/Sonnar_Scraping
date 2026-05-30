"""Testes do parser de cards do ZipRecruiter (v3.10.0).

Valida que ``parse_card`` extrai todos os campos criticos para a meta
de 95% de cobertura por campo. Usa fixture HTML real coletada em
2026-05-30.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime

import pytest
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from engines.ziprecruiter import parse_card, _parse_relative_date  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "ziprecruiter_listing.html")


@pytest.fixture(scope="module")
def cards():
    with open(FIXTURE, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")
    return soup.find_all("div", class_="jobList-introWrap")


def test_fixture_has_cards(cards):
    assert len(cards) >= 3, "fixture deve ter pelo menos 3 cards"


def test_parser_extrai_todos_campos_em_todos_os_cards(cards):
    """Meta 95%: cada campo critico precisa ter > 95% de extracao."""
    n = len(cards)
    counts = {
        "link": 0, "title": 0, "company": 0, "location_raw": 0,
        "work_type": 0, "hiring_regime": 0, "publication_date": 0,
        "description": 0,
    }
    today = datetime(2026, 5, 30)
    for w in cards:
        p = parse_card(w, today=today)
        assert p is not None, "card valido deve produzir dict"
        for k in counts:
            v = p.get(k)
            if v not in (None, "", []):
                counts[k] += 1

    for field, c in counts.items():
        pct = c / n
        assert pct >= 0.95, f"campo {field}: {c}/{n} = {pct:.0%} < 95%"


def test_parse_card_company_nao_e_link(cards):
    """Empresa vem do <li> com fa-building, nao de um <a>."""
    p = parse_card(cards[0], today=datetime(2026, 5, 30))
    assert p["company"]
    # company nao deve ser uma URL nem conter "alertsclk"
    assert "http" not in p["company"].lower()
    assert "alertsclk" not in p["company"].lower()


def test_parse_card_location_no_formato_uk(cards):
    """Location vem como 'Cidade, REGIAO, GB' tipico do site UK."""
    locations = [parse_card(w, today=datetime(2026, 5, 30))["location_raw"] for w in cards]
    # pelo menos 1 deve ter o formato com sigla UK
    assert any("GB" in loc or "UK" in loc.upper() for loc in locations if loc), (
        f"esperava ao menos 1 location UK: {locations}"
    )


def test_parse_card_link_aceita_redirect_alertsclk(cards):
    """ZipRecruiter usa redirect alertsclk.com — mantemos como job_url."""
    p = parse_card(cards[0], today=datetime(2026, 5, 30))
    assert p["link"].startswith("http")


def test_parse_card_publication_date_fallback_hoje():
    """Quando o card nao tem data, parser usa today como fallback."""
    html = """<div class="jobList-introWrap">
      <div class="jobList-intro">
        <a class="jobList-title" href="https://x.com/y"><strong>Dev</strong></a>
        <ul class="jobList-introMeta">
          <li><i class="fa-building"></i>Acme</li>
          <li><i class="fa-map-marker-alt"></i>London, ENG, GB</li>
        </ul>
        <div class="jobList-description">Snippet</div>
      </div>
    </div>"""
    wrap = BeautifulSoup(html, "html.parser").find("div", class_="jobList-introWrap")
    p = parse_card(wrap, today=datetime(2026, 5, 30))
    assert p["publication_date"] == "30/05/2026"


def test_parse_card_publication_date_relativa():
    """Quando card tem '3 days ago', converte pra data absoluta."""
    html = """<div class="jobList-introWrap">
      <a class="jobList-title" href="https://x.com/y"><strong>Dev</strong></a>
      <ul class="jobList-introMeta">
        <li><i class="fa-building"></i>Acme</li>
        <li><i class="fa-map-marker-alt"></i>London, ENG, GB</li>
        <li><i class="fa-clock"></i>3 days ago</li>
      </ul>
    </div>"""
    wrap = BeautifulSoup(html, "html.parser").find("div", class_="jobList-introWrap")
    p = parse_card(wrap, today=datetime(2026, 5, 30))
    assert p["publication_date"] == "27/05/2026"


def test_parse_card_sem_titulo_retorna_none():
    html = """<div class="jobList-introWrap">
      <a class="jobList-title" href="https://x.com/y"></a>
    </div>"""
    wrap = BeautifulSoup(html, "html.parser").find("div", class_="jobList-introWrap")
    assert parse_card(wrap) is None


def test_parse_card_sem_link_retorna_none():
    html = """<div class="jobList-introWrap">
      <a class="jobList-title"><strong>Dev</strong></a>
    </div>"""
    wrap = BeautifulSoup(html, "html.parser").find("div", class_="jobList-introWrap")
    assert parse_card(wrap) is None


def test_inferir_remote_pelo_titulo():
    html = """<div class="jobList-introWrap">
      <a class="jobList-title" href="https://x.com/y"><strong>Senior Python — Remote</strong></a>
      <ul class="jobList-introMeta">
        <li><i class="fa-building"></i>Acme</li>
        <li><i class="fa-map-marker-alt"></i>UK</li>
      </ul>
    </div>"""
    wrap = BeautifulSoup(html, "html.parser").find("div", class_="jobList-introWrap")
    p = parse_card(wrap, today=datetime(2026, 5, 30))
    assert p["work_type"] == "Remoto"


def test_inferir_regime_contract():
    html = """<div class="jobList-introWrap">
      <a class="jobList-title" href="https://x.com/y"><strong>Python Contractor</strong></a>
      <ul class="jobList-introMeta">
        <li><i class="fa-building"></i>Acme</li>
        <li><i class="fa-map-marker-alt"></i>London, ENG, GB</li>
      </ul>
    </div>"""
    wrap = BeautifulSoup(html, "html.parser").find("div", class_="jobList-introWrap")
    p = parse_card(wrap, today=datetime(2026, 5, 30))
    assert p["hiring_regime"] == "Contractor"


@pytest.mark.parametrize("text,expected_offset_days", [
    ("today", 0),
    ("yesterday", 1),
    ("3 days ago", 3),
    ("1 week ago", 7),
    ("2 weeks ago", 14),
])
def test_parse_relative_date_formats(text, expected_offset_days):
    """Smoke test do helper de data relativa."""
    result = _parse_relative_date(text)
    assert result, f"vazio para {text!r}"
    # checa que a saida bate com hoje - offset
    from datetime import datetime, timedelta
    expected = (datetime.now() - timedelta(days=expected_offset_days)).strftime("%d/%m/%Y")
    assert result == expected

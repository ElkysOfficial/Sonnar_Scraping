"""Testes do parser RSS do WeWorkRemotely (v3.10.2)."""
from __future__ import annotations

import os
import sys
import xml.etree.ElementTree as ET

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from engines.weworkremotely import (  # noqa: E402
    _parse_job_item,
    _extract_location,
    _extract_hiring_regime,
    _parse_rfc822_date,
)


def _build_item(title="Acme: Senior Python Developer",
                link="https://weworkremotely.com/remote-jobs/acme-x",
                pub="Mon, 13 May 2024 03:14:30 +0000",
                region="United States",
                description="<p><strong>Headquarters:</strong> Brooklyn, NY<br/>...</p>"):
    xml = f"""<item>
        <title>{title}</title>
        <link>{link}</link>
        <pubDate>{pub}</pubDate>
        <region>{region}</region>
        <description><![CDATA[{description}]]></description>
    </item>"""
    return ET.fromstring(xml)


def test_extrai_location_de_headquarters():
    item = _build_item(
        region="Anywhere in the World",
        description="<p><strong>Headquarters:</strong> Brooklyn, NY<br/>URL:...</p>",
    )
    assert _extract_location(item, "<p><strong>Headquarters:</strong> Brooklyn, NY<br/>URL:...</p>") == "Brooklyn, NY"


def test_prefere_hq_sobre_region():
    item = _build_item(region="United States",
                       description="Headquarters: Berlin, Germany. URL: x")
    assert _extract_location(item, "Headquarters: Berlin, Germany. URL: x") == "Berlin, Germany"


def test_usa_region_se_nao_tem_hq():
    item = _build_item(region="Brazil", description="No HQ here")
    assert _extract_location(item, "No HQ here") == "Brazil"


def test_fallback_worldwide_quando_hq_remoto():
    item = _build_item(region="Anywhere in the World",
                       description="Headquarters: Remote. URL: x")
    # HQ Remote -> rejeita -> region anywhere -> rejeita -> Worldwide
    assert _extract_location(item, "Headquarters: Remote. URL: x") == "Worldwide"


def test_fallback_worldwide_sem_hq_e_anywhere():
    item = _build_item(region="Anywhere in the World", description="")
    assert _extract_location(item, "") == "Worldwide"


def test_parse_item_extrai_company_do_titulo():
    item = _build_item(title="Acme Corp: Senior Python Developer")
    parsed = _parse_job_item(item)
    assert parsed is not None
    assert parsed[2] == "Acme Corp"
    assert "Senior Python Developer" in parsed[1]


def test_parse_item_filtra_nao_tech():
    item = _build_item(title="Acme: Marketing Manager Wanted")
    assert _parse_job_item(item) is None


def test_parse_item_canonical_tem_10_campos():
    item = _build_item()
    parsed = _parse_job_item(item)
    assert isinstance(parsed, list)
    assert len(parsed) == 10
    link, title, company, location, work_type, regime, salary, date, skills, desc = parsed
    assert link.startswith("https://")
    assert work_type == "Remoto"
    assert regime in {"Full-time", "Part-time", "Contractor", "Internship"}
    assert isinstance(location, str)
    assert location  # nao deve ser vazio


def test_regime_part_time_pelo_titulo():
    item = _build_item(title="Acme: Python Developer (Part-Time)")
    parsed = _parse_job_item(item)
    assert parsed[5] == "Part-time"


def test_regime_contractor_pelo_titulo():
    item = _build_item(title="Acme: Python Contractor Wanted")
    parsed = _parse_job_item(item)
    assert parsed[5] == "Contractor"


@pytest.mark.parametrize("text,expected", [
    ("Mon, 13 May 2024 03:14:30 +0000", "13/05/2024"),
    ("Thu, 02 Apr 2026 20:46:00 +0000", "02/04/2026"),
])
def test_parse_rfc822_date(text, expected):
    assert _parse_rfc822_date(text) == expected

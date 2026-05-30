"""Testes do parser de itens da API RemoteOK (v3.10.1)."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from engines.remoteok import (  # noqa: E402
    _parse_job_item,
    _infer_regime_from_tags,
    _format_salary,
    _parse_iso_date,
)


STACKS_LOWER = {"python", "javascript", "engineer", "developer"}


def _base_item(**over):
    item = {
        "id": "1",
        "url": "https://remoteok.com/jobs/1",
        "position": "Senior Python Engineer",
        "company": "Acme",
        "location": "Berlin, Germany",
        "tags": ["python", "backend", "full time"],
        "date": "2026-05-29T10:00:00+00:00",
        "salary_min": 80000,
        "salary_max": 120000,
        "description": "Build APIs in Python and Django",
    }
    item.update(over)
    return item


def test_parse_extrai_location_da_api():
    """Bug do v3.10.0: location era hardcoded []. Agora vem da API."""
    parsed = _parse_job_item(_base_item(), STACKS_LOWER)
    assert parsed is not None
    # location esta no indice 3 do canonico
    assert parsed[3] == "Berlin, Germany"


def test_parse_fallback_worldwide_sem_location():
    """Vaga sem location vira 'Worldwide' (mantem campo populado)."""
    parsed = _parse_job_item(_base_item(location=""), STACKS_LOWER)
    assert parsed is not None
    assert parsed[3] == "Worldwide"


def test_parse_work_type_sempre_remoto():
    parsed = _parse_job_item(_base_item(), STACKS_LOWER)
    assert parsed[4] == "Remoto"


def test_inferir_regime_full_time():
    assert _infer_regime_from_tags({"python", "full time"}) == "Full-time"


def test_inferir_regime_part_time():
    assert _infer_regime_from_tags({"python", "part time"}) == "Part-time"
    assert _infer_regime_from_tags({"part-time"}) == "Part-time"


def test_inferir_regime_contract():
    assert _infer_regime_from_tags({"contract"}) == "Contractor"
    assert _infer_regime_from_tags({"contractor"}) == "Contractor"


def test_inferir_regime_internship():
    assert _infer_regime_from_tags({"intern"}) == "Internship"
    assert _infer_regime_from_tags({"internship"}) == "Internship"


def test_inferir_regime_default_full_time_sem_tag():
    assert _infer_regime_from_tags({"python", "backend"}) == "Full-time"


def test_parse_vaga_irrelevante_retorna_none():
    """Vaga sem match com stacks/tech fallback eh ignorada."""
    parsed = _parse_job_item(
        _base_item(position="Nurse Assistant", tags=["medical"], description="hospital"),
        {"python"},  # stack que nao bate
    )
    assert parsed is None


def test_parse_canonical_tem_10_campos():
    parsed = _parse_job_item(_base_item(), STACKS_LOWER)
    assert isinstance(parsed, list)
    assert len(parsed) == 10
    link, title, company, location, work_type, regime, salary, date, skills, desc = parsed
    assert link == "https://remoteok.com/jobs/1"
    assert title == "Senior Python Engineer"
    assert company == "Acme"
    assert work_type == "Remoto"
    assert regime == "Full-time"
    assert "USD" in salary
    assert date == "29/05/2026"
    assert "Python" in " ".join(skills) or skills  # skills nao-vazio
    assert desc


def test_format_salary_range():
    assert _format_salary(80000, 120000) == "USD 80000 - 120000"
    assert _format_salary(80000, 80000) == "USD 80000"
    assert _format_salary(80000, None) == "USD 80000"
    assert _format_salary(None, None) == ""


def test_parse_iso_date():
    assert _parse_iso_date("2026-05-29T10:00:00+00:00") == "29/05/2026"
    assert _parse_iso_date("2026-01-01") == "01/01/2026"
    assert _parse_iso_date("") == ""

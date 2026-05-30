"""Testes dos helpers do parser CareerJet (v3.10.3)."""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from engines.careerjet import _infer_regime, _work_type  # noqa: E402


class TestInferRegime:
    """v3.10.3: regime inferido de keywords PT/EN/DE.

    Antes o engine emitia '' e o apply_description_fallbacks apagava.
    Resultado: 100% missing em hiring_regime no banco (44 das 50).
    """

    def test_default_full_time(self):
        assert _infer_regime("Desenvolvedor Senior", "tech stack") == "Full-time"

    @pytest.mark.parametrize("title,description,expected", [
        ("Software Dev (Part-time)", "", "Part-time"),
        ("Web Dev meio periodo", "", "Part-time"),
        ("Dev Teilzeit", "", "Part-time"),  # alemao
        ("Web Dev", "vaga em part time", "Part-time"),
    ])
    def test_part_time(self, title, description, expected):
        assert _infer_regime(title, description) == expected

    @pytest.mark.parametrize("title,description,expected", [
        ("Internship Backend", "", "Internship"),
        ("Estagio TI", "", "Internship"),
        ("Trainee Engineer", "", "Internship"),
        ("Praktikum Software", "", "Internship"),  # alemao
        ("Werkstudent Backend", "", "Internship"),  # alemao
        ("Dev", "vaga de estagiario", "Internship"),
    ])
    def test_internship(self, title, description, expected):
        assert _infer_regime(title, description) == expected

    @pytest.mark.parametrize("title,description,expected", [
        ("Senior Dev Freelance", "", "Freelancer"),
        ("Freelancer Python", "", "Freelancer"),
        ("Dev Freiberufler", "", "Freelancer"),  # alemao
        ("Dev Autonomo", "", "Freelancer"),
    ])
    def test_freelancer(self, title, description, expected):
        assert _infer_regime(title, description) == expected

    @pytest.mark.parametrize("title,description,expected", [
        ("Senior Dev Contract", "", "Contractor"),
        ("Contractor JavaScript", "", "Contractor"),
        ("Dev Zeitarbeit", "", "Contractor"),  # alemao
        ("Dev Temporario", "", "Contractor"),
    ])
    def test_contractor(self, title, description, expected):
        assert _infer_regime(title, description) == expected


class TestWorkType:
    def test_remote_pelo_titulo(self):
        assert _work_type("Senior Python Developer Remote", []) == "Remoto"

    def test_hibrido_pelo_titulo(self):
        assert _work_type("Senior Hybrid Engineer", ["Berlin"]) == "Híbrido"

    def test_presencial_com_localidade(self):
        assert _work_type("Senior Engineer", ["Berlin"]) == "Presencial"

    def test_remoto_sem_localidade(self):
        # vagas globais sem location viram Remoto por default
        assert _work_type("Senior Engineer", []) == "Remoto"



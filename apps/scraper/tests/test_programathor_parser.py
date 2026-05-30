"""Testes do helper de location do ProgramaThor (v3.10.6).

O bug que motivou: engine pegava streetAddress como location,
gravando "Rua Haiti - 30" no location_raw em vez de "Sao Paulo, SP".
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.engines.programathor import extract_location_from_address  # noqa: E402


def test_locality_e_region_juntos():
    addr = {
        "addressLocality": "São Paulo",
        "addressRegion": "SP",
        "streetAddress": "Rua Haiti, 30",
    }
    assert extract_location_from_address(addr) == ["São Paulo", "SP"]


def test_so_locality():
    addr = {"addressLocality": "Rio de Janeiro"}
    assert extract_location_from_address(addr) == ["Rio de Janeiro"]


def test_so_region():
    addr = {"addressRegion": "MG"}
    assert extract_location_from_address(addr) == ["MG"]


def test_street_com_virgula_como_ultimo_recurso():
    """Quando locality e region vazios mas street tem 'Cidade, UF'."""
    addr = {"streetAddress": "Belo Horizonte, MG"}
    assert extract_location_from_address(addr) == ["Belo Horizonte", "MG"]


def test_street_sem_virgula_eh_descartado():
    """O bug v3.9.x: 'Rua Haiti - 30' era gravado como location. Agora ignora."""
    addr = {"streetAddress": "Rua Haiti - 30"}
    assert extract_location_from_address(addr) == []


def test_address_none_retorna_vazio():
    assert extract_location_from_address(None) == []


def test_address_nao_dict_retorna_vazio():
    assert extract_location_from_address("not a dict") == []
    assert extract_location_from_address([]) == []


def test_address_vazio_retorna_vazio():
    assert extract_location_from_address({}) == []


def test_locality_vazio_string_eh_strip():
    """Strings com so espaco contam como vazio."""
    addr = {"addressLocality": "   ", "addressRegion": "SP"}
    assert extract_location_from_address(addr) == ["SP"]


def test_locality_prefere_sobre_street():
    """Mesmo quando street tem cidade, locality ganha."""
    addr = {
        "addressLocality": "Curitiba",
        "addressRegion": "PR",
        "streetAddress": "Rua das Flores, 100",  # nao deve aparecer
    }
    assert extract_location_from_address(addr) == ["Curitiba", "PR"]

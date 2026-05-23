"""Testa a lógica de retomada (checkpoint) da engine Careerjet.

Mockamos a chamada ``_fetch_page`` para capturar todas as combinações
``(locale, stack, variant)`` exercidas pelo loop e verificar que ele
pula as combinações já varridas conforme o cursor — incluindo o caso
em que o lote rotativo de locales mudou entre o checkpoint e o restart
(a retomada faz lookup por label, não por índice).
"""
from __future__ import annotations

from typing import List
from unittest.mock import patch

import pytest

from src.engines import careerjet as engine
from variavel import set_active_batch, set_active_batch_context


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_stacks(monkeypatch) -> List[str]:
    stacks = ["Python", "Java"]
    monkeypatch.setattr(engine, "get_active_stacks", lambda: stacks)
    return stacks


@pytest.fixture
def fake_active_locales(monkeypatch) -> List[str]:
    """Substitui ``_active_locales`` por um set pequeno: pt_BR + 2 estrangeiros."""
    locales = ["pt_BR", "en_US", "es_ES"]
    monkeypatch.setattr(engine, "_active_locales", lambda: list(locales))
    return locales


@pytest.fixture
def short_br_variants(monkeypatch) -> tuple:
    """Reduz as variantes do Brasil pra 3 (nacional + 2 UFs)."""
    variants = ("", "São Paulo", "Rio de Janeiro")
    monkeypatch.setattr(engine, "_BR_LOCATION_VARIANTS", variants)
    return variants


@pytest.fixture
def captured_calls(monkeypatch, fake_stacks, fake_active_locales, short_br_variants):
    """Mocka ``_fetch_page`` pra capturar (locale, stack, variant) e zerar HTTP."""
    calls: List[dict] = []

    async def fake_fetch(client, locale, stack, page, location):
        calls.append({
            "locale": locale,
            "stack": stack,
            "variant": location,
            "page": page,
        })
        # Devolve "sem vagas" pra encerrar o loop interno na primeira página.
        return [], 0

    async def no_sleep(_):
        pass

    monkeypatch.setattr(engine, "_fetch_page", fake_fetch)
    monkeypatch.setattr(engine.asyncio, "sleep", no_sleep)
    # API key fake pra passar do gate
    monkeypatch.setattr(engine, "_API_KEY", "x")
    # Não tentar baixar modelos de tradução
    monkeypatch.setattr(engine, "prepare_translation", lambda langs: None)
    return calls


@pytest.fixture
def mock_progress(monkeypatch):
    """Mocka ``progress.resume`` / ``progress.set_cursor`` / ``progress.clear``."""
    state = {
        "cursor": None,
        "saved": [],
        "cleared": [],
    }

    async def fake_resume(eng, batch_key):
        return state["cursor"]

    def fake_set_cursor(eng, batch_key, cursor):
        state["saved"].append((eng, batch_key, dict(cursor)))

    async def fake_clear(eng, batch_key):
        state["cleared"].append((eng, batch_key))

    monkeypatch.setattr(engine.progress, "resume", fake_resume)
    monkeypatch.setattr(engine.progress, "set_cursor", fake_set_cursor)
    monkeypatch.setattr(engine.progress, "clear", fake_clear)
    return state


@pytest.fixture(autouse=True)
def reset_batch_context():
    set_active_batch(None)
    set_active_batch_context(None, None)
    yield
    set_active_batch(None)
    set_active_batch_context(None, None)


# ---------------------------------------------------------------------------
# Testes do loop de retomada
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestCareerjetResume:
    async def test_full_scan_without_cursor(self, captured_calls, mock_progress):
        """Sem cursor: pt_BR varre 3 variants × 2 stacks = 6; en_US e es_ES
        têm 1 variant × 2 stacks cada = 4. Total 10 combinações."""
        set_active_batch_context("TestCat", 1)

        await engine.get_careerjet_jobs()

        # Cada combinação só tem 1 chamada (page=1 → 0 vagas → break)
        assert len(captured_calls) == 10
        # Primeira: pt_BR + Python + variant ""
        assert captured_calls[0] == {
            "locale": "pt_BR", "stack": "Python", "variant": "", "page": 1,
        }

    async def test_resume_by_label_in_middle_of_brazil(
        self, captured_calls, mock_progress
    ):
        """Cursor em (pt_BR, Java, São Paulo): pula tudo antes."""
        set_active_batch_context("TestCat", 1)
        mock_progress["cursor"] = {
            "locale_idx": 0, "locale": "pt_BR",
            "stack_idx": 1, "stack": "Java",
            "variant_idx": 1, "variant": "São Paulo",
        }

        await engine.get_careerjet_jobs()

        # Restantes: (pt_BR, Java, SP), (pt_BR, Java, RJ) = 2 do BR
        # + en_US: Python+"", Java+"" = 2
        # + es_ES: Python+"", Java+"" = 2
        # = 6 combinações
        assert len(captured_calls) == 6
        assert captured_calls[0] == {
            "locale": "pt_BR", "stack": "Java", "variant": "São Paulo", "page": 1,
        }

    async def test_resume_into_foreign_locale(self, captured_calls, mock_progress):
        """Cursor em (es_ES, Java, ""): só essa combinação roda."""
        set_active_batch_context("TestCat", 1)
        mock_progress["cursor"] = {
            "locale_idx": 2, "locale": "es_ES",
            "stack_idx": 1, "stack": "Java",
            "variant_idx": 0, "variant": "",
        }

        await engine.get_careerjet_jobs()

        assert len(captured_calls) == 1
        assert captured_calls[0] == {
            "locale": "es_ES", "stack": "Java", "variant": "", "page": 1,
        }

    async def test_cursor_discarded_when_locale_not_in_pool(
        self, captured_calls, mock_progress
    ):
        """Locale salvo fora do lote rotativo atual: descarta cursor."""
        set_active_batch_context("TestCat", 1)
        mock_progress["cursor"] = {
            "locale_idx": 99, "locale": "ja_JP",  # NÃO está nos fake_active_locales
            "stack_idx": 0, "stack": "Python",
            "variant_idx": 0, "variant": "",
        }

        await engine.get_careerjet_jobs()

        # Descarta cursor → varre tudo (10 combinações)
        assert len(captured_calls) == 10
        assert captured_calls[0]["locale"] == "pt_BR"

    async def test_cursor_saved_before_each_combination(
        self, captured_calls, mock_progress
    ):
        """Cada combinação salva o cursor antes de executar."""
        set_active_batch_context("TestCat", 1)

        await engine.get_careerjet_jobs()

        assert len(mock_progress["saved"]) == 10
        for eng_name, bk, cur in mock_progress["saved"]:
            assert eng_name == "careerjet"
            assert bk == "cat=TestCat|idx=1"
            assert {"locale_idx", "locale", "stack_idx", "stack",
                    "variant_idx", "variant"} <= set(cur.keys())

    async def test_clear_called_at_end(self, captured_calls, mock_progress):
        set_active_batch_context("TestCat", 1)

        await engine.get_careerjet_jobs()

        assert mock_progress["cleared"] == [("careerjet", "cat=TestCat|idx=1")]

    async def test_no_checkpoint_in_standalone_mode(
        self, captured_calls, mock_progress
    ):
        """Sem batch context: nada salvo nem limpo, mas o scan inteiro roda."""
        await engine.get_careerjet_jobs()

        assert mock_progress["saved"] == []
        assert mock_progress["cleared"] == []
        assert len(captured_calls) == 10

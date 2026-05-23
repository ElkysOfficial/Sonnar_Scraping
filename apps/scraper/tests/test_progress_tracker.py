"""Testes para ProgressTracker (checkpoint de varredura por engine, batch).

Foco em comportamento sem rede — modo disabled. O fluxo com Supabase real é
coberto em integração (não aqui).
"""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from src.persistence.progress_tracker import ProgressTracker


@pytest.fixture
def disabled_tracker(monkeypatch) -> ProgressTracker:
    """Tracker sem ``SUPABASE_URL`` — desativa I/O, exercita apenas o buffer."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    return ProgressTracker()


class TestSetCursor:
    def test_set_cursor_stores_in_buffer(self, disabled_tracker):
        disabled_tracker.set_cursor("linkedin", "cat=A|idx=1", {"stack": "Java", "start": 50})
        assert disabled_tracker._buffer[("linkedin", "cat=A|idx=1")] == {
            "stack": "Java", "start": 50,
        }

    def test_set_cursor_overwrites_previous(self, disabled_tracker):
        disabled_tracker.set_cursor("linkedin", "cat=A|idx=1", {"start": 50})
        disabled_tracker.set_cursor("linkedin", "cat=A|idx=1", {"start": 75})
        assert disabled_tracker._buffer[("linkedin", "cat=A|idx=1")] == {"start": 75}

    def test_set_cursor_ignores_missing_engine_or_batch(self, disabled_tracker):
        disabled_tracker.set_cursor("", "cat=A|idx=1", {"x": 1})
        disabled_tracker.set_cursor("linkedin", "", {"x": 1})
        assert disabled_tracker._buffer == {}

    def test_set_cursor_copies_dict_defensively(self, disabled_tracker):
        cursor = {"stack": "Java"}
        disabled_tracker.set_cursor("linkedin", "k", cursor)
        cursor["mutated"] = True
        assert "mutated" not in disabled_tracker._buffer[("linkedin", "k")]


class TestClear:
    @pytest.mark.asyncio
    async def test_clear_removes_specific_batch_from_buffer(self, disabled_tracker):
        disabled_tracker.set_cursor("linkedin", "cat=A|idx=1", {"x": 1})
        disabled_tracker.set_cursor("dice", "cat=A|idx=1", {"y": 2})
        await disabled_tracker.clear("linkedin", "cat=A|idx=1")
        assert ("linkedin", "cat=A|idx=1") not in disabled_tracker._buffer
        # dice fica intacto (engine diferente)
        assert ("dice", "cat=A|idx=1") in disabled_tracker._buffer

    @pytest.mark.asyncio
    async def test_clear_also_removes_stale_batches_of_same_engine(self, disabled_tracker):
        """Linhas residuais (de batches anteriores que não tiveram clear) são removidas."""
        disabled_tracker.set_cursor("linkedin", "cat=A|idx=1", {"x": 1})
        disabled_tracker.set_cursor("linkedin", "cat=A|idx=2", {"x": 2})
        disabled_tracker.set_cursor("linkedin", "cat=B|idx=1", {"x": 3})

        await disabled_tracker.clear("linkedin", "cat=B|idx=1")

        # Nenhuma linha de linkedin sobra (batches anteriores também limpos)
        assert not any(key[0] == "linkedin" for key in disabled_tracker._buffer)


class TestResume:
    @pytest.mark.asyncio
    async def test_resume_returns_none_when_disabled(self, disabled_tracker):
        # Mesmo que o buffer tenha cursor, resume não devolve nada em modo disabled
        # (resume sempre lê do banco, não do buffer).
        disabled_tracker.set_cursor("linkedin", "cat=A|idx=1", {"x": 1})
        result = await disabled_tracker.resume("linkedin", "cat=A|idx=1")
        assert result is None

    @pytest.mark.asyncio
    async def test_resume_returns_none_without_engine_or_batch(self, disabled_tracker):
        assert await disabled_tracker.resume("", "k") is None
        assert await disabled_tracker.resume("linkedin", "") is None


class TestFlush:
    @pytest.mark.asyncio
    async def test_flush_clears_buffer_when_disabled(self, disabled_tracker):
        disabled_tracker.set_cursor("linkedin", "cat=A|idx=1", {"x": 1})
        await disabled_tracker.flush()
        assert disabled_tracker._buffer == {}

    @pytest.mark.asyncio
    async def test_flush_empty_buffer_is_noop(self, disabled_tracker):
        # Não levanta exceção mesmo sem dados
        await disabled_tracker.flush()
        assert disabled_tracker._buffer == {}


class TestInit:
    def test_enabled_when_env_present(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "k")
        t = ProgressTracker()
        assert t.enabled is True

    def test_disabled_when_env_missing(self, monkeypatch):
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
        t = ProgressTracker()
        assert t.enabled is False

"""Testa a lógica de retomada (checkpoint) da engine LinkedIn.

Mockamos ``_scan_listing``, ``_warmup_session`` e ``get_session`` para
isolar o loop de varredura e verificar que ele pula as combinações
``(stack, region, sort)`` já varridas conforme o cursor — incluindo o
caso em que o lote rotativo de regiões mudou entre o checkpoint e o
restart (a retomada faz lookup por label, não por índice).
"""
from __future__ import annotations

from typing import List, Tuple
from unittest.mock import patch

import pytest

from src.engines import linkedin as engine
from variavel import set_active_batch, set_active_batch_context


@pytest.fixture
def fake_stacks(monkeypatch) -> List[str]:
    """Substitui ``get_active_stacks`` por um conjunto pequeno e ordenado."""
    stacks = ["Python", "Java", "Go"]
    monkeypatch.setattr(engine, "get_active_stacks", lambda: stacks)
    return stacks


@pytest.fixture
def fake_active_regions(monkeypatch) -> List[Tuple[str, str | None]]:
    """Substitui ``_active_regions`` por uma lista fixa pequena.

    Por padrão devolve [Brasil, SP, RJ]. Testes que precisam simular
    rotação podem usar ``set_active_regions`` da fixture pra trocar.
    """
    state = {
        "regions": [
            ("Brasil", "106057199"),
            ("São Paulo, Brasil", None),
            ("Rio de Janeiro, Brasil", None),
        ],
    }
    monkeypatch.setattr(engine, "_active_regions", lambda: list(state["regions"]))
    return state


@pytest.fixture
def short_sorts(monkeypatch) -> List[str | None]:
    """Mantém os 2 sorts originais (rel + DD)."""
    sorts = [None, "DD"]
    monkeypatch.setattr(engine, "_LISTING_SORTS", sorts)
    return sorts


@pytest.fixture
def captured_calls(monkeypatch, fake_stacks, fake_active_regions, short_sorts):
    """Mocka ``_scan_listing`` para capturar todas as chamadas (e zerar HTTP).

    Também silencia ``asyncio.sleep`` e ``_warmup_session``.
    """
    calls: List[dict] = []

    async def fake_scan_listing(client, stack, location, geo_id, sort, seen, seeds):
        calls.append({
            "stack": stack,
            "location": location,
            "sort": sort,
        })
        return 0  # nenhum seed novo — encurta o loop

    async def fake_warmup():
        pass

    async def fake_get_session():
        return None  # client não é usado quando _scan_listing está mockado

    async def no_sleep(_):
        pass

    monkeypatch.setattr(engine, "_scan_listing", fake_scan_listing)
    monkeypatch.setattr(engine, "_warmup_session", fake_warmup)
    monkeypatch.setattr(engine, "get_session", fake_get_session)
    monkeypatch.setattr(engine.asyncio, "sleep", no_sleep)
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
    """Garante que cada teste começa com batch context limpo."""
    set_active_batch(None)
    set_active_batch_context(None, None)
    yield
    set_active_batch(None)
    set_active_batch_context(None, None)


@pytest.mark.asyncio
class TestLinkedInResume:
    async def test_full_scan_without_cursor(self, captured_calls, mock_progress):
        """Sem cursor salvo: varre todas as combinações (3 × 3 × 2 = 18)."""
        set_active_batch_context("TestCat", 1)

        await engine.get_linkedin_links()

        assert len(captured_calls) == 18  # 3 stacks × 3 regiões × 2 sorts
        # Primeira chamada: primeira stack, primeira região, primeiro sort.
        assert captured_calls[0]["stack"] == "Python"
        assert captured_calls[0]["location"] == "Brasil"
        assert captured_calls[0]["sort"] is None

    async def test_resume_by_label_after_rotation(
        self, captured_calls, mock_progress, fake_active_regions
    ):
        """Cursor aponta pra (Java, São Paulo, DD): retomada por LABEL.

        Mesmo que o ``region_idx`` do cursor seja desatualizado em relação
        ao lote atual, o lookup por label encontra a posição certa.
        """
        set_active_batch_context("TestCat", 1)
        mock_progress["cursor"] = {
            "stack_idx": 99,  # idx errado de propósito — lookup é por label
            "stack": "Java",
            "region_idx": 99,
            "region": "São Paulo, Brasil",
            "sort_idx": 99,
            "sort": "DD",
        }

        await engine.get_linkedin_links()

        # Java/SP/DD em diante: 1 combinação (Java/SP/DD)
        # + Java/RJ/* (2) + Go/* (6) = 9
        assert len(captured_calls) == 9
        assert captured_calls[0] == {
            "stack": "Java", "location": "São Paulo, Brasil", "sort": "DD",
        }
        assert captured_calls[1] == {
            "stack": "Java", "location": "Rio de Janeiro, Brasil", "sort": None,
        }

    async def test_cursor_discarded_when_region_label_not_in_pool(
        self, captured_calls, mock_progress, fake_active_regions
    ):
        """Cursor com label de uma região que não está mais no lote rotativo:
        ignora o cursor e refaz o batch desde o início."""
        set_active_batch_context("TestCat", 1)
        mock_progress["cursor"] = {
            "stack_idx": 1,
            "stack": "Java",
            "region_idx": 5,
            "region": "Pernambuco, Brasil",  # NÃO está no fake_active_regions
            "sort_idx": 0,
            "sort": "rel",
        }

        await engine.get_linkedin_links()

        # Descarta o cursor → varre TUDO (3 × 3 × 2 = 18 combinações)
        assert len(captured_calls) == 18
        assert captured_calls[0]["stack"] == "Python"

    async def test_cursor_saved_before_each_combination(
        self, captured_calls, mock_progress
    ):
        """Antes de executar cada combinação, o cursor é atualizado com label."""
        set_active_batch_context("TestCat", 1)

        await engine.get_linkedin_links()

        assert len(mock_progress["saved"]) == 18  # 3 × 3 × 2
        for eng_name, bk, cur in mock_progress["saved"]:
            assert eng_name == "linkedin"
            assert bk == "cat=TestCat|idx=1"
            # Garante que tanto idx quanto label estão no cursor
            assert {"stack_idx", "stack", "region_idx", "region",
                    "sort_idx", "sort"} <= set(cur.keys())

    async def test_clear_called_at_end(self, captured_calls, mock_progress):
        """No fim do ciclo, ``clear`` é chamado."""
        set_active_batch_context("TestCat", 1)

        await engine.get_linkedin_links()

        assert mock_progress["cleared"] == [("linkedin", "cat=TestCat|idx=1")]

    async def test_no_checkpoint_in_standalone_mode(
        self, captured_calls, mock_progress
    ):
        """Sem batch context (modo standalone): nada é salvo nem limpo."""
        # NÃO chama set_active_batch_context — fica em standalone

        await engine.get_linkedin_links()

        assert mock_progress["saved"] == []
        assert mock_progress["cleared"] == []
        assert len(captured_calls) == 18  # scan inteiro ainda roda


class TestRotatingRegions:
    """Lote rotativo: avança por relógio, cobre o pool inteiro ao longo do dia."""

    def test_rotating_returns_subset_of_pool(self):
        regions = engine._rotating_regions()
        assert isinstance(regions, list)
        # Tamanho == batch size configurado (default 5)
        assert len(regions) <= engine._LISTING_REGION_BATCH_SIZE
        for label, _geo in regions:
            assert isinstance(label, str) and label

    def test_active_regions_always_includes_brasil(self):
        active = engine._active_regions()
        labels = [r[0] for r in active]
        assert "Brasil" in labels
        assert labels[0] == "Brasil"  # Brasil é sempre o primeiro

    def test_rotation_advances_with_time(self, monkeypatch):
        """Em janelas de tempo diferentes, o índice rotativo muda."""
        interval = engine._LISTING_ROTATION_INTERVAL_S
        n = len(engine._ROTATING_REGIONS)
        total_batches = (n + engine._LISTING_REGION_BATCH_SIZE - 1) // engine._LISTING_REGION_BATCH_SIZE

        # Forço dois timestamps em janelas diferentes — se total_batches > 1,
        # devem produzir lotes distintos.
        if total_batches > 1:
            monkeypatch.setattr(engine.time, "time", lambda: 0)
            batch_a = engine._rotating_regions()
            monkeypatch.setattr(engine.time, "time", lambda: interval * 1.5)
            batch_b = engine._rotating_regions()
            assert batch_a != batch_b

    def test_rotation_cycles_through_full_pool(self, monkeypatch):
        """Em (total_batches × interval) segundos, todos os lotes aparecem."""
        interval = engine._LISTING_ROTATION_INTERVAL_S
        size = engine._LISTING_REGION_BATCH_SIZE
        pool = engine._ROTATING_REGIONS
        total_batches = (len(pool) + size - 1) // size

        seen_labels: set[str] = set()
        for i in range(total_batches):
            monkeypatch.setattr(engine.time, "time", lambda i=i: i * interval)
            for label, _geo in engine._rotating_regions():
                seen_labels.add(label)

        pool_labels = {label for label, _geo in pool}
        assert seen_labels == pool_labels  # cobertura completa

"""Testa a lógica de retomada (checkpoint) nas engines BNE, Catho e Indeed.

Foco em cobertura básica do contrato:
- Save de cursor antes de cada unidade de trabalho.
- Resume a partir de cursor válido.
- Descarte de cursor com label inexistente no batch atual.
- Clear no fim.
- Standalone (sem batch context) não interage com o progress_tracker.

Cada engine tem sua peculiaridade:
- BNE: área fixa, cursor é só {page}.
- Catho: (stack, page) — espelha o Dice.
- Indeed: (stack, variant_idx) — sem paginação interna.
"""
from __future__ import annotations

from typing import List
from unittest.mock import MagicMock

import pytest

from src.engines import bne as bne_engine
from src.engines import catho as catho_engine
from src.engines import indeed as indeed_engine
from variavel import set_active_batch, set_active_batch_context


@pytest.fixture(autouse=True)
def reset_batch_context():
    set_active_batch(None)
    set_active_batch_context(None, None)
    yield
    set_active_batch(None)
    set_active_batch_context(None, None)


def _make_progress_mock(monkeypatch, engine_module):
    state = {"cursor": None, "saved": [], "cleared": []}

    async def fake_resume(eng, batch_key):
        return state["cursor"]

    def fake_set_cursor(eng, batch_key, cursor):
        state["saved"].append((eng, batch_key, dict(cursor)))

    async def fake_clear(eng, batch_key):
        state["cleared"].append((eng, batch_key))

    monkeypatch.setattr(engine_module.progress, "resume", fake_resume)
    monkeypatch.setattr(engine_module.progress, "set_cursor", fake_set_cursor)
    monkeypatch.setattr(engine_module.progress, "clear", fake_clear)
    return state


# ---------------------------------------------------------------------------
# BNE
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestBneResume:
    """BNE: cursor é só {page}, área fixa."""

    @pytest.fixture
    def captured_pages(self, monkeypatch):
        """Mocka fetch_sync pra retornar página vazia (encerra o loop após
        2 chamadas) e captura cada página requisitada."""
        pages: List[int] = []

        async def fake_fetch_sync(scraper, url, timeout=20):
            import re
            m = re.search(r"Page=(\d+)", url)
            pages.append(int(m.group(1)) if m else 0)
            resp = MagicMock()
            resp.status_code = 200
            resp.text = "<html><body>no jobs</body></html>"
            return resp

        async def no_sleep(_):
            pass

        monkeypatch.setattr(bne_engine, "fetch_sync", fake_fetch_sync)
        monkeypatch.setattr(bne_engine.asyncio, "sleep", no_sleep)
        # max_pages alto, mas o loop quebra quando consecutive_empty atinge 2
        return pages

    async def test_full_scan_starts_from_page_1(self, monkeypatch, captured_pages):
        mock = _make_progress_mock(monkeypatch, bne_engine)
        set_active_batch_context("TestCat", 1)

        scraper = MagicMock()
        await bne_engine._scan_area("informatica", scraper, max_pages=10)

        # Sem cursor → começa em 1; loop quebra após 2 páginas vazias
        assert captured_pages[0] == 1
        assert mock["cleared"] == [("bne", "cat=TestCat|idx=1")]
        # Saved tem pelo menos a página 1
        assert mock["saved"][0][2]["page"] == 1

    async def test_resume_from_specific_page(self, monkeypatch, captured_pages):
        mock = _make_progress_mock(monkeypatch, bne_engine)
        mock["cursor"] = {"page": 7, "area": "informatica"}
        set_active_batch_context("TestCat", 1)

        scraper = MagicMock()
        await bne_engine._scan_area("informatica", scraper, max_pages=10)

        # Começa direto da página 7
        assert captured_pages[0] == 7

    async def test_no_checkpoint_in_standalone(self, monkeypatch, captured_pages):
        mock = _make_progress_mock(monkeypatch, bne_engine)
        # NÃO chama set_active_batch_context

        scraper = MagicMock()
        await bne_engine._scan_area("informatica", scraper, max_pages=10)

        assert mock["saved"] == []
        assert mock["cleared"] == []


# ---------------------------------------------------------------------------
# Catho
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestCathoResume:
    """Catho: (stack, page) — mesmo padrão do Dice."""

    @pytest.fixture
    def captured_calls(self, monkeypatch):
        calls: List[dict] = []

        async def fake_fetch_sync(session, url, timeout=30):
            import re, urllib.parse
            m = re.search(r"/vagas/([^/]+)/\?page=(\d+)", url)
            if m:
                stack = urllib.parse.unquote(m.group(1))
                page = int(m.group(2))
                calls.append({"stack": stack, "page": page})
            resp = MagicMock()
            resp.status_code = 200
            resp.text = "<html><body>no offers</body></html>"
            return resp

        async def no_sleep(_):
            pass

        monkeypatch.setattr(catho_engine, "fetch_sync", fake_fetch_sync)
        monkeypatch.setattr(catho_engine.asyncio, "sleep", no_sleep)
        monkeypatch.setattr(
            catho_engine, "get_active_stacks", lambda: ["Python", "Java"]
        )
        monkeypatch.setenv("CATHO_FETCH_DETAIL", "0")
        return calls

    async def test_full_scan_visits_all_stacks(self, monkeypatch, captured_calls):
        mock = _make_progress_mock(monkeypatch, catho_engine)
        set_active_batch_context("TestCat", 1)

        await catho_engine.get_catho_jobs()

        # Cada stack faz 2 páginas (consecutive_empty=2 → break)
        assert any(c["stack"] == "Python" for c in captured_calls)
        assert any(c["stack"] == "Java" for c in captured_calls)
        assert mock["cleared"] == [("catho", "cat=TestCat|idx=1")]

    async def test_resume_skips_first_stack(self, monkeypatch, captured_calls):
        mock = _make_progress_mock(monkeypatch, catho_engine)
        mock["cursor"] = {"stack_idx": 1, "stack": "Java", "page": 3}
        set_active_batch_context("TestCat", 1)

        await catho_engine.get_catho_jobs()

        # Nenhuma chamada com Python (foi pulado), começa em Java/page=3
        assert not any(c["stack"] == "Python" for c in captured_calls)
        assert captured_calls[0] == {"stack": "Java", "page": 3}

    async def test_cursor_discarded_when_stack_not_in_batch(
        self, monkeypatch, captured_calls
    ):
        mock = _make_progress_mock(monkeypatch, catho_engine)
        mock["cursor"] = {"stack_idx": 99, "stack": "Ruby", "page": 5}
        set_active_batch_context("TestCat", 1)

        await catho_engine.get_catho_jobs()

        # Refaz tudo desde Python/page=1
        assert captured_calls[0] == {"stack": "Python", "page": 1}


# ---------------------------------------------------------------------------
# Indeed
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestIndeedResume:
    """Indeed: (stack, variant_idx) — sem paginação interna."""

    @pytest.fixture
    def captured_calls(self, monkeypatch):
        calls: List[dict] = []

        async def fake_html(url, timeout=30):
            import re, urllib.parse
            parsed = urllib.parse.urlparse(url)
            qs = urllib.parse.parse_qs(parsed.query)
            stack = qs.get("q", [""])[0]
            calls.append({"stack": stack, "url": url})
            return None  # devolve None → reset_session é chamado, mas loop continua

        async def no_sleep(_):
            pass

        monkeypatch.setattr(indeed_engine, "_fetch_html_with_fallback", fake_html)
        monkeypatch.setattr(indeed_engine.asyncio, "sleep", no_sleep)
        monkeypatch.setattr(indeed_engine, "reset_session", lambda: None)
        monkeypatch.setattr(
            indeed_engine, "get_active_stacks", lambda: ["Python", "Java"]
        )
        # Reduz variants pra teste mais rápido (mantém 2)
        monkeypatch.setattr(
            indeed_engine, "_LISTING_VARIANTS", ["&sort=date", "&radius=25"]
        )
        return calls

    async def test_full_scan_visits_all_combinations(
        self, monkeypatch, captured_calls
    ):
        mock = _make_progress_mock(monkeypatch, indeed_engine)
        set_active_batch_context("TestCat", 1)

        await indeed_engine.get_indeed_jobs()

        # 2 stacks × 2 variants = 4 chamadas
        assert len(captured_calls) == 4
        assert mock["cleared"] == [("indeed", "cat=TestCat|idx=1")]

    async def test_resume_skips_to_variant(self, monkeypatch, captured_calls):
        mock = _make_progress_mock(monkeypatch, indeed_engine)
        mock["cursor"] = {
            "stack_idx": 1, "stack": "Java",
            "variant_idx": 1, "variant": "&radius=25",
        }
        set_active_batch_context("TestCat", 1)

        await indeed_engine.get_indeed_jobs()

        # Só a última combinação: Java + variant_idx=1
        assert len(captured_calls) == 1
        assert captured_calls[0]["stack"] == "Java"

    async def test_cursor_discarded_when_stack_not_in_batch(
        self, monkeypatch, captured_calls
    ):
        mock = _make_progress_mock(monkeypatch, indeed_engine)
        mock["cursor"] = {
            "stack_idx": 99, "stack": "Ruby",
            "variant_idx": 0, "variant": "&sort=date",
        }
        set_active_batch_context("TestCat", 1)

        await indeed_engine.get_indeed_jobs()

        # Refaz tudo
        assert len(captured_calls) == 4

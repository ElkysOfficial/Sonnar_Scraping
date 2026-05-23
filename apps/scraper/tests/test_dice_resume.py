"""Testa a lógica de retomada (checkpoint) da engine Dice.

Mockamos ``fetch_sync`` pra capturar todas as páginas exercidas pelo loop
e verificar que ele pula stacks/páginas já varridas conforme o cursor.
Granularidade do checkpoint: (stack, page) — diferente do LinkedIn/Careerjet
porque cada stack do Dice pode varrer até 50 páginas.
"""
from __future__ import annotations

from typing import List
from unittest.mock import MagicMock

import pytest

from src.engines import dice as engine
from variavel import set_active_batch, set_active_batch_context


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_stacks(monkeypatch) -> List[str]:
    stacks = ["Python", "Java", "Go"]
    monkeypatch.setattr(engine, "get_active_stacks", lambda: stacks)
    return stacks


@pytest.fixture
def captured_calls(monkeypatch, fake_stacks):
    """Mocka ``fetch_sync`` pra capturar (stack, page) e zerar HTTP real."""
    calls: List[dict] = []

    async def fake_fetch_sync(session, url, timeout=30):
        # Extrai stack e page da URL (formato: ?q=<stack>&radius=...&page=N)
        import urllib.parse
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        stack = qs.get("q", [""])[0]
        page = int(qs.get("page", ["1"])[0])
        calls.append({"stack": stack, "page": page})

        # Devolve resposta vazia → loop quebra após max_empty_pages
        fake_response = MagicMock()
        fake_response.status_code = 200
        fake_response.text = "<html><body>no cards</body></html>"
        return fake_response

    async def no_sleep(_):
        pass

    monkeypatch.setattr(engine, "fetch_sync", fake_fetch_sync)
    monkeypatch.setattr(engine.asyncio, "sleep", no_sleep)
    # Limita a busca pra teste mais rápido
    monkeypatch.setenv("DICE_MAX_PAGES", "3")
    monkeypatch.setenv("DICE_MAX_EMPTY_PAGES", "2")
    monkeypatch.setenv("DICE_FETCH_DETAIL", "0")
    return calls


@pytest.fixture
def mock_progress(monkeypatch):
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
# Testes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestDiceResume:
    async def test_full_scan_without_cursor(self, captured_calls, mock_progress):
        """Sem cursor: cada stack vai até a tolerância de páginas vazias.
        Com max_empty_pages=2, faz 2 páginas por stack antes de pular.
        3 stacks × 2 páginas = 6 chamadas."""
        set_active_batch_context("TestCat", 1)

        await engine.get_dice_jobs()

        assert len(captured_calls) == 6
        assert captured_calls[0] == {"stack": "Python", "page": 1}
        assert captured_calls[1] == {"stack": "Python", "page": 2}
        # Pula pra Java na página 1 (max_empty atingido)
        assert captured_calls[2] == {"stack": "Java", "page": 1}

    async def test_resume_from_specific_page_of_stack(
        self, captured_calls, mock_progress
    ):
        """Cursor em (Java, page=2): pula Python inteiro e começa em Java/p2."""
        set_active_batch_context("TestCat", 1)
        mock_progress["cursor"] = {
            "stack_idx": 1, "stack": "Java", "page": 2,
        }

        await engine.get_dice_jobs()

        # Java/page=2 (1ª vazia) + Java/page=3 (2ª vazia → break)
        # + Go/page=1, Go/page=2
        assert len(captured_calls) == 4
        assert captured_calls[0] == {"stack": "Java", "page": 2}
        assert captured_calls[1] == {"stack": "Java", "page": 3}
        assert captured_calls[2] == {"stack": "Go", "page": 1}
        assert captured_calls[3] == {"stack": "Go", "page": 2}

    async def test_cursor_discarded_when_stack_not_in_batch(
        self, captured_calls, mock_progress
    ):
        """Stack salva fora do batch atual: descarta cursor e refaz tudo."""
        set_active_batch_context("TestCat", 1)
        mock_progress["cursor"] = {
            "stack_idx": 99, "stack": "Ruby",  # NÃO está no fake_stacks
            "page": 5,
        }

        await engine.get_dice_jobs()

        # Descarta cursor → varre tudo desde o início (3 stacks × 2 páginas)
        assert len(captured_calls) == 6
        assert captured_calls[0] == {"stack": "Python", "page": 1}

    async def test_cursor_saved_before_each_page(
        self, captured_calls, mock_progress
    ):
        """Antes de cada página, o cursor é salvo com o número certo."""
        set_active_batch_context("TestCat", 1)

        await engine.get_dice_jobs()

        # 6 páginas exercidas → 6 saves
        assert len(mock_progress["saved"]) == 6
        for eng_name, bk, cur in mock_progress["saved"]:
            assert eng_name == "dice"
            assert bk == "cat=TestCat|idx=1"
            assert {"stack_idx", "stack", "page"} <= set(cur.keys())

        # Primeiro save = (Python, page=1)
        first = mock_progress["saved"][0][2]
        assert first["stack"] == "Python"
        assert first["page"] == 1

    async def test_clear_called_at_end(self, captured_calls, mock_progress):
        set_active_batch_context("TestCat", 1)

        await engine.get_dice_jobs()

        assert mock_progress["cleared"] == [("dice", "cat=TestCat|idx=1")]

    async def test_no_checkpoint_in_standalone_mode(
        self, captured_calls, mock_progress
    ):
        await engine.get_dice_jobs()

        assert mock_progress["saved"] == []
        assert mock_progress["cleared"] == []
        assert len(captured_calls) == 6

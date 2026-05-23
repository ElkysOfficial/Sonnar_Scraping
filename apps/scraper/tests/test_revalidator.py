"""Testes do revalidator — checa lógica de janela de idade, classificação
de status HTTP, e fluxo de delete via core (com mocks).
"""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from src.persistence import revalidator as r


class TestParsePubDate:
    def test_iso_format(self):
        assert r._parse_pub_date("2026-05-23") == date(2026, 5, 23)

    def test_brazilian_format(self):
        assert r._parse_pub_date("23/05/2026") == date(2026, 5, 23)

    def test_iso_with_time(self):
        # Pega só os 10 primeiros chars
        assert r._parse_pub_date("2026-05-23T14:30:00") == date(2026, 5, 23)

    def test_invalid_returns_none(self):
        assert r._parse_pub_date("não é data") is None
        assert r._parse_pub_date("") is None
        assert r._parse_pub_date(None) is None


class TestAgingWindow:
    def test_exactly_80_days_in_window(self):
        today = date(2026, 5, 23)
        old = today - timedelta(days=80)
        assert r._is_in_aging_window(old, today) is True

    def test_exactly_90_days_in_window(self):
        today = date(2026, 5, 23)
        old = today - timedelta(days=90)
        assert r._is_in_aging_window(old, today) is True

    def test_too_recent_out_of_window(self):
        today = date(2026, 5, 23)
        recent = today - timedelta(days=30)
        assert r._is_in_aging_window(recent, today) is False

    def test_too_old_out_of_window(self):
        today = date(2026, 5, 23)
        ancient = today - timedelta(days=120)
        assert r._is_in_aging_window(ancient, today) is False

    def test_just_inside_window_85_days(self):
        today = date(2026, 5, 23)
        assert r._is_in_aging_window(today - timedelta(days=85), today) is True


@pytest.mark.asyncio
class TestCheckUrlStatus:
    async def test_404_is_expired(self):
        client = MagicMock()
        client.get = AsyncMock(return_value=MagicMock(status_code=404))
        result = await r.check_url_status(client, "https://x.com/job/1")
        assert result == "expired"

    async def test_410_is_expired(self):
        client = MagicMock()
        client.get = AsyncMock(return_value=MagicMock(status_code=410))
        assert await r.check_url_status(client, "https://x.com/job/1") == "expired"

    async def test_200_is_active(self):
        client = MagicMock()
        client.get = AsyncMock(return_value=MagicMock(status_code=200))
        assert await r.check_url_status(client, "https://x.com/job/1") == "active"

    async def test_302_redirect_is_unknown(self):
        """Redirect (sem follow) é ambíguo — pode ser pra página de erro
        ou pra URL canônica. Conservadoramente classificamos como unknown."""
        client = MagicMock()
        client.get = AsyncMock(return_value=MagicMock(status_code=302))
        assert await r.check_url_status(client, "https://x.com/job/1") == "unknown"

    async def test_500_is_unknown(self):
        client = MagicMock()
        client.get = AsyncMock(return_value=MagicMock(status_code=500))
        assert await r.check_url_status(client, "https://x.com/job/1") == "unknown"

    async def test_timeout_is_unknown(self):
        client = MagicMock()
        client.get = AsyncMock(side_effect=httpx.TimeoutException("slow"))
        assert await r.check_url_status(client, "https://x.com/job/1") == "unknown"

    async def test_transport_error_is_unknown(self):
        client = MagicMock()
        client.get = AsyncMock(side_effect=httpx.ConnectError("no route"))
        assert await r.check_url_status(client, "https://x.com/job/1") == "unknown"

    async def test_unexpected_exception_is_unknown(self):
        client = MagicMock()
        client.get = AsyncMock(side_effect=ValueError("weird"))
        assert await r.check_url_status(client, "https://x.com/job/1") == "unknown"


@pytest.mark.asyncio
class TestRevalidateAgingJobs:
    def _make_repo(self, jobs: dict, http_responses: dict):
        """Cria um repo fake com LocalJobStore + CoreJobsSink mockados.

        ``jobs``: dict url -> entry (publication_date, source).
        ``http_responses``: dict url -> int (status code) ou Exception.
        """
        repo = MagicMock()

        # LocalJobStore mock
        repo.local.known_urls = MagicMock(return_value=set(jobs.keys()))
        repo.local.get = MagicMock(side_effect=lambda u: jobs.get(u))
        repo.local.delete_url = MagicMock(return_value=True)

        # CoreJobsSink mock — delete sempre passa
        repo.core.delete_job_by_url = AsyncMock(return_value=True)

        # Patch httpx.AsyncClient
        return repo, http_responses

    @pytest.mark.asyncio
    async def test_removes_only_expired(self, monkeypatch):
        today = date.today()
        # 3 vagas: uma 404 (expired), uma 200 (active), uma 500 (unknown)
        in_window = (today - timedelta(days=85)).isoformat()
        jobs = {
            "https://x.com/a": {"publication_date": in_window, "source": "linkedin"},
            "https://x.com/b": {"publication_date": in_window, "source": "dice"},
            "https://x.com/c": {"publication_date": in_window, "source": "bne"},
        }
        responses = {
            "https://x.com/a": 404,
            "https://x.com/b": 200,
            "https://x.com/c": 500,
        }
        repo, _ = self._make_repo(jobs, responses)
        # Mock do tracker.mark_expired
        mark_expired_mock = AsyncMock(return_value=True)
        monkeypatch.setattr(r.tracker, "mark_expired", mark_expired_mock)

        # Mock AsyncClient pra retornar status conforme URL chamada
        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            async def get(self, url, **kwargs):
                return MagicMock(status_code=responses[url])

        monkeypatch.setattr(r.httpx, "AsyncClient", lambda **kw: FakeClient())

        stats = await r.revalidate_aging_jobs(repo)

        assert stats["checked"] == 3
        assert stats["expired"] == 1
        assert stats["active"] == 1
        assert stats["unknown"] == 1
        # Apenas a vaga 404 foi deletada
        repo.core.delete_job_by_url.assert_called_once_with("https://x.com/a")
        repo.local.delete_url.assert_called_once_with("https://x.com/a")
        # E marcada como expirada no tracker
        mark_expired_mock.assert_called_once_with("https://x.com/a")

    @pytest.mark.asyncio
    async def test_skips_jobs_outside_window(self, monkeypatch):
        today = date.today()
        # vagas fora da janela: 30d (muito nova) e 120d (muito velha — já purged)
        jobs = {
            "https://x.com/fresh":   {"publication_date": (today - timedelta(days=30)).isoformat()},
            "https://x.com/ancient": {"publication_date": (today - timedelta(days=120)).isoformat()},
        }
        repo, _ = self._make_repo(jobs, {})

        class FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): pass
            async def get(self, url, **kw):
                raise AssertionError(f"não devia ter chamado {url}")

        monkeypatch.setattr(r.httpx, "AsyncClient", lambda **kw: FakeClient())

        stats = await r.revalidate_aging_jobs(repo)
        assert stats["checked"] == 0
        repo.core.delete_job_by_url.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_jobs_without_pub_date(self, monkeypatch):
        jobs = {
            "https://x.com/no-date": {"publication_date": None},
            "https://x.com/bad-date": {"publication_date": "lixo"},
        }
        repo, _ = self._make_repo(jobs, {})

        class FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): pass
            async def get(self, url, **kw):
                raise AssertionError("não devia ter chamado")

        monkeypatch.setattr(r.httpx, "AsyncClient", lambda **kw: FakeClient())

        stats = await r.revalidate_aging_jobs(repo)
        assert stats["checked"] == 0

    @pytest.mark.asyncio
    async def test_delete_failure_counted_in_failed(self, monkeypatch):
        today = date.today()
        in_window = (today - timedelta(days=85)).isoformat()
        jobs = {
            "https://x.com/a": {"publication_date": in_window, "source": "linkedin"},
        }
        repo, _ = self._make_repo(jobs, {"https://x.com/a": 404})
        # Simula falha no core
        repo.core.delete_job_by_url = AsyncMock(return_value=False)
        mark_expired_mock = AsyncMock(return_value=True)
        monkeypatch.setattr(r.tracker, "mark_expired", mark_expired_mock)

        class FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): pass
            async def get(self, url, **kw):
                return MagicMock(status_code=404)

        monkeypatch.setattr(r.httpx, "AsyncClient", lambda **kw: FakeClient())

        stats = await r.revalidate_aging_jobs(repo)
        assert stats["expired"] == 1   # ainda contou como expired (foi identificada)
        assert stats["failed"] == 1    # mas marcamos a falha do delete
        # local.delete_url NÃO foi chamado pq o core falhou
        repo.local.delete_url.assert_not_called()
        # mark_expired tambem NÃO foi chamado (so se o delete do core passou)
        mark_expired_mock.assert_not_called()

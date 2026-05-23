"""Testes para CSVJobStore (sink CSV append-only)."""
import csv
import os
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from src.persistence.csv_store import CSV_COLUMNS, CSVJobStore


@pytest.fixture
def csv_path(tmp_path: Path) -> Path:
    return tmp_path / "job.csv"


def _make_payload(**overrides) -> dict:
    base = {
        "job_url": "https://example.com/job/1",
        "job_title": "Engenheiro de Software",
        "company": "ACME",
        "location_raw": "São Paulo - SP",
        "state_code": "SP",
        "country_code": "BR",
        "work_type": "Remoto",
        "hiring_regime": "CLT",
        "salary_raw": "R$ 8.000",
        "salary_min": 8000,
        "salary_max": 8000,
        "salary_currency": "BRL",
        "publication_date": "2026-05-03",
        "source": "test",
        "scraped_at": "2026-05-03T12:00:00+00:00",
    }
    base.update(overrides)
    return base


class TestCSVJobStore:
    def test_creates_header_on_first_use(self, csv_path):
        CSVJobStore(path=str(csv_path))
        assert csv_path.exists()
        with csv_path.open(encoding="utf-8") as f:
            header = next(csv.reader(f))
        assert header == CSV_COLUMNS

    def test_append_writes_row(self, csv_path):
        store = CSVJobStore(path=str(csv_path))
        ok = store.append(_make_payload())
        assert ok is True

        with csv_path.open(encoding="utf-8") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 2  # header + 1 row
        assert rows[1][0] == "https://example.com/job/1"

    def test_append_without_url_returns_false(self, csv_path):
        store = CSVJobStore(path=str(csv_path))
        assert store.append({"job_title": "X"}) is False

    def test_appends_are_cumulative(self, csv_path):
        store = CSVJobStore(path=str(csv_path))
        store.append(_make_payload(job_url="https://example.com/1"))
        store.append(_make_payload(job_url="https://example.com/2"))
        store.append(_make_payload(job_url="https://example.com/3"))

        with csv_path.open(encoding="utf-8") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 4  # header + 3

    def test_handles_unicode_correctly(self, csv_path):
        store = CSVJobStore(path=str(csv_path))
        store.append(_make_payload(
            job_title="Desenvolvedor Sênior - Pleno",
            location_raw="São Paulo, SP",
        ))
        with csv_path.open(encoding="utf-8") as f:
            content = f.read()
        assert "Sênior" in content
        assert "São Paulo" in content

    def test_none_values_become_empty_string(self, csv_path):
        store = CSVJobStore(path=str(csv_path))
        store.append(_make_payload(salary_min=None, salary_max=None, state_code=None))

        with csv_path.open(encoding="utf-8") as f:
            rows = list(csv.reader(f))
        # state_code está em CSV_COLUMNS na posição 4 (0-indexed)
        idx_state = CSV_COLUMNS.index("state_code")
        idx_min = CSV_COLUMNS.index("salary_min")
        assert rows[1][idx_state] == ""
        assert rows[1][idx_min] == ""

    def test_duplicate_url_is_not_appended(self, csv_path):
        """A mesma job_url emitida 2x só grava 1 linha."""
        store = CSVJobStore(path=str(csv_path))
        ok1 = store.append(_make_payload(job_url="https://x/dup"))
        ok2 = store.append(_make_payload(job_url="https://x/dup", job_title="Outro"))
        assert ok1 is True
        assert ok2 is False
        with csv_path.open(encoding="utf-8") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 2  # header + 1 linha (não 2)

    def test_dedup_persists_across_instances(self, csv_path):
        """URLs gravadas num run anterior são respeitadas no próximo."""
        store = CSVJobStore(path=str(csv_path))
        store.append(_make_payload(job_url="https://x/run1"))

        # Novo store: pré-carrega URLs do arquivo existente
        store2 = CSVJobStore(path=str(csv_path))
        ok = store2.append(_make_payload(job_url="https://x/run1", job_title="Outro"))
        assert ok is False
        with csv_path.open(encoding="utf-8") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 2  # header + 1 (não 2)

    def test_existing_file_with_header_is_preserved(self, csv_path):
        # Cria arquivo manualmente com header + 1 linha
        with csv_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(CSV_COLUMNS)
            writer.writerow(["https://x/1"] + [""] * (len(CSV_COLUMNS) - 1))

        # Instancia o store - não deve sobrescrever
        store = CSVJobStore(path=str(csv_path))
        store.append(_make_payload(job_url="https://x/2"))

        with csv_path.open(encoding="utf-8") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 3  # header + linha original + nova


class TestMonthlyRotation:
    """Rotação mensal do job.csv: arquivos de meses anteriores são renomeados."""

    def _set_mtime(self, path: Path, when: datetime) -> None:
        ts = when.timestamp()
        os.utime(path, (ts, ts))

    def test_does_not_rotate_when_file_is_current_month(self, csv_path):
        # Cria arquivo populado e seta mtime para "agora" (mesmo mês)
        store = CSVJobStore(path=str(csv_path))
        store.append(_make_payload(job_url="https://x/1"))
        self._set_mtime(csv_path, datetime.now())

        # Re-instanciar não deve rotacionar
        CSVJobStore(path=str(csv_path))
        assert csv_path.exists()
        # Não deve haver arquivos rotacionados no diretório
        rotated = list(csv_path.parent.glob("job-*.csv"))
        assert rotated == []

    def test_rotates_when_file_is_previous_month(self, csv_path):
        # Cria arquivo populado e seta mtime para 40 dias atrás
        store = CSVJobStore(path=str(csv_path))
        store.append(_make_payload(job_url="https://x/old"))
        old_dt = datetime.now() - timedelta(days=40)
        self._set_mtime(csv_path, old_dt)

        # Re-instanciar deve rotacionar
        CSVJobStore(path=str(csv_path))

        suffix = f"{old_dt.year:04d}-{old_dt.month:02d}"
        rotated_path = csv_path.with_name(f"{csv_path.stem}-{suffix}.csv")
        assert rotated_path.exists(), "Arquivo do mês anterior deveria ter sido rotacionado"

        # job.csv novo deve existir com apenas o header
        assert csv_path.exists()
        with csv_path.open(encoding="utf-8") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 1  # só header

        # E o arquivo rotacionado preserva a vaga antiga
        with rotated_path.open(encoding="utf-8") as f:
            rotated_rows = list(csv.reader(f))
        assert len(rotated_rows) == 2  # header + 1 vaga

    def test_dedup_after_rotation_loads_only_current_month(self, csv_path):
        # Gera arquivo do mês anterior com uma URL "https://x/old"
        store = CSVJobStore(path=str(csv_path))
        store.append(_make_payload(job_url="https://x/old"))
        self._set_mtime(csv_path, datetime.now() - timedelta(days=40))

        # Após rotação, a URL "antiga" não está no set do novo store —
        # ou seja, se a engine reportar a mesma URL agora, é aceita.
        # (A dedup mais ampla é feita pelo LocalJobStore/tracker, não aqui.)
        new_store = CSVJobStore(path=str(csv_path))
        assert new_store.append(_make_payload(job_url="https://x/old")) is True

    def test_rotation_avoids_overwriting_existing_rotated_file(self, csv_path):
        # Cria primeiro arquivo rotacionado manualmente
        old_dt = datetime.now() - timedelta(days=40)
        suffix = f"{old_dt.year:04d}-{old_dt.month:02d}"
        existing_rotated = csv_path.with_name(f"{csv_path.stem}-{suffix}.csv")
        existing_rotated.write_text("preexisting\n", encoding="utf-8")

        # Cria job.csv com mtime do mesmo mês "antigo"
        store = CSVJobStore(path=str(csv_path))
        store.append(_make_payload(job_url="https://x/conflict"))
        self._set_mtime(csv_path, old_dt)

        # Re-instancia: como o arquivo rotacionado JÁ existe, deve criar
        # uma variante com sufixo .1 (não sobrescreve o preexistente).
        CSVJobStore(path=str(csv_path))
        assert existing_rotated.exists()
        assert existing_rotated.read_text(encoding="utf-8") == "preexisting\n"

        variant = csv_path.with_name(f"{csv_path.stem}-{suffix}.csv.1")
        assert variant.exists()

    def test_rotation_skips_when_file_missing_or_empty(self, csv_path):
        # Arquivo inexistente: rotação não deve falhar
        store = CSVJobStore(path=str(csv_path))
        # Foi criado pelo store com apenas o header
        assert csv_path.exists()

        # Arquivo vazio (tamanho zero): também não rotaciona
        csv_path.write_bytes(b"")
        CSVJobStore(path=str(csv_path))
        # Deve haver apenas o header agora
        with csv_path.open(encoding="utf-8") as f:
            rows = list(csv.reader(f))
        assert rows == [CSV_COLUMNS]

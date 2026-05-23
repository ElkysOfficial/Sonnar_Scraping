"""Testes do helper de enrichment (sub-PR 4.3 do epico v3.0.0)."""
import asyncio

import pytest

from src.utils.job_enrichment import enrich_sync, enrich_async


# =====================================================================
# Fixtures: mockam translate_to_pt no proprio modulo (sem baixar Argos)
# =====================================================================

class _FakeCalls:
    def __init__(self):
        self.calls: list[tuple[str, str]] = []


@pytest.fixture
def fake_translator(monkeypatch):
    """Substitui translate_to_pt no modulo translator pelo fake.

    Usa monkeypatch.setattr no atributo do modulo ja importado - precisa
    desse caminho (e nao setitem em sys.modules) pra interceptar o
    'from src.utils import translator' dinamico do _safe_translate_to_pt,
    que resolve pelo atributo do pacote, nao por sys.modules.
    """
    from src.utils import translator as t_mod

    state = _FakeCalls()

    def fake_translate_to_pt(text: str, src_lang: str) -> str:
        state.calls.append((src_lang, text[:50]))
        # Insere marcadores PT pra que extract_responsibilities encontre
        # a secao apos a traducao mockada
        return f"Responsabilidades\n- {text[:200]}\nRequisitos\n- Python"

    monkeypatch.setattr(t_mod, "translate_to_pt", fake_translate_to_pt)
    return state


# =====================================================================
# Caminho rapido: vagas em portugues nao traduzem
# =====================================================================

class TestPortuguese:
    def test_extracts_without_translation(self, fake_translator):
        desc = (
            "Sobre nós\nSomos uma empresa.\n\n"
            "Responsabilidades\n"
            "- Desenvolver APIs em Python e Go\n"
            "- Manter pipelines de dados em produção\n\n"
            "Requisitos\n- 5 anos"
        )
        lang, resp = enrich_sync("Vaga PT", desc)
        assert lang == "pt"
        assert resp is not None
        assert "Desenvolver APIs" in resp
        assert "5 anos" not in resp
        # Nao traduziu (caminho rapido)
        assert fake_translator.calls == []

    def test_async_pt_skips_to_thread(self, fake_translator):
        async def run():
            desc = "Responsabilidades\n- Backend em Go\n- Observabilidade\n- Mentoria"
            lang, resp = await enrich_async("Vaga PT", desc)
            assert lang == "pt"
            assert resp is not None
            assert fake_translator.calls == []
        asyncio.run(run())


# =====================================================================
# Tradução pra vagas nao-PT
# =====================================================================

class TestNonPortuguese:
    def test_japanese_gets_translated(self, fake_translator):
        # Texto japones com marcadores fortes (kana + kanji)
        desc = "データサイエンティスト/フルフレックス/リモート可。" * 5
        lang, resp = enrich_sync("データ", desc)
        assert lang == "ja"
        # Translator foi chamado com src='ja'
        assert any(c[0] == "ja" for c in fake_translator.calls)
        # responsibilities tem o conteudo do mock (porque incluimos
        # 'Responsabilidades' no fake translator)
        assert resp is not None
        assert "Responsabilidades" not in resp  # cabecalho foi consumido
        # Mas o body sobrou
        assert len(resp) > 10

    def test_english_gets_translated(self, fake_translator):
        desc = (
            "We are a fast-growing team looking for senior engineers. " * 5
            + "Responsibilities include building APIs and mentoring."
        )
        lang, resp = enrich_sync("Senior Engineer", desc)
        assert lang == "en"
        assert any(c[0] == "en" for c in fake_translator.calls)


# =====================================================================
# Quando NAO encontra responsibilities, fica None (regra de produto)
# =====================================================================

class TestEmptyResponsibilitiesPolicy:
    def test_pt_short_prose_returns_none(self, fake_translator):
        # Texto curto em PT sem cabecalho nem bullets - cai pro None
        desc = "Empresa busca profissional dedicado para área administrativa."
        lang, resp = enrich_sync("Vaga", desc)
        assert lang == "pt"
        assert resp is None  # SEM fallback pra description completa

    def test_empty_description(self, fake_translator):
        lang, resp = enrich_sync("", "")
        assert lang is None
        assert resp is None


# =====================================================================
# Hint de idioma (otimizacao quando a engine ja sabe)
# =====================================================================

class TestHintLang:
    def test_hint_skips_detection(self, fake_translator):
        # Texto que detect_lang chamaria de 'pt' mas hint='en' forca tradutor
        desc = "About us\nWe build APIs.\n\nResponsibilities\n- Code\n- Mentor"
        lang, resp = enrich_sync("Engineer", desc, hint_lang="en")
        assert lang == "en"
        assert any(c[0] == "en" for c in fake_translator.calls)

    def test_hint_pt_skips_translation(self, fake_translator):
        # Mesmo se a description tivesse aspecto EN, hint='pt' pula tradutor
        desc = (
            "Responsabilidades\n"
            "- Cuidar do backend em Python\n"
            "- Mentoria do time"
        )
        lang, resp = enrich_sync("Vaga", desc, hint_lang="pt")
        assert lang == "pt"
        assert resp is not None
        assert fake_translator.calls == []


# =====================================================================
# Async wraps sync corretamente
# =====================================================================

class TestAsyncWrap:
    def test_async_japanese(self, fake_translator):
        async def run():
            desc = "データサイエンティスト" * 20
            lang, resp = await enrich_async("データ", desc)
            assert lang == "ja"
            return resp
        result = asyncio.run(run())
        # Translator foi chamado (mesmo via to_thread)
        assert any(c[0] == "ja" for c in fake_translator.calls)

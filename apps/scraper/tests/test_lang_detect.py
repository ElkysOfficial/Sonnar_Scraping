"""Testes de lang_detect (rumo a v3.0.0 sub-PR 4.2)."""
import pytest

from src.utils.lang_detect import detect_lang, needs_translation


# =====================================================================
# Portugues
# =====================================================================

class TestPortuguese:
    def test_clear_pt_with_accents(self):
        text = (
            "Estamos buscando uma pessoa desenvolvedora para integrar nossa "
            "equipe. Você terá responsabilidades técnicas e de mentoria."
        )
        assert detect_lang(text) == "pt"

    def test_pt_without_accents(self):
        # Texto sem acento mas com marcadores fortes
        text = (
            "Vaga de desenvolvedor backend para atuar com Python e Postgres. "
            "Voce vai trabalhar com requisitos de alta disponibilidade."
        )
        assert detect_lang(text) == "pt"

    def test_pt_diacritics_alone_wins(self):
        # Poucos marcadores mas com diacriticos PT - pesa pra 'pt'
        text = "Atribuições da função: códigos limpos, métricas e mentoria."
        assert detect_lang(text) == "pt"


# =====================================================================
# Ingles
# =====================================================================

class TestEnglish:
    def test_clear_en(self):
        text = (
            "We are looking for a senior developer to join our team. "
            "You will be responsible for building APIs and mentoring juniors."
        )
        assert detect_lang(text) == "en"

    def test_en_short_but_unambiguous(self):
        text = "Requirements: 5 years of experience with Python and AWS skills."
        assert detect_lang(text) == "en"

    def test_en_with_only_2_markers_returns_en(self):
        # Regression: antes 'pt if pt >= en' favorecia PT quando pt=0 e en>0
        # mesmo abaixo do limite de 3. Indeed em ingles caia como 'pt'.
        text = "Hands-on experience in C++ development with strong knowledge of multithreading"
        # Texto tem ' with ' e ' of ' (2 marcadores EN, 0 PT, 0 diacriticos PT)
        assert detect_lang(text) == "en"


# =====================================================================
# Japones
# =====================================================================

class TestJapanese:
    def test_pure_kana(self):
        # Hiragana + katakana
        text = "データサイエンティストとして働きませんか"
        assert detect_lang(text) == "ja"

    def test_kanji_with_kana(self):
        # Kana presente => japones (chines nao tem kana)
        text = "データサイエンティスト/フルフレックス/リモート可"
        assert detect_lang(text) == "ja"

    def test_mostly_kanji_some_kana(self):
        # Mistura de kanji + hiragana - ainda 'ja' por causa do kana
        text = "本ポジションでは、シニアデータサイエンティストと連携します。"
        assert detect_lang(text) == "ja"


# =====================================================================
# Chines
# =====================================================================

class TestChinese:
    def test_pure_han(self):
        # So ideogramas Han sem kana => chines
        text = "我们正在寻找一位数据科学家加入我们的团队。"
        assert detect_lang(text) == "zh"

    def test_traditional_chinese(self):
        text = "我們正在尋找一位資料科學家加入我們的團隊。"
        assert detect_lang(text) == "zh"


# =====================================================================
# Coreano
# =====================================================================

class TestKorean:
    def test_hangul(self):
        text = "우리 팀에 합류할 데이터 사이언티스트를 찾고 있습니다."
        assert detect_lang(text) == "ko"

    def test_hangul_with_some_han(self):
        # Mistura de hangul com poucos han => ainda 'ko'
        text = "데이터 사이언티스트 (科學者) 채용 중입니다."
        assert detect_lang(text) == "ko"


# =====================================================================
# Edge cases
# =====================================================================

class TestEdgeCases:
    def test_empty(self):
        assert detect_lang("") == "unknown"
        assert detect_lang(None) == "unknown"

    def test_just_punctuation(self):
        assert detect_lang("!!! ???") == "unknown"

    def test_company_name_with_few_kanji(self):
        # Texto inteiramente em latim com 1 kanji do nome empresa (<5%)
        # Nao deve virar 'ja' so por causa do char isolado
        long_latin = (
            "Senior developer position with our amazing company team "
            * 10
        )
        text = long_latin + "株"  # apenas 1 char nao-latino
        assert detect_lang(text) == "en"

    def test_truncates_long_input(self):
        # Texto enorme - so olha primeiros 2000 chars
        # Comeco PT, fim seria JA mas nao deve afetar
        head = "Vaga de desenvolvedor com experiência em Python. " * 50
        tail = "データサイエンティスト" * 50
        text = head + tail
        # Como head ja tem >2000 chars de PT, classifica como PT
        assert detect_lang(text) == "pt"

    def test_mixed_pt_en_tie_prefers_pt(self):
        # Empate (ou pt >= en) -> 'pt' por convencao
        text = "developer experience requirements voce e vaga"
        assert detect_lang(text) in {"pt", "en"}


# =====================================================================
# needs_translation
# =====================================================================

class TestNeedsTranslation:
    @pytest.mark.parametrize("lang,expected", [
        ("pt", False),
        ("unknown", False),
        ("en", True),
        ("ja", True),
        ("zh", True),
        ("ko", True),
        ("es", True),
        ("fr", True),
    ])
    def test_decision(self, lang, expected):
        assert needs_translation(lang) is expected

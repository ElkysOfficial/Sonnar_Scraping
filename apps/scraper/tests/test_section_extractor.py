"""Testes do section_extractor (rumo a v3.0.0)."""
import pytest

from src.utils.section_extractor import (
    clean_html,
    extract_responsibilities,
    is_mostly_bullets,
)


# =====================================================================
# clean_html
# =====================================================================

class TestCleanHtml:
    def test_empty(self):
        assert clean_html("") == ""
        assert clean_html(None) == ""

    def test_strips_inline_tags(self):
        assert clean_html("<p>Hello <b>world</b></p>") == "Hello world"

    def test_br_becomes_newline(self):
        assert clean_html("A<br>B<br/>C").split("\n") == ["A", "B", "C"]

    def test_li_becomes_dash(self):
        out = clean_html("<ul><li>X</li><li>Y</li></ul>")
        assert "- X" in out
        assert "- Y" in out

    def test_entities(self):
        assert clean_html("&amp; &nbsp;OK") == "& OK"

    def test_collapses_whitespace(self):
        assert clean_html("  A   B  ") == "A B"

    def test_preserves_line_order(self):
        out = clean_html("<p>1</p><p>2</p><p>3</p>")
        assert out.split("\n") == ["1", "2", "3"]


# =====================================================================
# is_mostly_bullets
# =====================================================================

class TestIsMostlyBullets:
    def test_dash_bullets(self):
        assert is_mostly_bullets("- A\n- B\n- C\n- D")

    def test_unicode_bullets(self):
        assert is_mostly_bullets("• A\n• B\n• C")

    def test_numbered(self):
        assert is_mostly_bullets("1. A\n2. B\n3. C")

    def test_prose_not_bullets(self):
        text = "We are a great company looking for engineers who love building products."
        assert not is_mostly_bullets(text)

    def test_too_few_lines(self):
        # menos de 3 linhas => False mesmo se forem bullets
        assert not is_mostly_bullets("- A\n- B")

    def test_mixed_half_threshold(self):
        # 2 bullets + 2 prose = 50% - passa
        text = "- A\n- B\nIntro prose\nMais um texto"
        assert is_mostly_bullets(text)


# =====================================================================
# extract_responsibilities — PT
# =====================================================================

class TestExtractResponsibilitiesPT:
    def test_section_marker_simple(self):
        desc = (
            "Sobre nós\nSomos uma empresa.\n\n"
            "Responsabilidades\n"
            "- Codar features novas com muito carinho e atenção\n"
            "- Revisar PRs do time com dedicação total\n\n"
            "Requisitos\n- Python"
        )
        out = extract_responsibilities(desc, "pt")
        assert out is not None
        assert "Codar features novas" in out
        assert "Somos uma empresa" not in out
        assert "Python" not in out

    def test_descricao_da_vaga_marker(self):
        desc = (
            "Quem somos\nEmpresa X.\n\n"
            "Descrição da vaga\n"
            "Manter sistemas legados e ajudar na migração para microsserviços.\n\n"
            "Qualificações\n- 5 anos de experiência"
        )
        out = extract_responsibilities(desc, "pt")
        assert out is not None
        assert "microsserviços" in out
        assert "5 anos" not in out

    def test_html_with_lists(self):
        desc = (
            "<p>Sobre nós</p><p>texto</p>"
            "<h3>Responsabilidades</h3>"
            "<ul><li>Desenvolver APIs em Python</li>"
            "<li>Manter pipelines de dados em produção</li></ul>"
            "<h3>Benefícios</h3><ul><li>VR</li></ul>"
        )
        out = extract_responsibilities(desc, "pt")
        assert out is not None
        assert "Desenvolver APIs" in out
        assert "VR" not in out

    def test_bullets_fallback_no_heading(self):
        desc = (
            "- Desenvolver APIs em Python\n"
            "- Manter pipelines de dados\n"
            "- Code review do time\n"
            "- Mentoria para juniores"
        )
        out = extract_responsibilities(desc, "pt")
        assert out is not None
        assert "Mentoria" in out

    def test_no_match_returns_none(self):
        desc = (
            "Empresa busca profissional dedicado e proativo para área "
            "administrativa, com perfil dinâmico e visão analítica."
        )
        assert extract_responsibilities(desc, "pt") is None

    def test_accents_optional(self):
        # Sem acento mas pega - heuristica deve casar 'atribuicoes'
        desc = (
            "Atribuicoes\n"
            "Cuidar do backend em Python e Java do time.\n"
            "Coordenar migracao de banco de dados.\n\n"
            "Requisitos\nPython"
        )
        out = extract_responsibilities(desc, "pt")
        assert out is not None
        assert "backend" in out
        assert "Requisitos" not in out


# =====================================================================
# extract_responsibilities — EN
# =====================================================================

class TestExtractResponsibilitiesEN:
    def test_responsibilities_marker(self):
        desc = (
            "About us\nWe are a company.\n\n"
            "Responsibilities\n"
            "- Build APIs and design pipelines\n"
            "- Mentor junior engineers\n\n"
            "Requirements\n- Python"
        )
        out = extract_responsibilities(desc, "en")
        assert out is not None
        assert "Build APIs" in out
        assert "Python" not in out

    def test_what_youll_do(self):
        desc = (
            "Overview\nA fast-growing team.\n\n"
            "What you'll do:\n"
            "- Build distributed systems\n"
            "- Own service reliability\n\n"
            "Qualifications\n- 5 years"
        )
        out = extract_responsibilities(desc, "en")
        assert out is not None
        assert "distributed systems" in out
        assert "5 years" not in out

    def test_key_responsibilities_longer_match(self):
        # 'Key Responsibilities' deve ser preferido a 'Responsibilities'
        # mesmo se 'Responsibilities' aparecer em outro lugar antes.
        desc = (
            "Key Responsibilities\n"
            "- Engineer at scale\n"
            "- Drive technical excellence\n"
            "- Lead initiatives\n\n"
            "Skills Matrix\n- AWS"
        )
        out = extract_responsibilities(desc, "en")
        assert out is not None
        assert "Engineer at scale" in out
        assert "AWS" not in out

    def test_in_this_role(self):
        desc = (
            "About\nTeam intro.\n\n"
            "In this role\n"
            "You'll architect and own data infra.\n"
            "You'll partner with PMs and design.\n\n"
            "Requirements\n- 8 years"
        )
        out = extract_responsibilities(desc, "en")
        assert out is not None
        assert "data infra" in out
        assert "8 years" not in out


# =====================================================================
# Edge cases
# =====================================================================

class TestEdgeCases:
    def test_empty(self):
        assert extract_responsibilities("", "pt") is None
        assert extract_responsibilities(None, "pt") is None

    def test_unknown_lang(self):
        # Japones nao e suportado - cai pra fallback (None)
        assert extract_responsibilities("Responsibilities\n- Code", "ja") is None

    def test_too_short_body_falls_back_to_bullets(self):
        # Cabecalho existe mas corpo vazio - bullets dominantes salvam
        desc = (
            "Responsabilidades:\n\n"
            "- Construir produto digital\n"
            "- Crescer empresa B2B\n"
            "- Inspirar outros engenheiros"
        )
        out = extract_responsibilities(desc, "pt")
        assert out is not None

    def test_heading_with_colon_and_dash(self):
        desc = (
            "Sobre\nEmpresa.\n\n"
            "Responsabilidades : \n"
            "- Backend em Go\n"
            "- Observabilidade\n\n"
            "Benefícios"
        )
        out = extract_responsibilities(desc, "pt")
        assert out is not None
        assert "Backend" in out

    def test_only_about_section(self):
        # Tem 'sobre' mas nao tem 'responsabilidades' nem bullets dominantes
        desc = (
            "Sobre nós\nSomos uma empresa fundada em 2020 com "
            "missão de transformar o mercado financeiro do Brasil."
        )
        assert extract_responsibilities(desc, "pt") is None

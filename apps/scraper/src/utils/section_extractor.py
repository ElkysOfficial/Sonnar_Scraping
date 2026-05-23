"""Extrai a secao de "responsabilidades" de uma description de vaga.

Funciona com HTML ou texto plano, em PT ou EN. Algoritmo em 3 camadas
(cai pra proxima quando a anterior falha):

  1. **Secao marcada**: procura cabecalho em INCLUDE_MARKERS (ex:
     "Responsabilidades", "What you'll do") e devolve o texto ate o proximo
     cabecalho conhecido (de qualquer categoria) ou ate o fim.

  2. **Bullets dominantes**: se a description e majoritariamente lista
     (>=50% das linhas comecam com -, *, bullet, ou numero.), considera
     que tudo descreve atividades.

  3. **Fallback**: devolve ``None`` - o caller usa a description completa.

Detalhes de implementacao:
  - clean_html() faz strip simples de tags sem dependencia extra (html5lib
    seria pesado pro caso). Converte <br>, <p>, <li> em quebras de linha
    e itens, e decodifica entidades comuns.
  - Os cabecalhos sao casados via regex tolerante a pontuacao leve
    (": ", " - ", " :"), prefixos markdown (#, *, -) e variantes de
    capitalizacao. Usamos sorted(by len desc) pra que "Key Responsibilities"
    seja casado antes de "Responsibilities".
"""
from __future__ import annotations

import re
from dataclasses import dataclass


Lang = str  # 'pt' | 'en'


# =====================================================================
# Marcadores de cabecalho
# =====================================================================

# Cabecalhos que sinalizam INICIO da secao desejada.
INCLUDE_MARKERS: dict[Lang, list[str]] = {
    "pt": [
        "responsabilidades e atribuições",
        "responsabilidades e atribuicoes",
        "responsabilidades",
        "principais atividades",
        "atividades",
        "atribuições",
        "atribuicoes",
        "sobre a vaga",
        "o que você vai fazer",
        "o que voce vai fazer",
        "suas atividades",
        "descrição da vaga",
        "descricao da vaga",
        "o que você vai encontrar",
        "o que voce vai encontrar",
        "atuação",
        "atuacao",
    ],
    "en": [
        "key responsibilities",
        "main responsibilities",
        "position responsibilities",
        "responsibilities",
        "what you'll do",
        "what you will do",
        "what you’ll do",  # apostrofe tipografico
        "job description",
        "duties",
        "your role",
        "in this role",
        "the role",
    ],
}

# Cabecalhos que sinalizam INICIO de outra secao (FIM da secao desejada).
EXCLUDE_MARKERS: dict[Lang, list[str]] = {
    "pt": [
        # sobre empresa
        "sobre nós", "sobre nos", "somos", "nossa missão", "nossa missao",
        "quem somos", "a empresa",
        # requisitos
        "requisitos", "qualificações", "qualificacoes",
        "você irá se destacar", "voce ira se destacar",
        "competências", "competencias",
        "conhecimentos necessários", "conhecimentos necessarios",
        # diferenciais
        "diferenciais", "será um diferencial", "sera um diferencial",
        # beneficios
        "benefícios", "beneficios", "o que oferecemos",
        "pacote de benefícios", "pacote de beneficios",
        # educacao
        "escolaridade", "formação acadêmica", "formacao academica",
        # logistica
        "local de trabalho", "horário", "horario",
        "modelo de trabalho", "remuneração", "remuneracao",
        "faixa salarial",
    ],
    "en": [
        "about us", "who we are", "our mission", "overview", "our story",
        "requirements", "must have", "qualifications",
        "required skills", "skills matrix",
        "nice to have", "bonus points", "preferred",
        "benefits", "what we offer", "perks", "compensation",
        "education", "degree", "academic background",
        "location", "salary", "schedule", "work model",
    ],
}


# =====================================================================
# Helpers de HTML
# =====================================================================

_BR_TAG = re.compile(r"<br\s*/?>", re.IGNORECASE)
_BLOCK_END = re.compile(r"</(p|li|div|h[1-6]|tr|td|th)\s*>", re.IGNORECASE)
_LI_OPEN = re.compile(r"<li[^>]*>", re.IGNORECASE)
_ANY_TAG = re.compile(r"<[^>]+>")
_MULTISPACE = re.compile(r"[\t ]+")


def clean_html(text: str | None) -> str:
    """Strip simples de HTML preservando estrutura de linhas e listas."""
    if not text:
        return ""
    text = _BR_TAG.sub("\n", text)
    text = _BLOCK_END.sub("\n", text)
    text = _LI_OPEN.sub("- ", text)
    text = _ANY_TAG.sub(" ", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&ldquo;", '"')
        .replace("&rdquo;", '"')
    )
    lines = [_MULTISPACE.sub(" ", line).strip() for line in text.split("\n")]
    lines = [line for line in lines if line]
    return "\n".join(lines)


# =====================================================================
# Heuristicas de secao
# =====================================================================

_BULLET_LINE = re.compile(r"^\s*([-•*●▪]|\d+[.)])\s+")
# heading com tolerancia: opcionalmente prefixo markdown/bullet + ate ":"/"-" no fim
_HEADING_TAIL = r"[\s ]*[:\-–—]?\s*$"


@dataclass
class Section:
    heading: str
    body: str


def _compile_heading_pattern(markers: list[str]) -> re.Pattern[str]:
    """Compila regex que casa qualquer um dos markers no inicio de linha.

    Ordena por tamanho descendente pra que multi-palavras casem antes das
    versoes mais curtas ("Key Responsibilities" vs "Responsibilities").
    """
    escaped = [re.escape(m) for m in sorted(markers, key=len, reverse=True)]
    body = "|".join(escaped)
    pattern = (
        r"(?im)^[\s>#\*\-•]{0,4}(?P<heading>(?:" + body + r"))" + _HEADING_TAIL
    )
    return re.compile(pattern)


def _find_section(
    text: str, include: list[str], exclude_all: list[str]
) -> str | None:
    """Procura o cabecalho de inclusao e retorna o corpo da secao."""
    include_re = _compile_heading_pattern(include)
    stopper_re = _compile_heading_pattern(exclude_all + include)
    match = include_re.search(text)
    if not match:
        return None
    start = match.end()
    rest = text[start:]
    stop = stopper_re.search(rest)
    end = start + stop.start() if stop else len(text)
    body = text[start:end].strip()
    return body or None


def is_mostly_bullets(text: str | None) -> bool:
    """True se ao menos metade das linhas (>=3) sao bullets/itens."""
    cleaned = clean_html(text)
    lines = [line for line in cleaned.split("\n") if line.strip()]
    if len(lines) < 3:
        return False
    bullets = sum(1 for line in lines if _BULLET_LINE.match(line))
    return bullets / len(lines) >= 0.5


def extract_responsibilities(
    description: str | None, lang: Lang = "pt"
) -> str | None:
    """Devolve o trecho de responsabilidades da description.

    Args:
        description: texto bruto (HTML ou texto plano).
        lang: ``'pt'`` ou ``'en'``. Outros idiomas devolvem ``None`` - cabe
            ao pipeline de tradução normalizar antes de chamar.

    Returns:
        Texto limpo (sem HTML) com as atividades, ou ``None`` quando nenhum
        marcador foi encontrado e a description nao parece dominada por
        bullets. O caller deve usar a description completa nesse caso.
    """
    if not description:
        return None
    if lang not in INCLUDE_MARKERS:
        return None
    cleaned = clean_html(description)
    if not cleaned:
        return None

    # 1) Secao marcada
    body = _find_section(
        cleaned, INCLUDE_MARKERS[lang], EXCLUDE_MARKERS[lang]
    )
    # Exige conteudo minimo - evita devolver "Responsabilidades\n" vazio
    if body and len(body) >= 30:
        return body

    # 2) Bullets dominantes
    if is_mostly_bullets(cleaned):
        return cleaned

    # 3) Fallback
    return None

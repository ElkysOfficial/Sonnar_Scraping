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
from functools import lru_cache


Lang = str  # 'pt' | 'en'


# =====================================================================
# Marcadores de cabecalho
# =====================================================================

# Cabecalhos que sinalizam INICIO da secao desejada.
INCLUDE_MARKERS: dict[Lang, list[str]] = {
    "pt": [
        # Variantes de "responsabilidades"
        "você assumirá as seguintes responsabilidades",
        "voce assumira as seguintes responsabilidades",
        "suas principais responsabilidades",
        "principais responsabilidades",
        "suas responsabilidades",
        "responsabilidades e atribuições",
        "responsabilidades e atribuicoes",
        "responsabilidades",
        # Variantes de "atividades"
        "principais atividades",
        "atividades a serem realizadas",
        "atividades do cargo",
        "suas atividades",
        "atividades",
        # Variantes de "atribuições"
        "principais atribuições",
        "principais atribuicoes",
        "atribuições",
        "atribuicoes",
        # Variantes de "funções"
        "principais funções",
        "principais funcoes",
        "funções",
        "funcoes",
        "função",
        "funcao",
        # Tarefas / rotinas
        "principais tarefas",
        "tarefas",
        "rotinas",
        # Sobre/descrição da vaga
        "sobre a vaga",
        "sobre a posição",
        "sobre a posicao",
        "descrição da vaga",
        "descricao da vaga",
        "descrição e responsabilidades",
        "descricao e responsabilidades",
        # O que vai fazer
        "o que você vai fazer",
        "o que voce vai fazer",
        "o que você fará",
        "o que voce fara",
        "o que esperamos de você",
        "o que esperamos de voce",
        "o que você vai encontrar",
        "o que voce vai encontrar",
        # Outros
        "atuação",
        "atuacao",
        "objetivo da vaga",
        "papel do profissional",
    ],
    "en": [
        "key responsibilities",
        "main responsibilities",
        "position responsibilities",
        "your responsibilities",
        "responsibilities",
        "what you'll do",
        "what you will do",
        "what you’ll do",  # apostrofe tipografico
        "what you'll be doing",
        "what you will be doing",
        "what you'll own",
        "what you will own",
        "what you’ll own",
        "you'll be responsible for",
        "you will be responsible for",
        "you’ll be responsible for",
        "you'll work on",
        "you will work on",
        "job description",
        "the role",
        "your role",
        "in this role",
        "duties",
        "day to day",
        "day-to-day",
        "the job",
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
_HEADING_TAIL = r"(?:[ 	]*[:\-–—]|[ 	]*$|(?=[ 	]+))"


@dataclass
class Section:
    heading: str
    body: str


def _compile_heading_pattern(markers: list[str]) -> re.Pattern[str]:
    """Compila regex que casa qualquer um dos markers como cabecalho.

    Wrapper sobre ``_compile_heading_pattern_cached`` — converte a lista
    pra tupla (hashable) pra permitir cache. As listas de markers vem de
    constantes module-level, então a mesma combinação se repete por todas
    as vagas do ciclo (~1000+ vagas) — sem cache, recompilaríamos a regex
    a cada chamada de ``_find_section``.
    """
    return _compile_heading_pattern_cached(tuple(markers))


@lru_cache(maxsize=64)
def _compile_heading_pattern_cached(markers: tuple[str, ...]) -> re.Pattern[str]:
    """Aceita o cabecalho em 2 contextos:
      1. Inicio de linha (tolerante a prefixos markdown/bullet).
      2. INLINE no meio de texto sem quebras de linha, desde que
         precedido por pontuacao de fim de sentenca ('.', '!', '?', ':'
         ou ';') + espaco. Cobre descriptions do BNE/MichaelPage/etc
         que vem tudo num paragrafo so.

    Ordena por tamanho descendente pra que multi-palavras casem antes
    das versoes mais curtas ("Key Responsibilities" vs "Responsibilities").
    """
    escaped = [re.escape(m) for m in sorted(markers, key=len, reverse=True)]
    body = "|".join(escaped)
    # Prefixo: aceita varias formas de "isolamento" do cabecalho:
    #   - inicio de linha (com markdown leve)
    #   - apos pontuacao de fim de sentenca (.!?:;|)
    #   - 2+ espacos seguidos (sinal de quebra "implicita" em textos
    #     condensados como InfoJobs "REQUISITOS: ...  ATIVIDADES DO CARGO:")
    #   - lookbehind por word-boundary (cobre cabecalho colado em palavra
    #     anterior por hifen, parenteses, etc - raro mas seguro)
    prefix = (
        r"(?:"
        r"^[\s>#\*\-•]{0,4}"          # inicio de linha
        r"|(?<=[.!?:;|])\s*"           # apos pontuacao
        r"|(?<=\s)"                    # apos 1+ whitespace (cobre tudo)
        r")"
    )
    pattern = r"(?im)" + prefix + r"(?P<heading>(?:" + body + r"))" + _HEADING_TAIL
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


# =====================================================================
# Heuristicas adicionais (camadas 3 e 4) - aumentam taxa de extracao
# em descriptions PT sem cabecalho claro
# =====================================================================

# Verbos de acao no infinitivo (PT) - tipicos de inicio de bullet de
# responsabilidade. Lista enxuta dos mais frequentes em vagas BR.
_PT_ACTION_VERBS_RE = re.compile(
    r"^(?:[ \t]*[-•*●▪]\s*)?"
    r"(desenvolver|manter|atuar|liderar|criar|gerenciar|coordenar|auxiliar|"
    r"realizar|garantir|implementar|analisar|executar|acompanhar|monitorar|"
    r"supervisionar|projetar|elaborar|construir|integrar|automatizar|"
    r"colaborar|conduzir|operar|otimizar|planejar|prestar|propor|"
    r"administrar|aplicar|apoiar|articular|assegurar|atender|definir|"
    r"diagnosticar|escrever|fazer|identificar|inspecionar|instalar|"
    r"mapear|mediar|negociar|organizar|participar|pesquisar|preparar|"
    r"produzir|programar|promover|propor|prover|realizar|receber|"
    r"resolver|responder|reunir|revisar|sustentar|testar|traduzir|"
    r"transmitir|treinar|validar|verificar|zelar)\b",
    re.IGNORECASE | re.MULTILINE,
)

# Substantivos de acao (-cao, -mento, -ncia, -agem) tipicos de descricoes
# BR em texto corrido. [çc]? e [ãa]? - aceita variantes sem cedilha/til
# (que vem corrompidas de algumas engines como BNE/Careerjet).
_PT_ACTION_NOUNS_RE = re.compile(
    r"\b(?:"
    r"comercializa[çc]?[ãa]?o|prospec[çc]?[ãa]?o|elabora[çc]?[ãa]?o|"
    r"cria[çc]?[ãa]?o|manuten[çc]?[ãa]?o|desenvolvimento|"
    r"integra[çc]?[ãa]?o|an[áa]?lise|gest[ãa]?o|"
    r"coordena[çc]?[ãa]?o|supervis[ãa]?o|monitoramento|"
    r"administra[çc]?[ãa]?o|planejamento|atendimento|"
    r"configura[çc]?[ãa]?o|implementa[çc]?[ãa]?o|"
    r"implanta[çc]?[ãa]?o|opera[çc]?[ãa]?o|automa[çc]?[ãa]?o|"
    r"negocia[çc]?[ãa]?o|presta[çc]?[ãa]?o|execu[çc]?[ãa]?o|"
    r"condu[çc]?[ãa]?o|organiza[çc]?[ãa]?o|revis[ãa]?o|"
    r"valida[çc]?[ãa]?o|otimiza[çc]?[ãa]?o|forma[çc]?[ãa]?o|"
    r"emiss[ãa]?o|recep[çc]?[ãa]?o|reten[çc]?[ãa]?o|"
    r"distribui[çc]?[ãa]?o|fabrica[çc]?[ãa]?o|montagem|"
    r"limpeza|manuseio|consultoria|treinamento|"
    r"capacita[çc]?[ãa]?o|remunera[çc]?[ãa]?o"
    r")\b",
    re.IGNORECASE,
)


# Prefixos comuns que aparecem antes do conteudo util e devem ser removidos
# do body extraido. Aplicados pos-extracao pra nao poluir o card do bot.
_BODY_PREFIX_NOISE_RE = re.compile(
    r"^(?:"
    r"descri[çc][ãa]o\s+geral|"
    r"descri[çc][ãa]o\s+da\s+vaga|"
    r"descri[çc][ãa]o\s+detalhada|"
    r"descri[çc][ãa]o\s*[:\-]|"
    r"detalhes\s+da\s+vaga|"
    r"informa[çc][õo]es\s+da\s+vaga|"
    r"confira\s+abaixo[^.!?]*[.!?]|"
    r"sobre\s+a\s+empresa|"
    r"job\s+overview|"
    r"about\s+the\s+role|"
    r"about\s+the\s+position"
    r")\s*[:\-–—]?\s*",
    re.IGNORECASE | re.MULTILINE,
)


def _strip_noise_prefix(body: str) -> str:
    """Remove cabecalhos genericos do inicio do texto extraido. Aplicado
    repetidamente pra cobrir 2-3 niveis (ex: 'Descrição Geral\\nDetalhes da Vaga')."""
    if not body:
        return body
    prev = None
    cur = body
    for _ in range(3):  # max 3 strips
        prev = cur
        cur = _BODY_PREFIX_NOISE_RE.sub("", cur, count=1).lstrip()
        if cur == prev:
            break
    return cur


def _extract_before_first_exclude(
    text: str, exclude_markers: list[str], min_chars: int = 40
) -> str | None:
    """Camada 3: quando NENHUM include marker bate mas existe um EXCLUDE
    marker (Requisitos, Beneficios...), considera tudo ANTES do exclude
    como responsibilities. Filtra "Sobre nos/empresa" do inicio.
    """
    stopper_re = _compile_heading_pattern(exclude_markers)
    stop = stopper_re.search(text)
    if not stop:
        return None
    body = text[: stop.start()].strip()
    # Remove intro de empresa: se primeira frase comeca com "Somos/Sobre/A [Empresa]",
    # pula essa frase
    body = re.sub(
        r"^\s*(?:somos|sobre n[óo]s|a empresa\b|quem somos)[^.!?]*[.!?]\s*",
        "",
        body,
        count=1,
        flags=re.IGNORECASE,
    )
    body = body.strip()
    return body if len(body) >= min_chars else None


def _starts_with_action_verb(text: str) -> bool:
    """Camada 4: texto comeca com verbo de acao no infinitivo
    (`Desenvolver...`, `Manter...`). Sinal forte de que descreve
    atividades direto, sem cabecalho.
    """
    if not text:
        return False
    # Olha so as primeiras 200 chars (primeiras linhas)
    head = text[:200]
    match = _PT_ACTION_VERBS_RE.search(head)
    if not match:
        return False
    # Verbo precisa aparecer perto do inicio (primeira metade do head)
    return match.start() <= len(head) // 2


def _has_action_noun_density(text: str, min_count: int = 3) -> bool:
    """Camada 4.5: texto tem N+ substantivos de acao distintos
    (comercializacao, prospeccao, elaboracao, ...). Sinal de que e
    descricao narrativa listando atividades.
    """
    if not text or len(text) < 80:
        return False
    matches = _PT_ACTION_NOUNS_RE.findall(text.lower())
    # Conta DISTINTOS pra evitar repeticao boba
    return len(set(m.lower() for m in matches)) >= min_count


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

    # 1) Secao marcada por cabecalho conhecido
    body = _find_section(
        cleaned, INCLUDE_MARKERS[lang], EXCLUDE_MARKERS[lang]
    )
    if body and len(body) >= 20:
        return _strip_noise_prefix(body) or None

    # 2) Bullets dominantes
    if is_mostly_bullets(cleaned):
        return _strip_noise_prefix(cleaned) or None

    # 3) Texto antes do primeiro EXCLUDE marker
    # Pega tudo antes de 'Requisitos:'/'Benefícios:' filtrando intro de empresa.
    body = _extract_before_first_exclude(cleaned, EXCLUDE_MARKERS[lang])
    if body:
        return _strip_noise_prefix(body) or None

    # 4) Verbo de acao no inicio (apenas PT - lista de verbos so existe pra PT)
    if lang == "pt" and _starts_with_action_verb(cleaned):
        # Toda a description parece descrever atividades direto. Retorna tudo
        # se for relativamente curta (proxima da realidade BR de description
        # narrativa direta). Acima de 1500 chars provavelmente tem requisitos
        # misturados - melhor None.
        if len(cleaned) <= 1500:
            return _strip_noise_prefix(cleaned) or None

    # 4.5) Densidade de substantivos de acao (PT). Texto narrativo BR
    # com 3+ termos como 'comercializacao', 'prospeccao', 'elaboracao'
    # quase sempre descreve atividades em prosa.
    if lang == "pt" and len(cleaned) <= 1200 and _has_action_noun_density(cleaned):
        return _strip_noise_prefix(cleaned) or None

    # 5) Fallback final (v3.10.12): primeiros ~600 chars da description
    # limpa apos remover prefacio "Sobre empresa". Cobre vagas com prosa
    # que nao casam com nenhum cabecalho mas onde os primeiros paragrafos
    # ja descrevem o papel.
    #
    # Guard: se a description INTEIRA aparenta ser so apresentacao da
    # empresa (texto curto comecando com cabecalho "Sobre nos"/"Who we are"/
    # etc), NAO entrega nada — _strip_noise_prefix devolve vazio nesse caso.
    stripped = _strip_noise_prefix(cleaned)
    if stripped and len(stripped) >= 120:
        # Pega primeiros 600 chars ate um corte natural (\n\n) quando existir
        snippet = stripped[:600]
        break_at = snippet.rfind("\n\n")
        if break_at >= 200:
            snippet = snippet[:break_at]
        snippet = snippet.strip()
        if snippet and len(snippet) >= 120:
            return snippet
    return None

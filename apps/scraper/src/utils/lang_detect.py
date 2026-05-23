"""lang_detect.py — heuristica leve de deteccao de idioma.

Suporta 'pt', 'en' e os principais idiomas CJK ('ja', 'zh', 'ko'). Para
qualquer outro idioma com precisao seria preciso uma lib (langdetect,
fasttext) — fora do escopo do epico v3.0.0 (queremos zero deps extras
no scraper).

Logica:
  1. Se houver caracteres de scripts nao-latinos em volume relevante,
     classifica pelo script dominante:
       - Hangul (silabas + jamo) -> 'ko'
       - Hiragana ou Katakana presentes -> 'ja' (kana so existe em jp)
       - Han ideogramas sem kana -> 'zh' (chines)
  2. Caso contrario, decide entre 'pt' e 'en' via heuristica de marcadores
     (mesma logica usada hoje em careerjet, generalizada aqui).
  3. Sem sinal nenhum -> 'unknown'.

A funcao olha so os primeiros 2000 caracteres do texto - suficiente pra
classificar uma description de vaga e barato pra processar em volume.
"""
from __future__ import annotations


# =====================================================================
# Faixas Unicode dos scripts CJK
# =====================================================================

_HIRAGANA = (0x3040, 0x309F)
_KATAKANA = (0x30A0, 0x30FF)
_HANGUL_SYLLABLES = (0xAC00, 0xD7AF)
_HANGUL_JAMO = (0x1100, 0x11FF)
_CJK_UNIFIED = (0x4E00, 0x9FFF)  # ideogramas Han: chines + japones kanji

# Quanto de script CJK e suficiente pra classificar como CJK (% do texto).
# 5% basta: 1 char a cada 20 ja indica idioma asiatico dominante na vaga.
_CJK_THRESHOLD = 0.05


def _count_in_range(text: str, lo: int, hi: int) -> int:
    return sum(1 for ch in text if lo <= ord(ch) <= hi)


def _script_counts(text: str) -> dict[str, int]:
    """Conta caracteres por script CJK relevante."""
    return {
        "hiragana": _count_in_range(text, *_HIRAGANA),
        "katakana": _count_in_range(text, *_KATAKANA),
        "hangul": (
            _count_in_range(text, *_HANGUL_SYLLABLES)
            + _count_in_range(text, *_HANGUL_JAMO)
        ),
        "han": _count_in_range(text, *_CJK_UNIFIED),
    }


# =====================================================================
# Heuristica latina PT vs EN (extraida do careerjet, generalizada)
# =====================================================================

_PT_MARKERS = (
    " de ", " da ", " do ", " das ", " dos ", " para ", " com ", " em ",
    " que ", " uma ", " um ", " na ", " no ", " ou ", " voce ", " você ",
    "experiência", "experiencia", "conhecimento", "desenvolvedor", "vaga",
    "requisitos", "atividades", "responsabilidades", "trabalho", "salário",
    "benefícios", "empresa", "área", "equipe", "nível", "atuação",
)

_EN_MARKERS = (
    " the ", " and ", " for ", " with ", " you ", " we ", " our ", " are ",
    " will ", " your ", " job ", " role ", " team ", " of ", " to ",
    "experience", "requirements", "responsibilities", "developer",
    "knowledge", "benefits", "company", "skills", "looking for",
)

# Diacriticos praticamente exclusivos do portugues - sinal forte.
_PT_DIACRITICS = "ãõçáàâêéíóôú"


def _sample(text: str, limit: int = 2000) -> str:
    return text if len(text) <= limit else text[:limit]


def detect_lang(text: str | None) -> str:
    """Detecta idioma do texto.

    Returns:
        ``'pt'``, ``'en'``, ``'ja'``, ``'zh'``, ``'ko'`` ou ``'unknown'``.
        Nunca lanca - se a entrada for vazia ou None, devolve ``'unknown'``.
    """
    if not text:
        return "unknown"
    sample = _sample(text)

    # 1) Scripts CJK
    counts = _script_counts(sample)
    cjk_total = sum(counts.values())
    if cjk_total > 0 and (cjk_total / max(len(sample), 1)) >= _CJK_THRESHOLD:
        if counts["hangul"] >= max(
            counts["hiragana"], counts["katakana"], counts["han"]
        ):
            return "ko"
        # Kana so existe em japones - se aparece, ja e ja, mesmo se houver kanji
        if (counts["hiragana"] + counts["katakana"]) > 0:
            return "ja"
        return "zh"

    # 2) Latim: PT vs EN
    low = " " + sample.lower() + " "
    pt = sum(low.count(m) for m in _PT_MARKERS)
    en = sum(low.count(m) for m in _EN_MARKERS)
    if any(ch in low for ch in _PT_DIACRITICS):
        pt += 3

    if pt == 0 and en == 0:
        return "unknown"
    return "pt" if pt >= en else "en"


def needs_translation(lang: str) -> bool:
    """True se o idioma precisa ser traduzido pra pt antes de exibir.

    'unknown' nao traduz - pode ser texto curto/ambiguo que o tradutor
    estragaria. Caller decide se mesmo assim quer tentar.
    """
    return lang in {"en", "ja", "zh", "ko", "es", "fr", "de", "it", "ru"}

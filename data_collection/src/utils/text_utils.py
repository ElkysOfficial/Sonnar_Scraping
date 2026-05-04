"""
Helpers de texto compartilhados pelas engines.

  - ``strip_html``: remove tags HTML e normaliza whitespace, preservando
    quebras de linha em <br>, <p>, <li>, etc.
  - ``extract_skills``: faz match das stacks conhecidas (``variavel.stacks``)
    contra um texto livre, devolvendo a lista (ordenada pela 1ª ocorrência).

Centralizado aqui para evitar duplicação entre engines (bne, careerjet,
catho, dice, indeed, infojobs, linkedin, programathor).
"""
from __future__ import annotations

import re
from typing import List

from bs4 import BeautifulSoup

from variavel import stacks as _ALL_STACKS


# ``R`` e ``C`` são muito barulhentos no texto livre - exigem 2+ chars.
_SKILL_PATTERNS: List[tuple] = [
    (s, re.compile(r"\b" + re.escape(s) + r"\b", re.IGNORECASE))
    for s in _ALL_STACKS
    if len(s) >= 2
]


def strip_html(text: str) -> str:
    """Remove tags HTML e normaliza whitespace, preservando quebras de linha.

    <br>, <p>, <li>, <ul>, <ol>, <div> e <hN> viram ``\\n``. Múltiplas linhas
    em branco viram uma só. Devolve string vazia se ``text`` for falsy.
    """
    if not text:
        return ""
    text = re.sub(r"<\s*br\s*/?\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</\s*(?:p|li|ul|ol|div|h[1-6])\s*>", "\n", text, flags=re.IGNORECASE)
    text = BeautifulSoup(text, "html.parser").get_text("\n")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract_skills(description: str) -> List[str]:
    """Match das stacks conhecidas contra ``description``.

    Retorna lista preservando a ordem da 1ª ocorrência, sem duplicatas.
    Devolve ``[]`` se ``description`` for vazio.
    """
    if not description:
        return []
    found: List[str] = []
    seen: set = set()
    for skill, pat in _SKILL_PATTERNS:
        if skill in seen:
            continue
        if pat.search(description):
            found.append(skill)
            seen.add(skill)
    return found

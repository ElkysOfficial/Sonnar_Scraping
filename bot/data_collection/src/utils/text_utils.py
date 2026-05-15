"""
Helpers de texto compartilhados pelas engines.

  - ``strip_html``: remove tags HTML e normaliza whitespace, preservando
    quebras de linha em <br>, <p>, <li>, etc.
  - ``extract_skills``: faz match das skills conhecidas (``SKILLS_VOCABULARY``)
    contra um texto livre, devolvendo a lista (ordenada pela 1ª ocorrência).

A extração usa um vocabulário próprio (``skills_vocabulary``), separado de
``variavel.stacks`` que controla os termos de BUSCA. Isso permite reduzir
``variavel.stacks`` para testes rápidos sem zerar a extração de skills.

Boundary regex: ``\\b`` falha em tokens que começam/terminam com não-word
chars (``.NET``, ``C#``, ``C++``, ``Node.js``, ``CI/CD``). Usamos lookarounds
sobre ``[A-Za-z0-9]`` - basta haver um char não-alfanumérico (ou borda da
string) antes e depois para o token ser aceito.
"""
from __future__ import annotations

import re
from typing import List

from bs4 import BeautifulSoup

from .skills_vocabulary import SKILLS_VOCABULARY


# ``R`` e ``C`` são muito barulhentos no texto livre - exigem 2+ chars.
_SKILL_PATTERNS: List[tuple] = [
    (s, re.compile(r"(?<![A-Za-z0-9])" + re.escape(s) + r"(?![A-Za-z0-9])",
                   re.IGNORECASE))
    for s in SKILLS_VOCABULARY
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

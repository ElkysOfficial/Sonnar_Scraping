"""Enriquecimento de description: deteccao de idioma + traducao + extracao.

Este modulo centraliza o pipeline que TODAS as engines do scraper devem
usar no enriquecimento de uma vaga:

    1. detect_lang(title + description) -> lang
    2. Se lang != 'pt' e != 'unknown': traduz description -> PT-BR
    3. extract_responsibilities(description_em_pt, 'pt')
    4. Retorna (description_lang, responsibilities)

A description ORIGINAL nao e modificada - o caller continua gravando
ela como esta. Apenas o campo derivado ``responsibilities`` recebe o
texto extraido em portugues, e ``description_lang`` registra o idioma
de origem (pra futuras reextracoes e analise).

A traducao usa Argos (CPU-bound, sincrono) - chamamos via
``asyncio.to_thread`` pra nao travar o event loop das engines async.
Quando Argos nao esta instalado ou falha, devolvemos a description
original como fallback (sem traducao, mas o pipeline nao quebra).

Regra "fica vazio quando nao acha" (decisao de produto v3.0.0):
quando extract_responsibilities devolve None, gravamos ``responsibilities = None``.
O caller (formatter/bot) decide o que mostrar.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from src.utils.lang_detect import detect_lang, needs_translation
from src.utils.section_extractor import clean_html, extract_responsibilities

logger = logging.getLogger("scraper.job_enrichment")


def _safe_translate_to_pt(text: str, src_lang: str) -> str:
    """Traduz texto pra PT usando Argos. Devolve original em qualquer falha."""
    try:
        from src.utils import translator
    except Exception as exc:  # noqa: BLE001
        logger.debug("translator unavailable: %s", exc)
        return text
    try:
        out = translator.translate_to_pt(text, src_lang)
        return out or text
    except Exception as exc:  # noqa: BLE001
        logger.warning("translate_to_pt failed lang=%s err=%s", src_lang, exc)
        return text


def enrich_sync(
    title: str,
    description: str,
    hint_lang: Optional[str] = None,
) -> tuple[Optional[str], Optional[str]]:
    """Versao sincrona do enrichment - chamavel diretamente em codigo sync.

    Args:
        title: titulo da vaga (entra na deteccao de idioma).
        description: HTML ou texto plano da description.
        hint_lang: se a engine ja conhece o idioma (ex: Careerjet sabe pelo
            locale), passa aqui e pulamos a deteccao.

    Returns:
        ``(description_lang, responsibilities)`` - cada um pode ser None.
        ``description_lang`` so e None se title+description estiverem vazios.
    """
    if not description and not title:
        return None, None

    full = f"{title or ''}\n{description or ''}"
    lang = hint_lang or detect_lang(full)
    if lang == "unknown":
        # Tratamos 'unknown' como 'en' pro pipeline tentar traduzir; mas
        # gravamos 'unknown' no banco pra observabilidade.
        translate_src = "en"
        recorded_lang = "unknown"
    else:
        translate_src = lang
        recorded_lang = lang

    # Limpa HTML antes de qualquer processamento de texto. Mantemos a
    # description original (com HTML) intocada pra preservar formatacao
    # caso queiramos exibir em outro canal no futuro.
    cleaned = clean_html(description) if description else ""

    text_for_extract = cleaned
    if needs_translation(translate_src) and translate_src != "pt":
        # Traduz a description bruta - o extractor trabalha melhor em
        # texto traduzido completo do que em fragmentos
        text_for_extract = _safe_translate_to_pt(cleaned, translate_src)

    # Apos traducao, o texto esta em PT - extracao usa marcadores PT
    responsibilities = extract_responsibilities(text_for_extract, "pt")

    return recorded_lang, responsibilities


async def enrich_async(
    title: str,
    description: str,
    hint_lang: Optional[str] = None,
) -> tuple[Optional[str], Optional[str]]:
    """Versao async do enrichment - usa to_thread pra nao travar event loop.

    A traducao Argos e CPU-bound; engines async devem chamar essa versao.
    Se nao houver nada a traduzir (lang == 'pt'), nao paga o custo de
    delegar pra thread - retorna direto.
    """
    if not description and not title:
        return None, None

    full = f"{title or ''}\n{description or ''}"
    lang = hint_lang or detect_lang(full)
    if lang == "pt":
        # Caminho rapido: nao precisa de translator, roda inline
        cleaned = clean_html(description) if description else ""
        responsibilities = extract_responsibilities(cleaned, "pt")
        return "pt", responsibilities

    # Caso geral: delega pra thread (pode envolver Argos)
    return await asyncio.to_thread(
        enrich_sync, title, description, hint_lang
    )


async def enrich_canonical(
    canonical: list,
    hint_lang: Optional[str] = None,
) -> list:
    """Expande lista canonica de 10 -> 12 campos aplicando enrich nos
    indices 1 (title) e 9 (description).

    Util pras engines que constroem a lista canonica em codigo sync e
    so precisam plugar o enrichment depois. Devolve a propria lista
    (mutada in-place) ou estendida em 2 elementos.

    Args:
        canonical: lista de 10+ elementos (formato emitido pelas engines).
        hint_lang: se conhecido (ex: 'en' pra engines EN-only), pula
            deteccao automatica.

    Returns:
        Lista de 12 elementos. Se a lista de entrada ja tiver 12+,
        mantemos o tamanho e sobrescrevemos as posicoes 10 e 11.
    """
    if len(canonical) < 10:
        return canonical
    title = canonical[1] or ""
    description = canonical[9] or ""
    lang, resp = await enrich_async(title, description, hint_lang=hint_lang)
    if len(canonical) >= 12:
        canonical[10] = lang
        canonical[11] = resp
        return canonical
    # Pad: 10 -> 12 (preserva index correto)
    extra = [None] * (12 - len(canonical))
    canonical = list(canonical) + extra
    canonical[10] = lang
    canonical[11] = resp
    return canonical

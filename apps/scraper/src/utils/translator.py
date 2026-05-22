"""
Tradutor offline para normalizar vagas estrangeiras em portugues.

Usa o Argos Translate: modelos de traducao que rodam localmente, sem
chamada de rede e sem limite de uso - adequado ao volume do scraper.

Estrategia de traducao (definida para o projeto):
    * traducao direta ``idioma->pt`` quando existe o modelo do par;
    * senao, pivota por ingles (``idioma->en->pt``).

Os modelos sao baixados sob demanda na primeira vez que um idioma aparece
(~100-250MB por par) e ficam em cache no disco do Argos. As traducoes
feitas durante a vida do processo ficam num cache LRU em memoria.

A traducao e CPU-bound e sincrona - as engines async devem chama-la via
``asyncio.to_thread`` para nao travar o event loop. O modulo importa o
Argos preguicosamente: se o pacote nao estiver instalado, ``translate_to_pt``
apenas devolve o texto original (a vaga e salva sem traducao, sem quebrar).
"""
from __future__ import annotations

import logging
import threading
from functools import lru_cache

logger = logging.getLogger("scraper.translator")

_TARGET = "pt"   # idioma alvo
_PIVOT = "en"    # idioma-ponte quando nao ha par direto

# Alguns idiomas usam codigo diferente no Argos vs no locale do Careerjet.
_ARGOS_LANG_REMAP = {"no": "nb"}  # noruegues: Careerjet 'no' -> Argos 'nb'

_init_lock = threading.Lock()
_install_lock = threading.Lock()
_argos_translate = None
_argos_package = None
_pair_cache: dict[tuple[str, str], bool] = {}


def _ensure_argos():
    """Importa o Argos sob demanda. Lanca ImportError se nao instalado."""
    global _argos_translate, _argos_package
    if _argos_translate is None:
        with _init_lock:
            if _argos_translate is None:
                import argostranslate.package as _pkg
                import argostranslate.translate as _trans
                _argos_package = _pkg
                _argos_translate = _trans
    return _argos_translate, _argos_package


def _argos_code(lang: str) -> str:
    """Mapeia o codigo de idioma do locale para o codigo usado pelo Argos."""
    return _ARGOS_LANG_REMAP.get(lang, lang)


def _pair_available(from_code: str, to_code: str) -> bool:
    """Garante o modelo ``from_code->to_code`` instalado (baixa se preciso).

    O resultado - sucesso ou falha - e cacheado para nao repetir a busca no
    indice de pacotes a cada vaga.
    """
    key = (from_code, to_code)
    cached = _pair_cache.get(key)
    if cached is not None:
        return cached
    with _install_lock:
        cached = _pair_cache.get(key)
        if cached is not None:
            return cached
        ok = False
        try:
            _, package = _ensure_argos()
            installed = package.get_installed_packages()
            if any(p.from_code == from_code and p.to_code == to_code
                   for p in installed):
                ok = True
            else:
                available = package.get_available_packages()
                if not available:
                    package.update_package_index()
                    available = package.get_available_packages()
                match = next(
                    (p for p in available
                     if p.from_code == from_code and p.to_code == to_code),
                    None,
                )
                if match is not None:
                    package.install_from_path(match.download())
                    ok = True
        except Exception as exc:
            logger.warning("argos_pair_unavailable", extra={
                "pair": f"{from_code}->{to_code}", "errorMessage": str(exc),
            })
            ok = False
        _pair_cache[key] = ok
        return ok


def _do_translate(text: str, from_code: str, to_code: str) -> str:
    translate, _ = _ensure_argos()
    return translate.translate(text, from_code, to_code)


@lru_cache(maxsize=4096)
def _translate_cached(src: str, text: str) -> str:
    """Traduz ``text`` de ``src`` para pt. Cache LRU por (idioma, texto)."""
    # 1. Par direto idioma->pt.
    if _pair_available(src, _TARGET):
        try:
            return _do_translate(text, src, _TARGET)
        except Exception as exc:
            logger.warning("argos_direct_failed", extra={
                "src": src, "errorMessage": str(exc)})
    # 2. Pivo por ingles: idioma->en->pt.
    if src != _PIVOT and _pair_available(src, _PIVOT) and _pair_available(_PIVOT, _TARGET):
        try:
            return _do_translate(_do_translate(text, src, _PIVOT), _PIVOT, _TARGET)
        except Exception as exc:
            logger.warning("argos_pivot_failed", extra={
                "src": src, "errorMessage": str(exc)})
    # 3. Sem modelo / falha: mantem o original (melhor que perder a vaga).
    return text


def translate_to_pt(text: str, src_lang: str) -> str:
    """Traduz ``text`` para portugues.

    Devolve o texto original, sem alteracao, quando: ``text`` e vazio, o
    idioma de origem ja e portugues, ou a traducao falha (modelo ausente,
    Argos nao instalado, erro). Nunca lanca excecao.
    """
    if not text or not text.strip():
        return text
    src = _argos_code((src_lang or "").strip().lower()[:2])
    if not src or src == _TARGET:
        return text
    try:
        return _translate_cached(src, text)
    except Exception as exc:
        logger.warning("translate_failed", extra={
            "src": src, "errorMessage": str(exc)})
        return text


def prepare(langs) -> None:
    """Pre-baixa os modelos dos idiomas informados (best-effort).

    Util para a engine front-loadar o download no inicio do ciclo, em vez
    de pagar a latencia na primeira vaga de cada idioma. Idiomas ja em pt
    sao ignorados; falhas sao silenciosas - ``translate_to_pt`` lida com a
    ausencia de modelo depois.
    """
    for lang in langs or ():
        src = _argos_code((lang or "").strip().lower()[:2])
        if not src or src == _TARGET:
            continue
        if not _pair_available(src, _TARGET):
            # Sem par direto: garante a ponte por ingles.
            _pair_available(src, _PIVOT)
    _pair_available(_PIVOT, _TARGET)

"""
Engine Careerjet - API oficial de busca (search.api.careerjet.net/v4),
multi-pais com traducao automatica para portugues.

A API v4 e autenticada e devolve as vagas ja estruturadas em JSON, entao
nao ha fase de "fetch de detalhe": cada item do response e uma vaga.

Autenticacao
------------
Basic Auth onde o *usuario* e a chave de API e a *senha* e uma string vazia.
A chave esta vinculada a um IP autorizado - chamadas de outro IP falham.
Configure ``CAREERJET_API_KEY`` no .env.

Cobertura multi-pais
--------------------
A API expoe 141 ``locale_code`` (paises/idiomas) - lista levantada por
sondagem direta. A engine cobre todos, mas em rodizio para nao explodir o
volume de requests por ciclo:

* ``pt_BR`` (Brasil) e processado SEMPRE - e o mercado principal do
  produto. Para o Brasil roda-se a busca nacional + uma busca por cada
  uma das 27 UFs (ver ``_BR_LOCATION_VARIANTS``).
* Os outros 140 locales rotacionam em lotes ao longo dos ciclos (rotacao
  baseada no relogio, sem arquivo de estado) - cada um faz so a busca
  nacional. Ver ``_ROTATING_LOCALES`` / ``_rotating_batch()``.

Traducao
--------
Vagas cujo locale nao e portugues sao traduzidas (titulo + descricao) via
:mod:`src.utils.translator` (Argos Translate, offline) antes de emitir.
O idioma de origem vem do proprio ``locale_code`` - nao precisa detectar.

A API entrega ``description`` como *excerto* (parametro ``fragment_size``),
nao o texto integral - por isso a engine e listing-only (sem
``refetch_one``) e ``is_partial`` sempre devolve False, igual ao Jooble.
"""
from __future__ import annotations

import asyncio
import math
import os
import re
import sys
import time
from email.utils import parsedate_to_datetime

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from variavel import get_active_batch_key, get_active_stacks  # noqa: E402
from src.persistence.extraction_tracker import tracker  # noqa: E402
from src.persistence.progress_tracker import progress  # noqa: E402
from src.utils.job_fallbacks import apply_description_fallbacks  # noqa: E402
from src.utils.text_utils import extract_skills, strip_html  # noqa: E402
from src.utils.translator import prepare as prepare_translation  # noqa: E402
from src.utils.job_enrichment import enrich_canonical  # noqa: E402
from src.utils.translator import translate_to_pt  # noqa: E402

import logging
logger = logging.getLogger("scraper.engine.careerjet")

# Em modo standalone (python -m src.engines.careerjet) o .env ainda nao foi
# carregado pelo scrapy.py - garante a chave de API tambem nesse cenario.
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


# 2026-05-23 (v2.24.0): traducao continua local (precisamos do title e
# description ja em PT no banco), mas a extracao de responsibilities
# agora passa pelo pipeline central via enrich_canonical(hint_lang="pt")
# - apos a traducao, o texto ja esta em PT. description_lang gravado e
# o IDIOMA ORIGINAL da vaga (locale_lang), nao 'pt'.
PARSER_VERSION = "careerjet-api-i18n-2026.05.23"


# --- Configuracao --------------------------------------------------------

_API_URL = "https://search.api.careerjet.net/v4/query"

# Chave de API (Basic Auth: usuario=chave, senha=vazia). Vinculada ao IP
# autorizado do VPS - definir no .env como CAREERJET_API_KEY.
_API_KEY = os.getenv("CAREERJET_API_KEY", "")

# IP autorizado para a chave + user agent: ambos sao parametros GET
# OBRIGATORIOS da API. O IP precisa ser o mesmo que a chave autoriza.
_USER_IP = os.getenv("CAREERJET_USER_IP", "82.25.68.106")
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)
# Header Referer e obrigatorio: a pagina de onde a chamada se origina.
_REFERER = os.getenv("CAREERJET_REFERER", "https://elkys.com.br/find-jobs/")

# Paginacao: a API devolve 20 vagas por pagina (o parametro page_size e
# ignorado nesta chave) e aceita 'page' de 1 a 10. Brasil busca mais fundo;
# os demais paises ficam mais rasos para conter o volume. Variantes de
# baixo volume param sozinhas na 1a pagina (response vazio).
_MAX_PAGES = int(os.getenv("CAREERJET_MAX_PAGES", "3"))
_MAX_PAGES_FOREIGN = int(os.getenv("CAREERJET_MAX_PAGES_FOREIGN", "2"))
# Tamanho do excerto da descricao (default da API e so 120 chars).
_FRAGMENT_SIZE = int(os.getenv("CAREERJET_FRAGMENT_SIZE", "2000"))
# Quantos locales estrangeiros entram por ciclo (rodizio). Com 140 locales
# e lotes de 10, todos sao cobertos a cada ~14 ciclos (~28h).
_COUNTRY_BATCH_SIZE = int(os.getenv("CAREERJET_COUNTRY_BATCH_SIZE", "10"))

# Retry para falhas transitorias (5xx / timeout).
_MAX_RETRIES = 3

# Locale principal: o Brasil e processado em todo ciclo.
_PRIMARY_LOCALE = "pt_BR"

# Demais locales suportados pelo Careerjet (140) - levantados por sondagem
# direta da API. Rotacionam em lotes ao longo dos ciclos. O idioma de
# origem (para a traducao) sao os 2 primeiros caracteres do locale_code.
# Albania e Macedonia tem site no Careerjet mas nao tem locale na API.
_ROTATING_LOCALES = (
    "ar_AE", "ar_EG", "ar_LY", "ar_MA", "ar_SA", "ar_TN",
    "bg_BG", "bs_BA", "cs_CZ", "da_DK", "da_GL",
    "de_AT", "de_CH", "de_DE", "de_LI", "de_LU",
    "el_CY", "el_GR",
    "en_AE", "en_AF", "en_AU", "en_BD", "en_BH", "en_BW", "en_CA",
    "en_CN", "en_EG", "en_ET", "en_GB", "en_GG", "en_GH", "en_GI",
    "en_HK", "en_ID", "en_IE", "en_IM", "en_IN", "en_JE", "en_KE",
    "en_KW", "en_KY", "en_LY", "en_MT", "en_MU", "en_MY", "en_NA",
    "en_NG", "en_NZ", "en_OM", "en_PH", "en_PK", "en_QA", "en_SA",
    "en_SG", "en_TH", "en_TW", "en_TZ", "en_UG", "en_US", "en_VG",
    "en_VN", "en_ZA", "en_ZM",
    "es_AR", "es_BO", "es_CL", "es_CO", "es_CR", "es_DO", "es_EC",
    "es_ES", "es_GT", "es_HN", "es_MX", "es_NI", "es_PA", "es_PE",
    "es_PR", "es_PY", "es_SV", "es_UY", "es_VE",
    "et_EE", "fi_FI",
    "fr_BE", "fr_BI", "fr_BJ", "fr_CA", "fr_CD", "fr_CF", "fr_CH",
    "fr_CI", "fr_CM", "fr_DZ", "fr_FR", "fr_GA", "fr_GF", "fr_GP",
    "fr_LU", "fr_MA", "fr_MG", "fr_ML", "fr_MQ", "fr_RE", "fr_SN",
    "fr_TG", "fr_TN", "fr_YT",
    "he_IL", "hr_HR", "hu_HU", "id_ID", "it_IT", "ja_JP", "ko_KR",
    "lt_LT", "lv_LV", "nl_BE", "nl_NL", "no_NO", "pl_PL",
    "pt_AO", "pt_MZ", "pt_PT",
    "ro_MD", "ro_RO", "ru_BY", "ru_KZ", "ru_RU", "ru_UA",
    "sk_SK", "sl_SI", "sr_ME", "sr_RS", "sv_SE", "th_TH", "tr_TR",
    "uk_UA", "vi_VN", "zh_CN",
)

# Variantes de busca por localidade aplicadas APENAS ao Brasil. A primeira
# ("" = sem 'location') e a busca nacional: cobre o pais inteiro e as vagas
# marcadas apenas como "Brasil" (remoto/nacional). As demais sao as 27 UFs
# - garantem que estados de menor volume entrem na coleta mesmo quando o
# ranking nacional por data e dominado por SP/RJ/MG. Os outros paises usam
# so a busca nacional. Vagas repetidas entre variantes caem no dedup de URL.
_BR_LOCATION_VARIANTS = (
    "",  # busca nacional (inclui "Brasil"/remoto)
    "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará",
    "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso",
    "Mato Grosso do Sul", "Minas Gerais", "Pará", "Paraíba", "Paraná",
    "Pernambuco", "Piauí", "Rio de Janeiro", "Rio Grande do Norte",
    "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina",
    "São Paulo", "Sergipe", "Tocantins", "Distrito Federal",
)


class _CareerjetConfigError(RuntimeError):
    """Erro irrecuperavel de configuracao (credenciais, locale, IP)."""


def is_partial(job_data: dict) -> bool:
    """Careerjet (API) nunca fica em ``partial``.

    A API ja entrega cada vaga estruturada no response - nao existe pagina
    de detalhe canonica para reenriquecer (``url`` e um redirect
    ``jobviewtrack.com`` para o site de origem). Campos vazios (salary,
    hiring_regime) sao naturais quando o anunciante nao os informou.
    """
    return False


# --- Rodizio de paises ---------------------------------------------------

def _rotating_batch() -> list:
    """Lote de locales estrangeiros do ciclo atual.

    A rotacao e baseada no relogio (sem arquivo de estado): a cada ~2h o
    indice avanca um lote, cobrindo todos os ``_ROTATING_LOCALES`` ao longo
    de aproximadamente um dia. Sobrevive a reinicios do processo.
    """
    n = len(_ROTATING_LOCALES)
    if n == 0 or _COUNTRY_BATCH_SIZE <= 0:
        return []
    total_batches = math.ceil(n / _COUNTRY_BATCH_SIZE)
    idx = int(time.time() // 7200) % total_batches
    start = idx * _COUNTRY_BATCH_SIZE
    return list(_ROTATING_LOCALES[start:start + _COUNTRY_BATCH_SIZE])


def _active_locales() -> list:
    """``pt_BR`` (sempre) + o lote rotativo de locales estrangeiros."""
    return [_PRIMARY_LOCALE] + _rotating_batch()


def _location_variants(locale: str) -> tuple:
    """Variantes de localidade do locale: Brasil varre as 27 UFs, os demais
    paises fazem apenas a busca nacional."""
    return _BR_LOCATION_VARIANTS if locale == _PRIMARY_LOCALE else ("",)


def _max_pages(locale: str) -> int:
    """Profundidade de paginacao: o Brasil vai mais fundo que os demais."""
    return _MAX_PAGES if locale == _PRIMARY_LOCALE else _MAX_PAGES_FOREIGN


# --- Filtro de idioma ----------------------------------------------------

# Marcadores de portugues: palavras funcionais entre espacos (para casar
# como palavra inteira) e termos de conteudo tipicos de anuncios de vaga.
_PT_MARKERS = (
    " de ", " da ", " do ", " das ", " dos ", " para ", " com ", " em ",
    " que ", " uma ", " um ", " na ", " no ", " ou ", " voce ", " você ",
    "experiência", "experiencia", "conhecimento", "desenvolvedor", "vaga",
    "requisitos", "atividades", "responsabilidades", "trabalho", "salário",
    "benefícios", "empresa", "área", "equipe", "nível", "atuação",
)
# Marcadores de ingles equivalentes.
_EN_MARKERS = (
    " the ", " and ", " for ", " with ", " you ", " we ", " our ", " are ",
    " will ", " your ", " job ", " role ", " team ", " of ", " to ",
    "experience", "requirements", "responsibilities", "developer",
    "knowledge", "benefits", "company", "skills", "looking for",
)
# Diacriticos praticamente exclusivos do portugues - sinal forte.
_PT_DIACRITICS = "ãõçáàâêéíóôú"
_PT_DIACRITICS_RE = re.compile(f"[{_PT_DIACRITICS}]")

# Regex unica que conta marcadores via findall (uma passada O(N) no texto).
# Substitui o ``sum(text.count(m) for m in markers)`` que rodava o texto
# inteiro 1 vez POR marcador (~30 passadas por vaga). Em ciclos com 1800+
# vagas via Careerjet, isso saturava CPU desnecessariamente.
_PT_MARKERS_RE = re.compile("|".join(re.escape(m) for m in _PT_MARKERS))
_EN_MARKERS_RE = re.compile("|".join(re.escape(m) for m in _EN_MARKERS))


def _looks_portuguese(text: str) -> bool:
    """Heuristica: o texto aparenta estar escrito em portugues?

    Conservadora: so devolve False quando o texto tem massa clara de
    marcadores ingleses superando os portugueses. Usada apenas para os
    locales pt_* - se uma vaga internacional vazou no indice BR/PT escrita
    em ingles, ela e tratada como ingles e traduzida.
    """
    if not text:
        return True
    low = " " + text.lower() + " "
    pt = len(_PT_MARKERS_RE.findall(low))
    en = len(_EN_MARKERS_RE.findall(low))
    if _PT_DIACRITICS_RE.search(low):
        pt += 3
    if en >= 3 and en > pt:
        return False
    return True


def _source_lang(locale_lang: str, title: str, description: str) -> str:
    """Idioma de origem efetivo de uma vaga.

    Para locales nao-portugueses, o idioma e o do proprio locale. Para os
    locales pt_* (pt_BR/pt_PT), o conteudo costuma ser portugues - mas se
    uma vaga internacional vazou em ingles, detecta e marca como ``en``
    para que seja traduzida tambem.
    """
    if locale_lang != "pt":
        return locale_lang
    if not _looks_portuguese(f"{title} {description}"):
        return "en"
    return "pt"


# --- Helpers de parsing --------------------------------------------------

def _parse_date(raw: str) -> str:
    """``'Wed, 21 May 2026 07:53:29 GMT'`` -> ``'21/05/2026'``.

    Devolve string vazia se a data nao puder ser interpretada.
    """
    if not raw:
        return ""
    try:
        dt = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return ""
    return dt.strftime("%d/%m/%Y") if dt is not None else ""


def _build_salary(job: dict) -> str:
    """Monta a string de salario a partir dos campos da API.

    Prefere o campo ``salary`` ja formatado; senao reconstroi de
    ``salary_min``/``salary_max``/``salary_currency_code``. A normalizacao
    fina (``process_salary``) acontece depois, no pipeline do controller.
    """
    salary = (job.get("salary") or "").strip()
    if salary:
        return salary
    currency = job.get("salary_currency_code") or "BRL"
    mn = job.get("salary_min")
    mx = job.get("salary_max")
    if mn and mx:
        return f"{currency} {mn}" if mn == mx else f"{currency} {mn} - {mx}"
    if mn:
        return f"{currency} {mn}"
    return ""


def _build_location(raw: str) -> list:
    """``'São Paulo - SP'`` / ``'Recife, PE'`` -> ``['cidade', 'UF']``.

    A API usa ``' - '`` (ou virgula) como separador. Nivel pais ('Brasil',
    'Brazil') ou vazio -> lista vazia. Nomes de cidade sao mantidos no
    idioma original (sao nomes proprios, nao se traduzem).
    """
    if not raw:
        return []
    cleaned = raw.strip()
    if cleaned.lower() in ("brasil", "brazil"):
        return []
    cleaned = cleaned.replace(" - ", ",")
    parts = [p.strip() for p in cleaned.split(",") if p.strip()]
    return parts[:2]


def _work_type(title: str, location: list) -> str:
    """Modalidade derivada do titulo + localidade.

    Sem campo dedicado na API - o ``apply_description_fallbacks`` ainda
    pode promover para Remoto/Hibrido a partir da descricao.
    """
    blob = title.lower()
    if "remoto" in blob or "remote" in blob or "home office" in blob or "home-office" in blob:
        return "Remoto"
    if "híbrido" in blob or "hibrido" in blob or "hybrid" in blob:
        return "Híbrido"
    if location:
        return "Presencial"
    return "Remoto"


def _extract_job(job: dict, seen: set) -> tuple | None:
    """Extrai os campos crus de um item da API (sem traduzir/normalizar).

    Returns:
        Tupla ``(url, title, company, location, salary, date, description)``
        no idioma original, ou ``None`` se for duplicata ou faltar
        url/titulo. A traducao, o ``work_type``, as skills e os fallbacks
        sao aplicados depois, em ``get_careerjet_jobs``.
    """
    url = (job.get("url") or "").strip()
    if not url or url in seen:
        return None

    title = (job.get("title") or "").strip()
    if not title:
        return None

    seen.add(url)

    description = strip_html(job.get("description") or "")
    company = (job.get("company") or "").strip()
    location = _build_location(job.get("locations") or "")
    salary = _build_salary(job)
    publication_date = _parse_date(job.get("date") or "")

    return (url, title, company, location, salary, publication_date, description)


# --- Chamada a API -------------------------------------------------------

async def _fetch_page(
    client: httpx.AsyncClient, locale: str, stack: str, page: int, location: str,
) -> tuple:
    """Faz uma chamada a API para ``locale``/``stack``/``location``/``page``.

    Args:
        locale: ``locale_code`` do pais/idioma (ex.: ``pt_BR``, ``de_DE``).
        location: UF/regiao a filtrar, ou string vazia para busca nacional.

    Returns:
        Tupla ``(jobs, total_pages)``. ``jobs`` e ``None`` se a chamada
        falhou apos os retries; lista vazia se a busca nao casou (ex.: modo
        LOCATIONS) ou nao trouxe vagas.

    Raises:
        _CareerjetConfigError: em HTTP 400/403 (locale invalido, credenciais
            ou parametros obrigatorios ausentes) - inutil continuar.
    """
    params = {
        "locale_code": locale,
        "keywords": stack,
        "sort": "date",
        "page": page,
        "fragment_size": _FRAGMENT_SIZE,
        "user_ip": _USER_IP,
        "user_agent": _USER_AGENT,
    }
    if location:
        params["location"] = location

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            resp = await client.get(
                _API_URL, params=params, headers={"Referer": _REFERER},
            )
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt == _MAX_RETRIES:
                return None, 0
            await asyncio.sleep(2.0 * attempt)
            continue

        if resp.status_code in (400, 403):
            raise _CareerjetConfigError(
                f"HTTP {resp.status_code}: {resp.text[:200]}"
            )
        if resp.status_code != 200:
            if attempt == _MAX_RETRIES:
                return None, 0
            await asyncio.sleep(2.0 * attempt)
            continue

        try:
            data = resp.json()
        except ValueError:
            return None, 0

        # type=LOCATIONS (busca ambigua / sem correspondencia de localidade)
        # nao traz vagas - apenas seguimos para a proxima variante.
        if data.get("type") != "JOBS":
            return [], 0

        return data.get("jobs") or [], int(data.get("pages") or 1)

    return None, 0


# --- Funcao publica ------------------------------------------------------

async def get_careerjet_jobs(on_job=None) -> list:
    """Coleta vagas do Careerjet via API oficial (multi-pais + traducao).

    Para cada locale do ciclo (pt_BR sempre + o lote rotativo) e cada stack
    do lote ativo, pagina a API; vagas de locales nao-portugueses tem
    titulo e descricao traduzidos para portugues antes de emitir.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                emitida - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canonico de 10 campos.
    """
    if not _API_KEY:
        print("[careerjet] CAREERJET_API_KEY ausente no .env - engine ignorada")
        return []

    jobs: list = []
    seen: set[str] = set()
    locales = _active_locales()

    # Front-load do download dos modelos de traducao dos idiomas do ciclo.
    langs = sorted({lc[:2] for lc in locales if lc[:2] != "pt"})
    if langs:
        try:
            await asyncio.to_thread(prepare_translation, langs)
        except Exception:
            pass

    auth = httpx.BasicAuth(_API_KEY, "")
    timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=5.0)

    async def _emit(raw: dict, locale_lang: str) -> None:
        """Normaliza, traduz e emite uma vaga crua da API."""
        base = _extract_job(raw, seen)
        if base is None:
            return
        url, title, company, location, salary, publication_date, description = base

        src = _source_lang(locale_lang, title, description)
        if src != "pt":
            title = await asyncio.to_thread(translate_to_pt, title, src)
            description = await asyncio.to_thread(translate_to_pt, description, src)

        work_type = _work_type(title, location)
        skills = extract_skills(description) if description else []
        parsed = apply_description_fallbacks([
            url, title, company, location, work_type,
            "", salary, publication_date,
            skills, description,
        ])
        # Pipeline central de enriquecimento (epico v3.0.0). description
        # ja foi traduzida pra PT acima, entao hint_lang="pt" pula a
        # traducao no helper e so faz extract_responsibilities. Depois
        # sobrescrevemos description_lang com o IDIOMA DE ORIGEM (src)
        # pra preservar a informacao de procedencia.
        try:
            parsed = await enrich_canonical(parsed, hint_lang="pt")
            if len(parsed) >= 11:
                parsed[10] = src
        except Exception:
            pass
        tracker.discover(parsed[0], engine="careerjet")
        jobs.append(parsed)
        if on_job is not None:
            try:
                await on_job(parsed)
            except Exception:
                pass

    # ---- Checkpoint: retomada do ponto exato apos restart -----------------
    #
    # Granularidade: por combinacao (locale, stack, variant). A pagina
    # interna nao eh checkpointada — perda max no restart eh ~3 paginas.
    # Retomada por LABEL (nao indice) porque o lote rotativo de locales
    # pode mudar entre o checkpoint e o restart. Se algum label salvo nao
    # existir mais no contexto atual, descarta o cursor.
    stacks_list = list(get_active_stacks())
    batch_key = get_active_batch_key()
    cursor = await progress.resume("careerjet", batch_key) if batch_key else None

    resume_locale = (cursor or {}).get("locale")
    resume_stack = (cursor or {}).get("stack")
    resume_variant = (cursor or {}).get("variant")

    resume_locale_idx = 0
    resume_stack_idx = 0
    resume_variant_idx = 0
    if cursor:
        try:
            resume_locale_idx = locales.index(resume_locale) if resume_locale else 0
        except ValueError:
            cursor = None  # locale salvo fora do lote rotativo atual

    if cursor:
        try:
            resume_stack_idx = (
                stacks_list.index(resume_stack) if resume_stack else 0
            )
        except ValueError:
            cursor = None
            resume_locale_idx = 0

    if cursor:
        # variant depende do locale onde paramos — resolve no contexto
        # daquele locale especifico
        variants_at_resume = _location_variants(locales[resume_locale_idx])
        try:
            resume_variant_idx = (
                variants_at_resume.index(resume_variant)
                if resume_variant is not None else 0
            )
        except ValueError:
            resume_variant_idx = 0

    if cursor:
        logger.info("careerjet_resume", extra={
            "batch_key": batch_key,
            "locale": resume_locale, "locale_idx": resume_locale_idx,
            "stack": resume_stack, "stack_idx": resume_stack_idx,
            "variant": resume_variant, "variant_idx": resume_variant_idx,
        })

    async with httpx.AsyncClient(auth=auth, timeout=timeout) as client:
        for locale_idx, locale in enumerate(locales):
            if locale_idx < resume_locale_idx:
                continue
            locale_lang = locale[:2]
            variants = _location_variants(locale)
            max_pages = _max_pages(locale)

            for stack_idx, stack in enumerate(stacks_list):
                if locale_idx == resume_locale_idx and stack_idx < resume_stack_idx:
                    continue
                for variant_idx, location in enumerate(variants):
                    if (locale_idx == resume_locale_idx
                            and stack_idx == resume_stack_idx
                            and variant_idx < resume_variant_idx):
                        continue

                    # Salva o cursor APONTANDO PRA ESTA combinacao antes
                    # de executa-la. Se o processo cair durante, ao
                    # reiniciar refazemos so esta combinacao (max ~3
                    # paginas), nao o batch inteiro.
                    if batch_key:
                        progress.set_cursor("careerjet", batch_key, {
                            "locale_idx": locale_idx, "locale": locale,
                            "stack_idx": stack_idx, "stack": stack,
                            "variant_idx": variant_idx, "variant": location,
                        })

                    total_pages = 1
                    page = 1
                    while page <= min(total_pages, max_pages):
                        try:
                            page_jobs, total_pages = await _fetch_page(
                                client, locale, stack, page, location,
                            )
                        except _CareerjetConfigError as exc:
                            print(f"[careerjet] erro de configuracao, abortando: {exc}")
                            print(f"Foram obtidas {len(jobs)} vagas do site careerjet")
                            if batch_key:
                                await progress.clear("careerjet", batch_key)
                            return jobs

                        if not page_jobs:
                            break

                        for raw in page_jobs:
                            try:
                                await _emit(raw, locale_lang)
                            except Exception:
                                continue

                        page += 1
                        await asyncio.sleep(0.25)

    # Ciclo completo: limpa o cursor pra o proximo batch comecar do zero.
    if batch_key:
        await progress.clear("careerjet", batch_key)

    print(f"Foram obtidas {len(jobs)} vagas do site careerjet")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    found = asyncio.run(get_careerjet_jobs())
    print(f"Total: {len(found)}")
    for j in found[:10]:
        print(j)

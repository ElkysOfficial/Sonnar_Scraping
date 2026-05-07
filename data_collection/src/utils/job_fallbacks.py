"""
Fallbacks compartilhados entre engines: quando o listing/JSON-LD/API nao
informa um campo, tentamos minerar da descricao.

Filosofia:
    - Se o campo veio preenchido com valor real -> mantem.
    - Se veio vazio ou com placeholder ("a combinar", "Outros") -> tenta
      extrair da descricao.
    - Se nem a descricao traz, deixa vazio (preferimos honesto a chutar).

Aplicado a 4 campos: ``salary``, ``location``, ``hiring_regime``, ``work_type``.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta


# =============================================================================
# Salary
# =============================================================================

# Placeholders que algumas engines salvam como salario "real".
_SALARY_PLACEHOLDER_RE = re.compile(
    r"^\s*(?:a\s+combinar|a\s+negociar|a\s+definir|combinar|negociar|"
    r"sal[áa]rio\s+(?:a\s+)?combinar|n[ãa]o\s+informado|"
    r"a\s+confirmar|n/a|none|null)\s*\.?\s*$",
    re.IGNORECASE,
)


def is_real_salary(text: str) -> bool:
    """True se ``text`` for um salario real (nao vazio, nao placeholder)."""
    if not text or not str(text).strip():
        return False
    return not bool(_SALARY_PLACEHOLDER_RE.match(str(text)))


# Range em BRL: "R$ 5.000,00 a R$ 7.500,00", "R$ 5.000 - R$ 7.500"
_SALARY_BRL_RANGE_RE = re.compile(
    r"R\$\s*([\d.,]+)\s*(?:a|at[ée]|[-–])\s*R\$\s*([\d.,]+)",
    re.IGNORECASE,
)
# Range em USD: "USD 60,000 - USD 90,000"
_SALARY_USD_RANGE_RE = re.compile(
    r"(?:USD|US\$)\s*([\d.,]+)\s*(?:to|[-–])\s*(?:USD|US\$)?\s*([\d.,]+)",
    re.IGNORECASE,
)
# Single com prefixo: "Salario: R$ 5.000", "Faixa salarial: R$ 4.000",
# "Pagamento: R$ 5.000", "Remuneracao: R$ 5.000"
_SALARY_SINGLE_RE = re.compile(
    r"(?:sal[áa]rio|faixa\s+salarial|remunera[çc][ãa]o|pagamento|pay)"
    r"\s*[:\-]\s*R\$\s*([\d.,]+)",
    re.IGNORECASE,
)
# Modelo: PJ R$X (sem espaco, valor unico associado a regime)
_SALARY_MODEL_REGIME_RE = re.compile(
    r"(?:modelo|modalidade|regime)\s*[:\-]\s*(?:PJ|CLT|cooperad[oa]?)\s*"
    r"R\$\s*([\d.,]+)",
    re.IGNORECASE,
)
# Bolsa-auxilio (estagio/aprendiz): "Bolsa-auxilio: R$ 1.500,00",
# "Bolsa de R$ 1.500", "Valor da bolsa: R$ 1.500"
_SALARY_BOLSA_RE = re.compile(
    r"(?:bolsa[\s\-]?aux[íi]lio|valor\s+da\s+bolsa|bolsa\s+de\s+est[áa]gio|"
    r"bolsa)\s*[:\-]?\s*R\$\s*([\d.,]+)",
    re.IGNORECASE,
)


def extract_salary_from_description(
    description: str, *, allow_bolsa: bool = True
) -> str:
    """Minera salario da descricao. Empty se nada confiavel.

    Args:
        description: texto da descricao da vaga.
        allow_bolsa: se True, aceita "Bolsa-auxilio: R$X" como salario
            (apropriado pra estagio/aprendiz, onde bolsa eh a remuneracao
            principal). Default True.

    Order:
        1. Range em BRL (mais especifico)
        2. Range em USD
        3. "Pagamento: R$X" / "Salario: R$X"
        4. "Modelo: PJ R$X"
        5. "Bolsa-auxilio: R$X" (se allow_bolsa)
    """
    if not description:
        return ""

    m = _SALARY_BRL_RANGE_RE.search(description)
    if m:
        return f"R$ {m.group(1).strip()} - R$ {m.group(2).strip()}"

    m = _SALARY_USD_RANGE_RE.search(description)
    if m:
        return f"USD {m.group(1).strip()} - USD {m.group(2).strip()}"

    m = _SALARY_SINGLE_RE.search(description)
    if m:
        return f"R$ {m.group(1).strip()}"

    m = _SALARY_MODEL_REGIME_RE.search(description)
    if m:
        return f"R$ {m.group(1).strip()}"

    if allow_bolsa:
        m = _SALARY_BOLSA_RE.search(description)
        if m:
            return f"R$ {m.group(1).strip()}"

    return ""


# =============================================================================
# Location
# =============================================================================

# Cidade + UF brasileira BR (UF e exatamente 2 letras maiusculas).
# Exemplo casa: "Local de Trabalho: Sao Paulo - SP", "Cidade: Recife/PE".
# A UF e ancorada na lista oficial pra evitar matchar siglas estrangeiras.
_BR_UF = (r"AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|"
          r"RS|RO|RR|SC|SP|SE|TO")

_LOCATION_LABELED_WITH_UF_RE = re.compile(
    r"\b(?:local(?:iza[çc][ãa]o)?(?:\s+da\s+vaga|\s+de\s+trabalho|\s+do\s+trabalho)?|"
    r"cidade|location)\s*[:\-]\s*"
    r"([A-ZÀ-Ú][A-Za-zÀ-ÿ\s\-']{2,40}?)"
    r"\s*[/\-,]\s*"
    r"(" + _BR_UF + r")\b",
    re.IGNORECASE,
)

# Cidade sem UF: "Cidade: Curitiba", "Localizacao: Recife". Usa $/MULTILINE
# para nao engolir o resto do paragrafo.
_LOCATION_LABELED_CITY_ONLY_RE = re.compile(
    r"\b(?:local(?:iza[çc][ãa]o)?(?:\s+da\s+vaga|\s+de\s+trabalho)?|"
    r"cidade|location)\s*[:\-]\s*"
    r"([A-ZÀ-Ú][A-Za-zÀ-ÿ\s\-']{2,40}?)"
    r"\s*\.?\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Cidade-UF crua sem label: "Recife, PE", "Sao Paulo - SP"
_LOCATION_CITY_UF_RE = re.compile(
    r"\b([A-ZÀ-Ú][A-Za-zÀ-ÿ' ]{2,40}?)\s*[-,/]\s*(" + _BR_UF + r")\b"
)


def extract_location_from_description(description: str) -> list:
    """Minera cidade/UF da descricao. Lista vazia se nada bater.

    Returns:
        ``[cidade]`` ou ``[cidade, UF]``. Conservador: prefere vazio a chutar.

    Ordem de patterns:
        1. Label + cidade + UF (ex.: "Local de Trabalho: Sao Paulo - SP")
        2. Label + cidade sem UF (ex.: "Cidade: Recife")
        3. Cidade-UF crua sem label (ex.: "...Recife, PE...")
    """
    if not description:
        return []

    m = _LOCATION_LABELED_WITH_UF_RE.search(description)
    if m:
        city = m.group(1).strip(" ,;:-/")
        state = m.group(2).strip()
        if 3 <= len(city) <= 60:
            return [city, state]

    m = _LOCATION_LABELED_CITY_ONLY_RE.search(description)
    if m:
        city = m.group(1).strip(" ,;:-/")
        if 3 <= len(city) <= 60:
            return [city]

    m = _LOCATION_CITY_UF_RE.search(description)
    if m:
        return [m.group(1).strip(), m.group(2)]

    return []


# =============================================================================
# Hiring regime
# =============================================================================

# Combinacoes (precedencia maxima)
_REGIME_COMBINATION_PATTERNS = [
    ("PJ/Cooperado", re.compile(
        r"\b(?:PJ|pessoa\s+jur[ií]dica|prestador\s+de\s+servi[çc]os?)\s*"
        r"(?:ou|e|/|,)\s*cooperad[oa]?|"
        r"\bcooperad[oa]?\s*(?:ou|e|/|,)\s*"
        r"(?:PJ|pessoa\s+jur[ií]dica|prestador\s+de\s+servi[çc]os?)",
        re.IGNORECASE,
    )),
    ("CLT/PJ", re.compile(
        r"\bCLT\s*(?:ou|e|/|,)\s*PJ\b|\bPJ\s*(?:ou|e|/|,)\s*CLT\b|"
        r"\befetivo\s*(?:ou|e|/|,)\s*PJ\b",
        re.IGNORECASE,
    )),
]

# Individuais (em ordem de especificidade)
_REGIME_INDIVIDUAL_PATTERNS = [
    ("Cooperado", re.compile(
        r"\bcooperad[oa]s?\b|\bcooperativ[ao]\b|"
        r"(?:modalidade|regime\s+de\s+contrata[çc][ãa]o(?:\s+de\s+tipo)?)"
        r"\s*[:\-]?\s*cooperad",
        re.IGNORECASE,
    )),
    ("Estágio", re.compile(
        r"\b(?:est[áa]gio|estagi[áa]ri[oa]|intern(?:ship)?)\b|"
        r"regime\s+de\s+contrata[çc][ãa]o\s+(?:de\s+)?tipo\s+est[áa]gio",
        re.IGNORECASE,
    )),
    ("Aprendiz", re.compile(
        r"\b(?:jovem\s+aprendiz|aprendiz\s+legal|menor\s+aprendiz|aprendiz)\b|"
        r"regime\s+de\s+contrata[çc][ãa]o\s+(?:de\s+)?tipo\s+aprendiz",
        re.IGNORECASE,
    )),
    ("Trainee", re.compile(
        r"\btrainee\b|"
        r"regime\s+de\s+contrata[çc][ãa]o\s+(?:de\s+)?tipo\s+trainee",
        re.IGNORECASE,
    )),
    ("Temporário", re.compile(
        r"\b(?:tempor[áa]ri[oa]|fixed[-\s]?term)\b|"
        r"regime\s+de\s+contrata[çc][ãa]o\s+(?:de\s+)?tipo\s+tempor[áa]ri",
        re.IGNORECASE,
    )),
    ("Freelancer", re.compile(r"\bfreelanc(?:e|er)\b", re.IGNORECASE)),
    ("Autônomo", re.compile(r"\baut[ôo]nomo\b", re.IGNORECASE)),
    ("Voluntário", re.compile(r"\bvolunt[áa]ri[oa]\b", re.IGNORECASE)),
    ("PJ", re.compile(
        r"\b(?:PJ|pessoa\s+jur[ií]dica|prestador\s+de\s+servi[çc]os?)\b|"
        r"(?:modalidade|regime\s+de\s+contrata[çc][ãa]o(?:\s+de\s+tipo)?)"
        r"\s*[:\-]?\s*(?:PJ|pessoa\s+jur)",
        re.IGNORECASE,
    )),
    ("CLT", re.compile(
        r"\bCLT\b|carteira\s+assinada|regime\s+celetista|\befetivo\b|"
        r"(?:modalidade|regime\s+de\s+contrata[çc][ãa]o(?:\s+de\s+tipo)?)"
        r"\s*[:\-]?\s*(?:CLT|efetivo)",
        re.IGNORECASE,
    )),
]


def _is_canonical_regime(text: str) -> bool:
    """True se ``text`` ja eh um label canonico que nao precisa normalizar."""
    canon = {"CLT", "PJ", "Cooperado", "CLT/PJ", "PJ/Cooperado",
             "Estágio", "Aprendiz", "Trainee", "Temporário",
             "Freelancer", "Autônomo", "Voluntário"}
    return (text or "").strip() in canon


def extract_regime_from_description(description: str) -> str:
    """Minera regime da descricao. Empty se nada bater.

    Combinacoes ("PJ ou Cooperado", "CLT ou PJ") tem precedencia sobre
    individuais. Combinacao requer conectivo explicito (ou/e/,/) - co-ocorrencia
    casual de PJ e CLT no texto nao dispara combinacao.
    """
    if not description:
        return ""
    for label, pat in _REGIME_COMBINATION_PATTERNS:
        if pat.search(description):
            return label
    for label, pat in _REGIME_INDIVIDUAL_PATTERNS:
        if pat.search(description):
            return label
    return ""


def refine_hiring_regime(current: str, description: str) -> str:
    """Devolve label canonico de regime ou vazio.

    Estrategia:
        1. Se descricao ou current tem combinacao explicita -> usa.
        2. Se ``current`` ja eh canonico -> mantem.
        3. Senao, minera da descricao.
    """
    blob_combo = (current or "") + "\n" + (description or "")
    for label, pat in _REGIME_COMBINATION_PATTERNS:
        if pat.search(blob_combo):
            return label
    if _is_canonical_regime(current):
        return current.strip()
    # Tenta normalizar current (ex.: "Efetivo - CLT" -> "CLT")
    if current:
        for label, pat in _REGIME_INDIVIDUAL_PATTERNS:
            if pat.search(current):
                return label
    return extract_regime_from_description(description)


# =============================================================================
# Work type (Remoto/Hibrido/Presencial)
# =============================================================================

_WORK_REMOTE_RE = re.compile(
    r"\b(?:100%\s+(?:remoto|home\s+office)|totalmente\s+remoto|"
    r"trabalho\s+remoto|home[\s\-]?office|teletrabalho|"
    r"fully\s+remote|work\s+from\s+home)\b",
    re.IGNORECASE,
)
_WORK_HYBRID_RE = re.compile(
    r"\b(?:h[íi]brido|modelo\s+h[íi]brido|trabalho\s+h[íi]brido|hybrid|"
    r"presencial\s+e\s+remoto|remoto\s+e\s+presencial)\b",
    re.IGNORECASE,
)


def extract_work_type_from_description(description: str) -> str:
    """Minera modalidade de trabalho. Empty se nada bater."""
    if not description:
        return ""
    if _WORK_HYBRID_RE.search(description):
        return "Híbrido"
    if _WORK_REMOTE_RE.search(description):
        return "Remoto"
    return ""


def refine_work_type(current: str, title: str, description: str) -> str:
    """Devolve work_type canonico (Remoto/Hibrido/Presencial) ou ``current``.

    Sinais fortes (Remoto/Hibrido) do parser nao sao sobrescritos. So promove
    Presencial/vazio para Remoto/Hibrido quando texto trouxer evidencia clara.
    """
    if current in ("Remoto", "Híbrido"):
        return current
    blob = (title or "") + "\n" + (description or "")
    mined = extract_work_type_from_description(blob)
    return mined or current


# =============================================================================
# Date
# =============================================================================

_RELATIVE_DATE_RE = re.compile(
    r"h[áa]\s+(\d+)\s*\+?\s*(hora|h\b|dia|semana|m[êe]s|mes|ano)s?",
    re.IGNORECASE,
)


def extract_relative_date(text: str) -> str:
    """Converte 'ha N dias/semanas/meses' em DD/MM/YYYY. Empty se nao casar."""
    if not text:
        return ""
    m = _RELATIVE_DATE_RE.search(text)
    if not m:
        return ""
    n = int(m.group(1))
    unit = m.group(2).lower()
    if unit.startswith("h"):
        delta = timedelta(hours=n)
    elif unit.startswith("d"):
        delta = timedelta(days=n)
    elif unit.startswith("s"):
        delta = timedelta(weeks=n)
    elif unit.startswith("m"):
        delta = timedelta(days=30 * n)
    else:
        delta = timedelta(days=365 * n)
    return (datetime.utcnow() - delta).strftime("%d/%m/%Y")


# =============================================================================
# Helper unificado: aplica todos os fallbacks ao job canonico de 10 campos
# =============================================================================

def apply_description_fallbacks(canonical: list) -> list:
    """Aplica fallbacks da descricao ao job canonico (mutacao in-place).

    Espera lista de 10 elementos no formato:
        [link, title, company, location, work_type, hiring_regime,
         salary, publication_date, skills, description]

    Para cada campo (location, work_type, hiring_regime, salary):
        - Se vazio ou placeholder -> minera da descricao.
        - Se preencher algo -> ok; se nao, deixa vazio.
    """
    if len(canonical) < 10:
        return canonical

    title = canonical[1] or ""
    location = canonical[3]
    work_type = canonical[4] or ""
    hiring_regime = canonical[5] or ""
    salary = canonical[6] or ""
    description = canonical[9] or ""

    if not description:
        return canonical

    # Location
    if not location or (isinstance(location, list) and not location):
        mined_loc = extract_location_from_description(description)
        if mined_loc:
            canonical[3] = mined_loc

    # Work type
    refined_wt = refine_work_type(work_type, title, description)
    if refined_wt:
        canonical[4] = refined_wt

    # Hiring regime - sempre passa pelo refine (normaliza Efetivo->CLT etc)
    refined_regime = refine_hiring_regime(hiring_regime, description)
    canonical[5] = refined_regime  # pode ser vazio se nao bater

    # Salary
    if not is_real_salary(salary):
        # Bolsa-auxilio so eh aceito como salario quando o regime for
        # estagio/aprendiz (caso real do Indeed: vagas de estagio mostram
        # bolsa no lugar do salario).
        allow_bolsa = canonical[5] in ("Estágio", "Aprendiz", "Trainee")
        mined_sal = extract_salary_from_description(description, allow_bolsa=allow_bolsa)
        canonical[6] = mined_sal  # vazio se nao achar

    return canonical

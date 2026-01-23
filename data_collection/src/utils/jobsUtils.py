import re
import unicodedata
from typing import Optional, Tuple


# Faixas salariais por senioridade (valores mensais em BRL)
SALARY_RANGES = {
    "intern": (1400, 3000),
    "junior": (2500, 7000),
    "mid": (5000, 12000),
    "senior": (9000, 20000),
    "lead": (12000, 30000),
    "manager": (15000, 45000),
}

# Limites absolutos
SALARY_MIN = 1400  # Salário mínimo
SALARY_MAX = 60000  # Máximo razoável para salário mensal


def normalize_text(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()


def classify_seniority(title: str) -> Tuple[Optional[str], bool]:
    """Classifica a senioridade baseado no título da vaga."""
    text = normalize_text(title)
    is_c_level = bool(
        re.search(r"\b(ceo|cto|cfo|coo|cpo|cio|ciso|chief|vp|vice president)\b", text)
    )

    if re.search(r"\b(estagio|estagiario|intern)\b", text):
        return "intern", is_c_level
    if re.search(r"\b(jr|junior)\b", text):
        return "junior", is_c_level
    if re.search(r"\b(pleno|mid)\b", text):
        return "mid", is_c_level
    if re.search(r"\b(senior|senior|sr|s\s*e\s*n\s*i\s*o\s*r)\b", text):
        return "senior", is_c_level
    if re.search(r"\b(lead|tech lead|staff|principal)\b", text):
        return "lead", is_c_level
    if re.search(r"\b(manager|head|director|diretor|gerente)\b", text):
        return "manager", is_c_level

    return None, is_c_level


def parse_salary_values(text: str) -> Optional[Tuple[float, float]]:
    """Extrai valores numéricos de salário de um texto."""
    if not text:
        return None

    numbers = re.findall(r"\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?", text)
    values = []
    for raw in numbers:
        cleaned = raw.replace(" ", "")
        if "." in cleaned and "," in cleaned:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        elif "," in cleaned:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            parts = cleaned.split(".")
            if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3):
                cleaned = cleaned.replace(".", "")
        try:
            values.append(float(cleaned))
        except ValueError:
            continue

    if not values:
        return None

    if len(values) == 1:
        return values[0], values[0]

    return min(values), max(values)


def is_salary_valid(min_val: float, max_val: float, title: str) -> bool:
    """Verifica se o salário está dentro de limites aceitáveis."""
    # Valores inválidos
    if min_val <= 0 or max_val <= 0:
        return False

    # Abaixo do salário mínimo
    if max_val < SALARY_MIN:
        return False

    # Acima do máximo absoluto
    if max_val > SALARY_MAX:
        return False

    # Range muito grande (dados inconsistentes)
    if max_val > (3 * min_val):
        return False

    # Verifica por senioridade
    seniority, is_c_level = classify_seniority(title)
    if seniority:
        _, max_expected = SALARY_RANGES[seniority]
        # Permite até 50% acima do máximo esperado
        if max_val > (max_expected * 1.5):
            return False
    elif not is_c_level:
        # Sem senioridade detectada, usa limite conservador
        if max_val > 35000:
            return False

    return True


def format_brl(value: float) -> str:
    """Formata um valor como moeda brasileira."""
    formatted = f"{value:,.2f}"
    return formatted.replace(",", "X").replace(".", ",").replace("X", ".")


def process_salary(salary: str, title: str, is_estimated: bool = False) -> str:
    """
    Função principal para processar salários.

    Args:
        salary: String com o salário bruto
        title: Título da vaga (para classificar senioridade)
        is_estimated: Se True, adiciona prefixo indicando estimativa

    Returns:
        Salário formatado ou "a combinar" se inválido
    """
    if not salary:
        return "a combinar"

    # Já é "a combinar"
    if "combinar" in salary.lower():
        return "a combinar"

    # Salário em USD - mantém como está
    lowered = salary.lower()
    if "usd" in lowered or ("$" in salary and "R$" not in salary):
        return salary

    # Extrai valores numéricos
    parsed = parse_salary_values(salary)
    if not parsed:
        return "a combinar"

    min_val, max_val = parsed

    # Valida os valores
    if not is_salary_valid(min_val, max_val, title):
        return "a combinar"

    # Formata o resultado
    if min_val == max_val:
        result = f"R$ {format_brl(min_val)}"
    else:
        result = f"R$ {format_brl(min_val)} - R$ {format_brl(max_val)}"

    # Adiciona prefixo se for estimativa
    if is_estimated:
        seniority, _ = classify_seniority(title)
        if seniority:
            result = f"com base no valor medio pago para {seniority} {result}"
        else:
            result = f"com base no valor medio pago de acordo com a senioridade {result}"

    return result


# Funções de compatibilidade (mantidas para não quebrar código existente)

def sanitize_salary(salary: str, title: str) -> str:
    """Valida e limpa o salário. Retorna 'a combinar' se inválido."""
    return process_salary(salary, title, is_estimated=False)


def format_salary(salary: str) -> str:
    """Formata o salário no padrão brasileiro."""
    if not salary:
        return salary

    lowered = salary.lower()
    if "usd" in lowered or ("$" in salary and "R$" not in salary):
        return salary

    parsed = parse_salary_values(salary)
    if not parsed:
        return salary

    min_val, max_val = parsed

    if min_val == max_val:
        return f"R$ {format_brl(min_val)}"
    else:
        return f"R$ {format_brl(min_val)} - R$ {format_brl(max_val)}"


def format_glassdoor_salary(salary: str, title: str = "") -> str:
    """Formata salário estimado do Glassdoor."""
    return process_salary(salary, title, is_estimated=True)


# Alias para parse_salary_range (compatibilidade)
parse_salary_range = parse_salary_values

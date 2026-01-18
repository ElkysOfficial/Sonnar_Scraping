import re
import unicodedata
from typing import Optional, Tuple


SENIORITY_CAPS = {
    "intern": 4000,
    "junior": 9000,
    "mid": 16000,
    "senior": 25000,
    "lead": 35000,
    "manager": 50000,
}


def normalize_text(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()


def classify_seniority(title: str) -> Tuple[Optional[str], bool]:
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


def parse_salary_range(text: str) -> Optional[Tuple[float, float]]:
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


def sanitize_salary(salary: str, title: str) -> str:
    salary_range = parse_salary_range(salary)
    if not salary_range:
        return salary

    min_val, max_val = salary_range
    if min_val <= 0 or max_val <= 0:
        return ""
    if max_val > 0 and min_val > 0 and max_val > (2.5 * min_val):
        return ""

    seniority, is_c_level = classify_seniority(title)
    if seniority:
        if max_val > SENIORITY_CAPS[seniority]:
            return ""
    else:
        if max_val > 50000 and not is_c_level:
            return ""

    return salary


def format_salary(salary: str) -> str:
    if not salary:
        return salary

    lowered = salary.lower()
    if "usd" in lowered or ("$" in salary and "R$" not in salary):
        return salary

    pattern = re.compile(r"\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?")

    def to_float(value: str) -> Optional[float]:
        raw = value.replace(" ", "")
        if "," in raw and "." in raw:
            last_comma = raw.rfind(",")
            last_dot = raw.rfind(".")
            decimal_sep = "," if last_comma > last_dot else "."
            parts = re.split(r"[.,]", raw)
            integer_part = "".join(parts[:-1])
            decimal_part = parts[-1]
            normalized = f"{integer_part}.{decimal_part}"
        elif "," in raw:
            parts = raw.split(",")
            if len(parts) > 1 and len(parts[-1]) in {1, 2}:
                integer_part = "".join(parts[:-1])
                decimal_part = parts[-1]
                normalized = f"{integer_part}.{decimal_part}"
            else:
                normalized = "".join(parts)
        elif "." in raw:
            parts = raw.split(".")
            if len(parts) > 1 and len(parts[-1]) in {1, 2}:
                integer_part = "".join(parts[:-1])
                decimal_part = parts[-1]
                normalized = f"{integer_part}.{decimal_part}"
            else:
                normalized = "".join(parts)
        else:
            normalized = raw

        try:
            return float(normalized)
        except ValueError:
            return None

    def replace(match: re.Match) -> str:
        value = to_float(match.group(0))
        if value is None:
            return match.group(0)
        formatted = f"{value:,.2f}"
        return formatted.replace(",", "X").replace(".", ",").replace("X", ".")

    if not pattern.search(salary):
        return salary

    formatted = pattern.sub(replace, salary)
    formatted = re.sub(r"\b(reais|real)\b", "R$", formatted, flags=re.IGNORECASE)
    if "R$" not in formatted:
        formatted = f"R$ {formatted}"
    formatted = re.sub(r"(?P<val>\d[\d.,]*)\s*R\$", r"R$ \g<val>", formatted, flags=re.IGNORECASE)

    formatted = re.sub(
        r"\bR\$\s*(?P<min>\d[\d.,]*)\s*[-–]\s*(?P<max>\d[\d.,]*)",
        r"R$ \g<min> - R$ \g<max>",
        formatted,
        flags=re.IGNORECASE
    )

    formatted = re.sub(
        r"(?P<min>\d[\d.,]*)\s*[-–]\s*(?P<max>\d[\d.,]*)",
        r"R$ \g<min> - R$ \g<max>",
        formatted,
        flags=re.IGNORECASE
    )

    range_match = re.search(
        r"(?P<min>\d[\d.,]*)\s*(?:R\$)?\s*[-–]\s*(?P<max>\d[\d.,]*)",
        formatted,
        flags=re.IGNORECASE
    )
    if range_match:
        min_val = range_match.group("min")
        max_val = range_match.group("max")
        try:
            min_num = float(min_val.replace(".", "").replace(",", "."))
            max_num = float(max_val.replace(".", "").replace(",", "."))
        except ValueError:
            return formatted

        if min_num == max_num:
            formatted = formatted.replace(range_match.group(0), min_val)

    return formatted.strip()


def format_glassdoor_salary(salary: str) -> str:
    formatted = format_salary(salary)
    if not formatted:
        return formatted
    if formatted.lower().startswith("com base no glassdoor"):
        return formatted
    return f"com base no glassdoor {formatted}"

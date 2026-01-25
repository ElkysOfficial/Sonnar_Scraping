import asyncio
import json
import os
import re
import time
import unicodedata
from typing import Dict, Optional, Tuple

from playwright.async_api import async_playwright


DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE_PATH = os.path.join(DATA_DIR, "google_cache.json")
CHROME_PROFILE_PATH = os.path.join(DATA_DIR, "chrome_profile")
MISSING_VALUES = {"", "nao informado", "nao informada", "n/a", "na", "a combinar"}
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def is_missing_field(value: Optional[str]) -> bool:
    if value is None:
        return True
    text = _normalize_ascii(str(value)).strip()
    if not text:
        return True
    return text.lower() in MISSING_VALUES


def _normalize_ascii(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def _normalize_key(value: str) -> str:
    cleaned = _normalize_ascii(value)
    cleaned = re.sub(r"^[^A-Za-z0-9]+", "", cleaned)
    return re.sub(r"\s+", " ", cleaned.strip().lower())


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", _normalize_ascii(text)).strip()


def _trim_location(text: str) -> str:
    # Keep the most specific part before separators.
    lowered = text.lower()
    if "coordenadas" in lowered:
        text = text[:lowered.index("coordenadas")]
    text = text.rstrip()
    text = re.sub(r",?\s+e\s+as$", "", text, flags=re.IGNORECASE)
    text = re.sub(r",?\s+e$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^(da|de)\s+empresa\s+[^,]+,\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^(situada|localizada)\s+na\s+cidade\s+de\s+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^na\s+cidade\s+de\s+", "", text, flags=re.IGNORECASE)
    text = re.split(r"[.;]", text)[0]
    return _clean_text(re.split(r"\s*[|-]\s*", text)[0])


BR_STATES = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
    "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
}
BAD_LOCATION_TERMS = {
    "crucial",
    "impacta",
    "fornecedores",
    "colaboradores",
    "possui",
    "foi fundada",
    "meses",
    "anos",
}

COUNTRY_HINTS = {
    "brasil",
    "brazil",
    "eua",
    "usa",
    "estados unidos",
    "united states",
    "portugal",
    "mexico",
    "argentina",
    "chile",
    "colombia",
}


def _looks_like_location(text: str) -> bool:
    if not text:
        return False
    if text.count(",") >= 2:
        return True
    if "," in text and any(hint in text.lower() for hint in COUNTRY_HINTS):
        return True
    if re.search(r"[A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|de|da|do|dos|das))*\s*-\s*[A-Z]{2}", text):
        return True
    if re.search(r"[A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|de|da|do|dos|das))*?,\s*[A-Z]{2}$", text):
        return True
    return False


def _is_valid_location(text: str) -> bool:
    cleaned = _clean_text(text)
    if not cleaned:
        return False
    lowered = cleaned.lower()
    if any(term in lowered for term in BAD_LOCATION_TERMS):
        return False
    if any(char.isdigit() for char in cleaned):
        return False
    return _looks_like_location(cleaned)


def _score_location(candidate: str, company: str) -> int:
    score = 0
    normalized = _clean_text(candidate)
    lowered = normalized.lower()
    if any(hint in lowered for hint in COUNTRY_HINTS):
        score += 3
    if re.search(r",\s*[A-Z]{2},\s*(Brasil|Brazil)$", normalized):
        score += 5
    if re.search(r"[A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|de|da|do|dos|das))*\s*-\s*[A-Z]{2}", normalized):
        score += 4
    if normalized.count(",") >= 2:
        score += 4
    if normalized.count(",") == 1:
        score += 2
    if company:
        company_norm = _normalize_key(company)
        if company_norm and company_norm in _normalize_key(normalized):
            score -= 2
    if len(normalized) > 60:
        score -= 2
    return score


def _is_valid_salary_range(min_salary: str, max_salary: str) -> bool:
    def to_int(value: str) -> int:
        numeric = re.sub(r"[.,]", "", value)
        return int(numeric) if numeric.isdigit() else 0

    min_value = to_int(min_salary)
    max_value = to_int(max_salary)
    if min_value <= 0 or max_value <= 0:
        return False
    return min_value >= 500 and max_value >= 500


def _parse_location_text(text: str) -> Optional[str]:
    normalized = _clean_text(text)
    lowered = normalized.lower()
    patterns = [
        r"(?:\blocaliza(?:da|do) em\b|\blocalizacao\b|\bsede\b|\bheadquarters\b)[:\s]+(.+)",
        r"(?:\bendereco\b|\bsede\b|\bmatriz\b).*?\b(?:e|eh|fica|esta|esta localizada em)\b\s+(.+)",
        r"\b(?:esta localizada em|fica em|situada em)\b\s+(.+)"
    ]
    for pattern in patterns:
        match = re.search(pattern, lowered)
        if match:
            candidate = _trim_location(normalized[match.start(1):match.end(1)])
            if _looks_like_location(candidate):
                return _format_location(candidate)

    match = re.search(
        r"([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|de|da|do|dos|das))*\s*-\s*([A-Z]{2}))",
        normalized
    )
    if match:
        return _format_location(_clean_text(match.group(1)))

    match = re.search(
        r"([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|de|da|do|dos|das))*"
        r",\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
        normalized
    )
    if match:
        candidate = _clean_text(match.group(1))
        if _looks_like_location(candidate):
            return _format_location(candidate)

    return None


def _format_location(text: str) -> str:
    cleaned = _clean_text(text)
    if cleaned.count(",") >= 2:
        return cleaned

    match = re.search(
        r"([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|de|da|do|dos|das))*)\s*-\s*([A-Z]{2})",
        cleaned
    )
    if match:
        city, state = match.group(1), match.group(2)
        if state in BR_STATES:
            return f"{city}, {state}, Brasil"
        return cleaned

    match = re.search(
        r"([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|de|da|do|dos|das))*)"
        r",\s*([A-Z]{2})$",
        cleaned
    )
    if match:
        city, state = match.group(1), match.group(2)
        if state in BR_STATES:
            return f"{city}, {state}, Brasil"
        return cleaned

    return cleaned


def _parse_salary_text(text: str) -> Optional[Tuple[str, str]]:
    values = []
    for match in re.finditer(r"(?:R\$|BRL)\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)", text):
        values.append(_clean_salary(match.group(1)))

    if not values:
        for match in re.finditer(r"(\d{3,}(?:\.\d{3})*(?:,\d{2})?)\s*reais", text, re.IGNORECASE):
            values.append(_clean_salary(match.group(1)))

    if not values:
        return None

    filtered = []
    for value in values:
        numeric = re.sub(r"[.,]", "", value)
        if numeric.isdigit() and int(numeric) >= 500:
            filtered.append(value)

    if not filtered:
        return None
    values = filtered

    if len(values) == 1:
        return values[0], values[0]

    return values[0], values[1]


def _clean_salary(value: str) -> str:
    cleaned = re.sub(r"(?i)r\\$|brl|reais", "", value)
    return cleaned.strip().replace(" ", "")


class GoogleEnricher:
    def __init__(self, headless: Optional[bool] = None, cache_path: Optional[str] = None, profile_path: Optional[str] = None):
        self.cache_path = cache_path or CACHE_PATH
        self.profile_path = profile_path or CHROME_PROFILE_PATH
        env_headless = os.getenv("PLAYWRIGHT_HEADLESS")
        if headless is not None:
            self.headless = headless
        elif env_headless is None:
            self.headless = True
        else:
            self.headless = env_headless.strip().lower() in {"1", "true", "yes", "y"}
        self._cache = self._load_cache()
        self._lock = asyncio.Lock()
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None

    async def __aenter__(self):
        self._playwright = await async_playwright().start()
        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-setuid-sandbox",
        ]

        try:
            # Tenta usar o Chrome instalado primeiro
            self._browser = await self._playwright.chromium.launch(
                channel="chrome",
                headless=self.headless,
                args=launch_args,
            )
        except Exception:
            # Fallback para Chromium bundled
            self._browser = await self._playwright.chromium.launch(
                headless=self.headless,
                args=launch_args,
            )

        self._context = await self._browser.new_context(
            locale="pt-BR",
            timezone_id="America/Sao_Paulo",
            user_agent=DEFAULT_USER_AGENT,
        )

        await self._context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        self._page = await self._context.new_page()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        try:
            if self._page:
                await self._page.close()
        except Exception:
            pass
        try:
            if self._context:
                await self._context.close()
        except Exception:
            pass
        try:
            if self._browser:
                await self._browser.close()
        except Exception:
            pass
        try:
            if self._playwright:
                await self._playwright.stop()
        except Exception:
            pass

    def _load_cache(self) -> Dict[str, Dict[str, str]]:
        default_cache = {
            "cache": {},
            "company_location": {},
            "salary_by_company_role": {},
            "updated_at": time.time()
        }
        if not os.path.exists(self.cache_path):
            return default_cache

        try:
            with open(self.cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            return default_cache

        data.setdefault("cache", {})
        data.setdefault("company_location", {})
        data.setdefault("salary_by_company_role", {})
        data.setdefault("updated_at", time.time())
        return data

    def _save_cache(self) -> None:
        self._cache["updated_at"] = time.time()
        os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
        with open(self.cache_path, "w", encoding="utf-8") as f:
            json.dump(self._cache, f, ensure_ascii=False, indent=2)

    async def enrich_job(self, job_data: Dict[str, str]) -> Dict[str, str]:
        company = str(job_data.get("company", "")).strip()
        if not company:
            return job_data

        if is_missing_field(job_data.get("location")):
            location = await self._get_company_location(company)
            if location:
                job_data["location"] = location

        if is_missing_field(job_data.get("salary")):
            job_title = str(job_data.get("job_title", "")).strip()
            if job_title:
                salary_range = await self._get_salary_from_glassdoor(company, job_title)
                if salary_range:
                    min_salary, max_salary = salary_range
                    job_data["salary"] = f"R$ {min_salary} - R$ {max_salary}"

        return job_data

    async def _get_company_location(self, company: str) -> Optional[str]:
        key = _normalize_key(company)
        cached = self._cache.get("company_location", {}).get(key)
        if cached and _is_valid_location(cached):
            return _format_location(cached)

        async with self._lock:
            cached = self._cache.get("company_location", {}).get(key)
            if cached and _is_valid_location(cached):
                return _format_location(cached)

            location = await self._search_location(company)
            if location:
                formatted = _format_location(location)
                self._cache.setdefault("company_location", {})[key] = formatted
                self._save_cache()
            return formatted if location else None

    async def _get_salary_from_glassdoor(self, company: str, job_title: str) -> Optional[Tuple[str, str]]:
        key = f"{_normalize_key(company)}|{_normalize_key(job_title)}"
        cached = self._cache.get("salary_by_company_role", {}).get(key)
        if cached and isinstance(cached, str):
            if "|" in cached:
                cached_tuple = tuple(cached.split("|", 1))  # type: ignore[return-value]
            else:
                cached_tuple = (cached, cached)
            if _is_valid_salary_range(cached_tuple[0], cached_tuple[1]):
                return cached_tuple

        async with self._lock:
            cached = self._cache.get("salary_by_company_role", {}).get(key)
            if cached and isinstance(cached, str):
                if "|" in cached:
                    cached_tuple = tuple(cached.split("|", 1))  # type: ignore[return-value]
                else:
                    cached_tuple = (cached, cached)
                if _is_valid_salary_range(cached_tuple[0], cached_tuple[1]):
                    return cached_tuple

            salary = await self._search_salary(company, job_title)
            if salary:
                self._cache.setdefault("salary_by_company_role", {})[key] = f"{salary[0]}|{salary[1]}"
                self._save_cache()
            return salary

    async def _search(self, query: str) -> None:
        if not self._page:
            return

        await self._page.goto("https://www.google.com/", wait_until="domcontentloaded")
        await self._accept_google_consent()
        try:
            await self._page.wait_for_selector("textarea[name='q']", timeout=10000)
        except Exception:
            pass
        await self._page.fill("textarea[name='q']", query)
        await self._page.keyboard.press("Enter")
        await self._page.wait_for_load_state("domcontentloaded")
        await self._page.wait_for_timeout(1000)
        try:
            await self._page.wait_for_selector("#search", timeout=10000)
        except Exception:
            pass

    async def _accept_google_consent(self) -> None:
        if not self._page:
            return

        selectors = [
            "button:has-text('Aceitar tudo')",
            "button:has-text('Aceito')",
            "button:has-text('I agree')",
            "button:has-text('Agree')"
        ]
        for selector in selectors:
            try:
                locator = self._page.locator(selector)
                if await locator.count() > 0:
                    await locator.first.click()
                    await self._page.wait_for_timeout(500)
                    break
            except Exception:
                continue

    async def _search_location(self, company: str) -> Optional[str]:
        queries = [
            f"\"{company}\" sede empresa cidade estado pais",
            f"\"{company}\" localizacao sede endereco",
            f"\"{company}\" headquarters city state",
            f"sede da empresa {company}",
        ]
        for query in queries:
            await self._search(query)
            location = await self._extract_location(company)
            if location:
                return location
        return None

    async def _search_salary(self, company: str, job_title: str) -> Optional[Tuple[str, str]]:
        query = (
            f"Com base no glassdoor qual e a media salarial mensal oferecida para a funcao {job_title}"
        )
        if company:
            query += f" pela empresa {company}"
        query += (
            "? A resposta deve sair no seguinte template: "
            "com base no glassdoor valor medio pago por mes para essa vaga por essa empresa "
            "e R$ X - R$ X"
        )
        await self._search(query)
        salary = await self._extract_salary()
        if salary:
            return salary

        fallback_query = f"glassdoor salario medio {job_title} {company}"
        await self._search(fallback_query)
        return await self._extract_salary()

    async def _extract_location(self, company: str) -> Optional[str]:
        texts = []
        for selector in [
            "#rhs [data-attrid='kc:/organization/organization:headquarters']",
            "#rhs [data-attrid='kc:/organization/organization:location']",
            "#rhs [data-attrid='kc:/location/location:address']",
            "#rhs [data-attrid='kc:/organization/organization:address']",
            "#rhs [data-attrid*='address']",
            "#rhs [data-attrid*='Sede']",
            "#rhs [data-attrid*='Headquarters']",
            "#rhs [data-attrid*='Location']",
            "#rhs [data-attrid*='location']",
            "#rhs [data-attrid*='address'] span",
        ]:
            try:
                locator = self._page.locator(selector)
                if await locator.count() > 0:
                    texts.extend(await locator.all_text_contents())
            except Exception:
                continue

        if not texts:
            for selector in ["#search .VwiC3b", "#search .BNeawe.s3v9rd"]:
                try:
                    locator = self._page.locator(selector)
                    if await locator.count() > 0:
                        texts.extend((await locator.all_text_contents())[:40])
                except Exception:
                    continue

        candidates = []
        for text in texts:
            cleaned = _clean_text(text)
            if not cleaned:
                continue
            location = _parse_location_text(cleaned)
            if location and _is_valid_location(location):
                candidates.append(_format_location(location))

        if not candidates:
            return None

        best = max(candidates, key=lambda item: _score_location(item, company))
        return best

    async def _extract_salary(self) -> Optional[Tuple[str, str]]:
        texts = []
        for selector in [
            "#search .VwiC3b",
            "#search .BNeawe.s3v9rd",
            "#rhs *",
            "#search span"
        ]:
            try:
                locator = self._page.locator(selector)
                if await locator.count() > 0:
                    texts.extend((await locator.all_text_contents())[:60])
            except Exception:
                continue

        for text in texts:
            cleaned = _clean_text(text)
            if not cleaned:
                continue
            lowered = cleaned.lower()
            if "glassdoor" not in lowered and "salario" not in lowered and "r$" not in lowered and "reais" not in lowered:
                continue
            salary = _parse_salary_text(cleaned)
            if salary:
                return salary

        return None

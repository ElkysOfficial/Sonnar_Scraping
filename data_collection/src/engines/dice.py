"""
Engine Dice - listing → fetch detalhe (JSON-LD) por vaga.

Foco em vagas tech, predominantemente EUA. Iteramos por stack do lote ativo
no listing ``dice.com/jobs?q=<stack>&page=N`` e enriquecemos cada vaga com
a página de detalhe (JSON-LD ``JobPosting`` schema.org + fallbacks DOM).

Tunáveis (env vars)
-------------------
* ``DICE_FETCH_DETAIL`` (default ``1``) - habilita o GET extra na página de
  detalhe para extrair descrição/skills/salário completo.
* ``DICE_MAX_PAGES`` (default ``50``) - máximo de páginas por stack.
* ``DICE_MAX_EMPTY_PAGES`` (default ``2``) - tolerância de páginas vazias
  consecutivas antes de pular para a próxima stack.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone

from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from variavel import get_active_stacks  # noqa: E402
from src.utils.text_utils import extract_skills  # noqa: E402


# --- Sessão ---------------------------------------------------------------

_session = None


def get_session():
    """Retorna a sessão global, criando-a sob demanda (impersonate Chrome)."""
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome120")
    return _session


def reset_session() -> None:
    """Descarta a sessão atual (use após bloqueios em sequência)."""
    global _session
    _session = None


def _parse_relative_date(date_text: str) -> str:
    """Converte datas relativas para formato DD/MM/YYYY.

    Suporta: "Today", "Yesterday", "X minutes/hours/days/weeks/months ago",
    "Posted X ago", "30+ days ago" (tratado como 30 dias).
    """
    if not date_text:
        return ''

    date_text = date_text.lower().strip()
    today = datetime.now()

    if 'today' in date_text or 'just' in date_text or 'now' in date_text:
        return today.strftime('%d/%m/%Y')
    if 'yesterday' in date_text:
        return (today - timedelta(days=1)).strftime('%d/%m/%Y')

    # "X minutes ago" / "X hours ago" → hoje
    if re.search(r'\d+\s*(?:minute|hour|hr|min)s?\s*(?:ago)?', date_text):
        return today.strftime('%d/%m/%Y')

    # "30+ days ago" → trata como 30
    if re.search(r'30\+\s*d(?:ays?)?', date_text):
        return (today - timedelta(days=30)).strftime('%d/%m/%Y')

    # "X days ago" ou "Xd"
    days_match = re.search(r'(\d+)\s*d(ays?)?\s*(ago)?', date_text)
    if days_match:
        days = int(days_match.group(1))
        return (today - timedelta(days=days)).strftime('%d/%m/%Y')

    # "X weeks ago"
    weeks_match = re.search(r'(\d+)\s*w(eeks?)?\s*(ago)?', date_text)
    if weeks_match:
        weeks = int(weeks_match.group(1))
        return (today - timedelta(weeks=weeks)).strftime('%d/%m/%Y')

    # "X months ago"
    months_match = re.search(r'(\d+)\s*m(onths?)?\s*(ago)?', date_text)
    if months_match:
        months = int(months_match.group(1))
        return (today - timedelta(days=months * 30)).strftime('%d/%m/%Y')

    return ''


def _parse_location(raw: str):
    """Faz parse de strings de localização do Dice.

    Aceita:
      "Remote in San Francisco, CA, US"  → ('San Francisco', 'CA', 'US', 'Remoto')
      "Hybrid in Coppell, TX, US"        → ('Coppell',       'TX', 'US', 'Hibrido')
      "San Diego, CA, US"                → ('San Diego',     'CA', 'US', None)
      "Remote"                           → (None,            None, None, 'Remoto')

    Retorna (city, state_code, country_code, work_type_hint).
    """
    if not raw:
        return None, None, None, None

    text = raw.strip()
    work_hint = None

    # Detectar prefixo Remote/Hybrid in
    m = re.match(r'^(Remote|Hybrid|On-?site)(?:\s+in\s+(.+))?$', text, re.IGNORECASE)
    if m:
        prefix = m.group(1).lower()
        work_hint = {'remote': 'Remoto', 'hybrid': 'Hibrido', 'onsite': 'Presencial', 'on-site': 'Presencial'}[prefix]
        rest = (m.group(2) or '').strip()
        if not rest:
            return None, None, None, work_hint
        text = rest

    # Esperado: "City, ST, CC" ou "City, ST" ou "City". O Dice as vezes
    # devolve sigla com case inconsistente ('Tx' em vez de 'TX'); aceitamos
    # qualquer case e normalizamos para upper.
    parts = [p.strip() for p in text.split(',') if p.strip()]
    city = parts[0] if parts else None
    state_code = parts[1].upper() if len(parts) > 1 and re.fullmatch(r'[A-Za-z]{2}', parts[1]) else None
    country_code = parts[2].upper() if len(parts) > 2 and re.fullmatch(r'[A-Za-z]{2}', parts[2]) else None

    return city, state_code, country_code, work_hint


def _format_salary(raw: str) -> str:
    """Normaliza string de salário em formato canônico:
       'USD 155,584.00 - USD 320,320.00 per year'.

    Aceita variações: '$X - $Y USD per year', 'USD $X.00 - $Y.00 per year',
    '$X - $Y/yr'. Se não conseguir extrair, retorna o raw original.
    """
    if not raw:
        return ''
    text = raw.strip()

    # Detectar período
    period = ''
    if re.search(r'(?:per\s+year|/yr|annual)', text, re.IGNORECASE):
        period = 'per year'
    elif re.search(r'(?:per\s+hour|/hr|hourly)', text, re.IGNORECASE):
        period = 'per hour'
    elif re.search(r'(?:per\s+month|/mo)', text, re.IGNORECASE):
        period = 'per month'

    # Extrair pares de números (com decimais opcionais)
    nums = re.findall(r'\$?\s*([\d,]+(?:\.\d{1,2})?)', text)
    cleaned = []
    for n in nums:
        try:
            value = float(n.replace(',', ''))
            if value >= 1:  # ignora ruído tipo "0.5"
                cleaned.append(value)
        except ValueError:
            continue

    if not cleaned:
        return text  # devolve raw se não conseguir parsear

    def fmt(v: float) -> str:
        return f'USD {v:,.2f}'

    if len(cleaned) >= 2:
        out = f'{fmt(cleaned[0])} - {fmt(cleaned[1])}'
    else:
        out = fmt(cleaned[0])

    return f'{out} {period}'.strip()


def _extract_hiring_regime(text: str) -> str:
    """Extrai regime de contratacao do texto."""
    text_lower = text.lower()

    if 'full-time' in text_lower or 'full time' in text_lower:
        return 'Permanente'
    if 'part-time' in text_lower or 'part time' in text_lower:
        return 'Part-time'
    if 'contract' in text_lower or 'contractor' in text_lower or 'c2c' in text_lower or 'w2' in text_lower:
        return 'Contractor'
    if re.search(r'\d+\s*months?', text_lower):
        return 'Contractor'
    if 'intern' in text_lower:
        return 'Internship'
    if 'freelance' in text_lower:
        return 'Freelancer'
    if 'temporary' in text_lower or 'temp' in text_lower:
        return 'Temporary'

    return ''


def _extract_work_type(text: str, location: str) -> str:
    """Extrai tipo de trabalho (Remoto/Hibrido/Presencial)."""
    combined = (text + ' ' + location).lower()

    if 'on-site' in combined or 'on site' in combined or 'onsite' in combined:
        return 'Presencial'
    if 'remote' in combined:
        return 'Remoto'
    if 'hybrid' in combined:
        return 'Hibrido'

    return 'Presencial'


# --- Página de detalhe (JSON-LD + fallback DOM) ---------------------------

def _strip_html(html_text: str) -> str:
    """Remove tags HTML mantendo quebras de linha legíveis."""
    if not html_text:
        return ''
    # Decodifica entities Unicode escaped (< → <)
    text = html_text
    if '\\u003c' in text or '\\u003e' in text:
        try:
            text = bytes(text, 'utf-8').decode('unicode_escape')
        except Exception:
            pass
    text = re.sub(r'<\s*br\s*/?\s*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</\s*(?:p|li|ul|ol|div|h[1-6])\s*>', '\n', text, flags=re.IGNORECASE)
    text = BeautifulSoup(text, 'html.parser').get_text('\n')
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _extract_jsonld_jobposting(html: str) -> dict:
    """Procura o bloco JSON-LD com @type=JobPosting e devolve o dict."""
    for m in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.IGNORECASE | re.DOTALL,
    ):
        raw = m.group(1).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        candidates = data if isinstance(data, list) else [data]
        for entry in candidates:
            if isinstance(entry, dict) and entry.get('@type') == 'JobPosting':
                return entry
    return {}


def _parse_job_detail(html: str) -> dict:
    """Extrai campos da página de detalhe do Dice.

    Fonte primária: bloco JSON-LD `JobPosting` (schema.org) embutido no SSR.
    Fallbacks por DOM/regex são usados quando o JSON-LD está ausente.
    """
    soup = BeautifulSoup(html, 'html.parser')
    out = {
        'company': '',
        'location_raw': '',
        'salary_raw': '',
        'hiring_regime_raw': '',
        'skills': [],
        'description': '',
        'publication_raw': '',
        'publication_date': '',  # DD/MM/YYYY já formatado quando vier do JSON-LD
    }

    # 1) JSON-LD JobPosting - fonte mais confiável
    jp = _extract_jsonld_jobposting(html)
    if jp:
        # hiringOrganization.name e mais confiavel que a heuristica do card
        # (que descarta strings com virgula tipo "Motion Recruitment Partners, LLC").
        org = jp.get('hiringOrganization')
        if isinstance(org, dict):
            out['company'] = (org.get('name') or '').strip()
        elif isinstance(org, str):
            out['company'] = org.strip()

        out['description'] = _strip_html(jp.get('description', ''))
        # employmentType: 'FULL_TIME' | 'CONTRACTOR' | string lista
        emp = jp.get('employmentType') or ''
        if isinstance(emp, list):
            emp = ' '.join(emp)
        out['hiring_regime_raw'] = str(emp).replace('_', ' ')
        # jobLocation
        loc = jp.get('jobLocation')
        if isinstance(loc, list):
            loc = loc[0] if loc else None
        applicant_loc_only = jp.get('jobLocationType') == 'TELECOMMUTE' or jp.get('applicantLocationRequirements')
        if isinstance(loc, dict):
            addr = loc.get('address') or {}
            city = addr.get('addressLocality') or ''
            region = addr.get('addressRegion') or ''
            country = addr.get('addressCountry') or ''
            # schema.org permite Country/State como string OU objeto
            # ({"@type": "Country", "name": "United States"}).
            if isinstance(region, dict):
                region = region.get('name') or region.get('identifier') or ''
            if isinstance(country, dict):
                country = country.get('name') or country.get('identifier') or ''
            region = str(region).strip()
            country = str(country).strip()
            country_code = country if len(country) == 2 else {'USA': 'US', 'United States': 'US'}.get(country, country[:2].upper() if country else '')
            # Junta apenas as partes presentes - location_normalizer agora
            # entende tanto "City, ST, CC" quanto "ST, CC" (sem cidade)
            # quando o country code for explicito.
            parts = [p for p in [city, region, country_code] if p]
            base = ', '.join(parts)
            if base:
                out['location_raw'] = f'Remote in {base}' if applicant_loc_only else base

        # Fallback: vagas 100% remote frequentemente nao tem jobLocation,
        # apenas applicantLocationRequirements (ex.: Country USA). Usa esse
        # campo para preencher pelo menos o country (location_normalizer
        # reconhece nomes por extenso como 'United States' / 'Canada' /
        # 'Brasil', mas nao siglas isoladas como 'BR' ou 'CA').
        if not out.get('location_raw'):
            apr = jp.get('applicantLocationRequirements')
            apr_list = apr if isinstance(apr, list) else ([apr] if apr else [])
            for entry in apr_list:
                if not isinstance(entry, dict):
                    continue
                cname = entry.get('name') or ''
                if not cname:
                    continue
                # Normaliza siglas para nomes que o country detector entende
                full_name = {
                    'US': 'United States', 'USA': 'United States',
                    'BR': 'Brasil', 'BRA': 'Brasil',
                    'CA': 'Canada', 'CAN': 'Canada',
                }.get(cname.upper(), cname)
                out['location_raw'] = f'Remote in {full_name}'
                break
        # baseSalary
        sal = jp.get('baseSalary')
        if isinstance(sal, dict):
            currency = sal.get('currency') or 'USD'
            value = sal.get('value') or {}
            if isinstance(value, dict):
                vmin = value.get('minValue')
                vmax = value.get('maxValue')
                unit = value.get('unitText', 'YEAR')
                period_map = {'YEAR': 'per year', 'HOUR': 'per hour', 'MONTH': 'per month'}
                period = period_map.get(str(unit).upper(), 'per year')
                if vmin is not None and vmax is not None:
                    out['salary_raw'] = f'{currency} {float(vmin):,.2f} - {currency} {float(vmax):,.2f} {period}'
                elif vmin is not None:
                    out['salary_raw'] = f'{currency} {float(vmin):,.2f} {period}'
        # datePosted (ISO)
        dp = jp.get('datePosted')
        if dp:
            try:
                dt = datetime.fromisoformat(dp.replace('Z', '+00:00'))
                out['publication_date'] = dt.astimezone(timezone.utc).strftime('%d/%m/%Y')
            except (ValueError, AttributeError):
                pass
        # skills (campo `skills` ou `occupationalCategory`)
        skills_field = jp.get('skills') or ''
        if isinstance(skills_field, str) and skills_field:
            parts = [s.strip() for s in re.split(r'[,;|]', skills_field) if s.strip()]
            out['skills'] = parts
        elif isinstance(skills_field, list):
            out['skills'] = [str(s).strip() for s in skills_field if str(s).strip()]

    # Skills - Dice usa chips/pills. Tentar data-testid mais comuns.
    if not out['skills']:
        skill_nodes = soup.select('[data-testid*="skill" i], [data-cy*="skill" i]')
        skills = []
        for node in skill_nodes:
            txt = node.get_text(' ', strip=True)
            if txt and 1 < len(txt) < 60 and txt not in skills:
                skills.append(txt)
        # Fallback: procurar seção "Skills" e pegar lista subsequente
        if not skills:
            for header in soup.find_all(['h2', 'h3', 'h4']):
                if 'skill' in header.get_text(strip=True).lower():
                    container = header.find_next(['ul', 'div'])
                    if container:
                        for li in container.find_all(['li', 'span', 'a'], limit=80):
                            txt = li.get_text(' ', strip=True)
                            if txt and 1 < len(txt) < 60 and txt not in skills:
                                skills.append(txt)
                    break
        out['skills'] = skills

    # Descrição - só rodar se JSON-LD não preencheu
    if not out['description']:
        desc_node = (
            soup.find(attrs={'data-testid': 'jobDescriptionHtml'})
            or soup.find(attrs={'data-testid': 'job-description'})
            or soup.find(attrs={'id': 'jobDescription'})
        )
        if desc_node:
            out['description'] = desc_node.get_text('\n', strip=True)
    if not out['description']:
        for header in soup.find_all(['h2', 'h3', 'h4', 'strong']):
            ht = header.get_text(strip=True).lower()
            if ht in ('job description', 'description', "what you'll do"):
                container = header.find_next(['div', 'section', 'article'])
                if container:
                    out['description'] = container.get_text('\n', strip=True)
                    break

    # Skills canonicas via vocabulario do projeto (forma curta, ex.: "Python"
    # em vez de "Python (Programming Language)"). Cai nas skills do JSON-LD
    # ou dos chips do DOM apenas quando nao temos descricao para parsear -
    # essas variantes sao ricas mas heterogeneas e nem sempre vivem no nosso
    # vocab (ex.: "QE Automation", "Trade fucntion").
    if out['description']:
        canonical = extract_skills(out['description'])
        if canonical:
            out['skills'] = canonical

    # Localização, salário, regime - varrer todo texto procurando padrões
    page_text = soup.get_text('\n', strip=True)

    # Prioridade: "Remote in City, ST, CC" / "Hybrid in City, ST, CC"
    loc_match = re.search(
        r'(Remote|Hybrid|On-?site)\s+in\s+([A-Za-z .\']+),\s*([A-Z]{2}),\s*([A-Z]{2})',
        page_text,
    )
    if loc_match:
        out['location_raw'] = (
            f"{loc_match.group(1)} in {loc_match.group(2).strip()}, "
            f"{loc_match.group(3)}, {loc_match.group(4)}"
        )
    else:
        # Fallback: "City, ST, CC" sozinho - restringe city a tokens "limpos"
        # (sem ' - ' que indica concatenação com título/empresa).
        for line in page_text.split('\n'):
            line = line.strip()
            m = re.fullmatch(r'([A-Za-z][A-Za-z .\']+),\s*([A-Z]{2}),\s*([A-Z]{2})', line)
            if m:
                out['location_raw'] = f"{m.group(1).strip()}, {m.group(2)}, {m.group(3)}"
                break

    sal_match = re.search(
        r'(?:USD\s*)?\$?\s*[\d,]+(?:\.\d{2})?\s*[-–]\s*\$?\s*[\d,]+(?:\.\d{2})?\s*'
        r'(?:USD\s*)?(?:per\s+(?:year|hour|month)|/(?:yr|hr|mo))',
        page_text,
        re.IGNORECASE,
    )
    if sal_match:
        out['salary_raw'] = sal_match.group(0).strip()

    regime_match = re.search(
        r'\b(Full[- ]?Time|Part[- ]?Time|Contract(?:\s+(?:Corp\s+To\s+Corp|W2|Independent))?'
        r'|Internship|Freelance|Temporary)\b',
        page_text,
        re.IGNORECASE,
    )
    if regime_match:
        out['hiring_regime_raw'] = regime_match.group(0).strip()

    pub_match = re.search(
        r'Posted\s+(?:\d+\+?\s*(?:minute|hour|day|week|month)s?\s+ago|today|yesterday)',
        page_text,
        re.IGNORECASE,
    )
    if pub_match:
        out['publication_raw'] = pub_match.group(0).strip()

    return out


async def fetch_job_detail(url: str, session=None) -> dict:
    """Busca a página de detalhe de uma vaga e retorna campos enriquecidos."""
    session = session or get_session()
    try:
        response = await asyncio.to_thread(session.get, url, timeout=30)
        if response.status_code != 200:
            return {}
        return _parse_job_detail(response.text)
    except Exception:
        return {}


# --- Listing + função pública --------------------------------------------

async def get_dice_jobs(on_job=None) -> list:
    """
    Extrai vagas do Dice.com (foco em tech, predominantemente EUA).

    URL Pattern: ``https://www.dice.com/jobs?q={stack}&radius=30&radiusUnit=mi&page={page}``

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                parseada (modo streaming usado pelo controller).

    Returns:
        Lista de vagas no formato:
        ``[link, title, company, location, work_type, regime, salary, date, skills, description]``
        (campos 8 e 9 preenchidos quando ``DICE_FETCH_DETAIL=1``).
    """
    jobs = []
    seen_links = set()
    session = get_session()
    fetch_detail = os.getenv("DICE_FETCH_DETAIL", "1") == "1"

    for stack in get_active_stacks():
        stack_query = urllib.parse.quote(stack.replace('_', ' '))

        page = 1
        consecutive_empty = 0
        max_pages = int(os.getenv("DICE_MAX_PAGES", "50"))
        max_empty_pages = int(os.getenv("DICE_MAX_EMPTY_PAGES", "2"))

        while page <= max_pages:
            try:
                url = f'https://www.dice.com/jobs?q={stack_query}&radius=30&radiusUnit=mi&page={page}'
                response = await asyncio.to_thread(session.get, url, timeout=30)

                if response.status_code != 200:
                    break

                soup = BeautifulSoup(response.text, 'html.parser')
                cards = soup.find_all(attrs={'data-testid': 'job-card'})

                if not cards:
                    consecutive_empty += 1
                    if consecutive_empty >= max_empty_pages:
                        break
                    page += 1
                    continue

                consecutive_empty = 0
                jobs_found_this_page = 0

                for card in cards:
                    try:
                        link_elem = card.find('a', {'data-testid': 'job-search-job-card-link'})
                        if not link_elem:
                            continue

                        link = link_elem.get('href', '')
                        if not link:
                            continue
                        if link in seen_links:
                            continue
                        seen_links.add(link)

                        # Título
                        aria_label = link_elem.get('aria-label', '')
                        title_match = re.search(r'View Details for (.+?)(?:\s*\([a-f0-9]+\))?$', aria_label)
                        job_title = title_match.group(1).strip() if title_match else ''
                        if not job_title:
                            job_title = link_elem.get_text(strip=True)
                        if not job_title:
                            continue

                        card_texts = [t.strip() for t in card.get_text(separator='|', strip=True).split('|') if t.strip()]

                        # Empresa
                        company = ''
                        skip_words = ['easy apply', 'today', 'ago', 'remote', 'hybrid', 'full-time', 'part-time',
                                      'depends', 'salary', '$', 'experience', 'contract', 'contractor', 'intern',
                                      'internship', 'freelance', 'temporary', 'temp', 'per hour', 'per year',
                                      'competitive', 'negotiable', 'posted']
                        for text in card_texts:
                            if text and text not in ['Easy Apply', job_title] and len(text) < 100:
                                text_lower = text.lower()
                                if not any(x in text_lower for x in skip_words):
                                    if ',' not in text or text.count(',') == 0:
                                        company = text.encode('ascii', 'ignore').decode('ascii').strip()
                                        if company and len(company) > 1:
                                            break

                        # Localização (card)
                        location_raw = ''
                        for text in card_texts:
                            if ',' in text and len(text) < 60:
                                if re.search(r',\s*[A-Z]{2}\b', text):
                                    location_raw = text
                                    break

                        card_text_full = ' '.join(card_texts)
                        work_type = _extract_work_type(card_text_full, location_raw)
                        hiring_regime = _extract_hiring_regime(card_text_full)

                        # Salário (card)
                        salary_raw = ''
                        for text in card_texts:
                            tl = text.lower()
                            if 'usd' in tl or '$' in text or 'per hour' in tl or 'per year' in tl or '/yr' in tl or '/hr' in tl:
                                salary_raw = text.strip()
                                break
                            if 'depends' in tl or 'competitive' in tl or 'negotiable' in tl:
                                salary_raw = text.strip()
                                break

                        # Data (card)
                        publication_raw = ''
                        for text in card_texts:
                            if any(x in text.lower() for x in ['today', 'yesterday', 'ago', 'days', 'weeks', 'hours', 'minute']):
                                publication_raw = text
                                break

                        # Enriquecimento via página de detalhe
                        skills: list = []
                        description = ''
                        publication_date_override = None
                        if fetch_detail:
                            detail = await fetch_job_detail(link, session)
                            if detail:
                                skills = detail.get('skills') or []
                                description = detail.get('description') or ''
                                # JSON-LD vence a heuristica do card pra company:
                                # ela despreza strings com virgula, perdendo
                                # nomes como "Motion Recruitment Partners, LLC".
                                if detail.get('company'):
                                    company = detail['company'].encode('ascii', 'ignore').decode('ascii').strip()
                                if detail.get('location_raw'):
                                    location_raw = detail['location_raw']
                                if detail.get('salary_raw'):
                                    salary_raw = detail['salary_raw']
                                if detail.get('hiring_regime_raw'):
                                    hiring_regime = _extract_hiring_regime(detail['hiring_regime_raw']) or hiring_regime
                                if detail.get('publication_date'):
                                    # JSON-LD entregou data absoluta - pula _parse_relative_date
                                    publication_date_override = detail['publication_date']
                                elif detail.get('publication_raw'):
                                    publication_raw = detail['publication_raw']
                            await asyncio.sleep(0.3)

                        # Normalização final
                        city, state_code, country_code, work_hint = _parse_location(location_raw)
                        if work_hint:
                            work_type = work_hint

                        # Reconstroi location no formato consumido pelo location_normalizer:
                        # 'City, ST, CC' (preserva todos os componentes detectados)
                        loc_parts = [p for p in [city, state_code, country_code] if p]
                        location_norm = ', '.join(loc_parts) if loc_parts else ''

                        salary_clean = _format_salary(salary_raw) if salary_raw else ''
                        publication_date = publication_date_override or _parse_relative_date(publication_raw)
                        job_title = job_title.encode('ascii', 'ignore').decode('ascii').strip()

                        if job_title:
                            job = [
                                link, job_title, company, location_norm, work_type,
                                hiring_regime, salary_clean, publication_date,
                                skills, description,
                            ]
                            jobs.append(job)
                            jobs_found_this_page += 1
                            if on_job is not None:
                                try:
                                    await on_job(job)
                                except Exception:
                                    pass

                    except Exception:
                        continue

                if jobs_found_this_page == 0:
                    consecutive_empty += 1
                    if consecutive_empty >= max_empty_pages:
                        break

                page += 1
                await asyncio.sleep(0.3)

            except Exception:
                break

    print(f'Foram obtidas {len(jobs)} vagas do site Dice')
    return jobs


# --- Modo debug -----------------------------------------------------------

async def _debug_one(url: str):
    """Modo debug: testa uma única URL de detalhe e imprime o resultado."""
    detail = await fetch_job_detail(url)
    city, st, cc, hint = _parse_location(detail.get('location_raw', ''))
    salary_clean = _format_salary(detail.get('salary_raw', ''))
    pub_date = detail.get('publication_date') or _parse_relative_date(detail.get('publication_raw', ''))
    print(f'URL: {url}')
    print(f'  company      : {detail.get("company")!r}')
    print(f'  location_raw : {detail.get("location_raw")!r}')
    print(f'  city         : {city}')
    print(f'  state_code   : {st}')
    print(f'  country_code : {cc}')
    print(f'  work_type    : {hint}')
    print(f'  salary_raw   : {detail.get("salary_raw")!r}')
    print(f'  salary_clean : {salary_clean!r}')
    print(f'  regime_raw   : {detail.get("hiring_regime_raw")!r}')
    print(f'  publication  : {detail.get("publication_raw")!r} -> {pub_date}')
    print(f'  skills ({len(detail.get("skills", []))}): {detail.get("skills")}')
    desc = detail.get('description', '')
    print(f'  description  : {desc[:300]}{"..." if len(desc) > 300 else ""}')
    print()


if __name__ == "__main__":
    # Uso: python dice.py [url1 url2 ...]
    # Sem argumentos, roda o crawler completo.
    if len(sys.argv) > 1:
        async def _run():
            for u in sys.argv[1:]:
                await _debug_one(u)
        asyncio.run(_run())
    else:
        jobs = asyncio.run(get_dice_jobs())
        print(f'\n{"="*80}')
        print(f'RESULTADO: {len(jobs)} vagas encontradas')
        print(f'{"="*80}\n')

        for i, job in enumerate(jobs[:5]):
            link, title, company, location, work_type, hiring_regime, salary, pub_date, skills, description = (
                job + [None] * (10 - len(job))
            )[:10]
            print(f'--- Vaga {i+1} ---')
            print(f'Titulo: {title}')
            print(f'Empresa: {company}')
            print(f'Local: {location if location else "Nao especificado"}')
            print(f'Tipo: {work_type}')
            print(f'Regime: {hiring_regime if hiring_regime else "Nao especificado"}')
            print(f'Salario: {salary if salary else "Nao informado"}')
            print(f'Publicacao: {pub_date if pub_date else "Nao informado"}')
            print(f'Skills ({len(skills or [])}): {", ".join(skills or [])[:200]}')
            desc = description or ''
            print(f'Descricao: {desc[:200]}{"..." if len(desc) > 200 else ""}')
            print(f'Link: {link}')
            print()

"""
Repositorio unificado de vagas: normaliza, persiste em JSON local e faz upsert no Supabase.

Camada acima de:
  - location_normalizer.normalize_location
  - LocalJobStore   (JSON local, UTF-8)
  - SupabaseJobsClient (REST)

API:
  async with JobsRepository() as repo:
      ok = await repo.save(job_dict, source='linkedin')

`save` retorna True se ao menos um destino (local OU supabase) confirmou
a persistencia. O CSV legado nao eh tocado aqui.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Optional, Tuple

from .local_store import LocalJobStore
from .location_normalizer import normalize_location
from .supabase_client import SupabaseJobsClient


logger = logging.getLogger(__name__)


def _parse_salary_range(salary_text: str) -> Tuple[Optional[int], Optional[int]]:
    """
    Extrai (min, max) em inteiros a partir de uma string de salario ja processada
    pelo jobsUtils.process_salary (formatos como 'R$ 8.000 - R$ 12.000', 'R$ 5.000', etc.).

    Retorna (None, None) se nao conseguir extrair.
    """
    if not salary_text or not isinstance(salary_text, str):
        return None, None

    numbers = re.findall(r'\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?', salary_text)
    values = []
    for raw in numbers:
        cleaned = raw.replace(' ', '')
        if '.' in cleaned and ',' in cleaned:
            cleaned = cleaned.replace('.', '').replace(',', '.')
        elif ',' in cleaned:
            cleaned = cleaned.replace('.', '').replace(',', '.')
        else:
            parts = cleaned.split('.')
            if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3):
                cleaned = cleaned.replace('.', '')
        try:
            value = float(cleaned)
            if 500 <= value <= 200000:  # filtra ruido
                values.append(int(value))
        except ValueError:
            continue

    if not values:
        return None, None
    return min(values), max(values)


def _parse_date(value: str) -> Optional[str]:
    """Tenta converter qualquer string de data para 'YYYY-MM-DD'. None se falhar."""
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None

    iso_match = re.match(r'(\d{4}-\d{2}-\d{2})', text)
    if iso_match:
        return iso_match.group(1)

    for fmt in ('%d/%m/%Y', '%Y/%m/%d', '%d-%m-%Y', '%m/%d/%Y'):
        try:
            return datetime.strptime(text[:10], fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def build_job_payload(job_data: dict, source: Optional[str] = None) -> dict:
    """
    Constroi o dict canonico (formato Supabase) a partir do job extraido.
    Aplicado tanto ao JSON local quanto ao Supabase.
    """
    location_raw = (job_data.get('location') or '').strip() or None
    state_code, country_code = normalize_location(location_raw or '')

    salary_raw = job_data.get('salary') or None
    salary_min, salary_max = _parse_salary_range(salary_raw or '')

    payload = {
        'job_url': job_data.get('job_url'),
        'job_title': job_data.get('job_title'),
        'company': job_data.get('company') or None,
        'location_raw': location_raw,
        'state_code': state_code,
        'country_code': country_code,
        'work_type': job_data.get('work_type') or None,
        'hiring_regime': job_data.get('hiring_regime') or None,
        'salary_raw': salary_raw,
        'salary_min': salary_min,
        'salary_max': salary_max,
        'salary_currency': 'BRL',
        'publication_date': _parse_date(job_data.get('publication_date', '')),
        'source': source,
        'scraped_at': datetime.now(timezone.utc).isoformat(),
    }
    # Remove chaves com None para nao sobrescrever defaults na tabela
    return {k: v for k, v in payload.items() if v is not None}


class JobsRepository:
    """Orquestra normalizacao + persistencia local + Supabase."""

    def __init__(self, json_path: Optional[str] = None):
        self.local = LocalJobStore(path=json_path)
        self.supabase = SupabaseJobsClient()

    async def __aenter__(self):
        await self.supabase.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.supabase.__aexit__(exc_type, exc, tb)

    def known_urls(self) -> set:
        """Conjunto de job_urls ja persistidos (do JSON local). Usado em dedup."""
        return self.local.known_urls()

    async def save(self, job_data: dict, source: Optional[str] = None) -> bool:
        """
        Normaliza e persiste em (1) JSON local e (2) Supabase.
        Retorna True se ao menos um destino aceitou.
        """
        payload = build_job_payload(job_data, source=source)
        if not payload.get('job_url'):
            return False

        # 1) JSON local — sempre tenta, fonte de verdade pro envio de mensagens
        local_ok = True
        try:
            self.local.upsert(payload)
        except Exception as exc:
            logger.error('Falha local_store.upsert: %s', exc)
            local_ok = False

        # 2) Supabase — best effort
        supa_ok = await self.supabase.upsert_job(payload)

        if not (local_ok or supa_ok):
            return False
        if not supa_ok and self.supabase.enabled:
            logger.warning('Job persistido localmente mas falhou no Supabase: %s', payload['job_url'])
        return True

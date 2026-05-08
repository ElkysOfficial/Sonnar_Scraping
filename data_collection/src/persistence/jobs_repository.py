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
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from .csv_store import CSVJobStore
from .local_store import LocalJobStore
from .location_normalizer import normalize_location
from .supabase_client import SupabaseJobsClient


logger = logging.getLogger(__name__)


# Janela de retencao: vagas com publication_date anterior a esse cutoff
# sao descartadas no save() e apagadas dos sinks no startup do repo.
MAX_AGE_DAYS = 90


def _cutoff_iso(days: int = MAX_AGE_DAYS) -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=days)).isoformat()


def _detect_currency(salary_text: str) -> str:
    """Detecta moeda a partir do texto. Default: BRL (compat com engines legadas)."""
    if not salary_text:
        return 'BRL'
    t = salary_text.upper()
    if 'USD' in t or ('$' in salary_text and 'R$' not in salary_text):
        return 'USD'
    if 'EUR' in t or '€' in salary_text:
        return 'EUR'
    if 'GBP' in t or '£' in salary_text:
        return 'GBP'
    return 'BRL'


# Tetos por moeda - evitam ruído (ex.: ano "2024" virando salário).
# USD/EUR/GBP têm teto alto porque são valores anuais (até C-level ~$1M).
# BRL é mensal e raramente passa de R$200k.
_CURRENCY_RANGES = {
    'BRL': (500, 200_000),
    'USD': (5_000, 1_000_000),
    'EUR': (5_000, 1_000_000),
    'GBP': (5_000, 1_000_000),
}


def _parse_salary_range(salary_text: str, currency: str = 'BRL') -> Tuple[Optional[int], Optional[int]]:
    """
    Extrai (min, max) em inteiros a partir de uma string de salário.

    O ``currency`` ajusta o filtro de ruído: salários USD/EUR/GBP costumam
    ser anuais (até ~1M) enquanto BRL é mensal (até ~200k).
    """
    if not salary_text or not isinstance(salary_text, str):
        return None, None

    lo, hi = _CURRENCY_RANGES.get(currency, _CURRENCY_RANGES['BRL'])

    numbers = re.findall(r'\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?', salary_text)
    values = []
    for raw in numbers:
        cleaned = raw.replace(' ', '')
        # Para USD: vírgula é separador de milhar, ponto é decimal.
        # Para BRL: ponto é separador de milhar, vírgula é decimal.
        if currency == 'BRL':
            if '.' in cleaned and ',' in cleaned:
                cleaned = cleaned.replace('.', '').replace(',', '.')
            elif ',' in cleaned:
                cleaned = cleaned.replace('.', '').replace(',', '.')
            else:
                parts = cleaned.split('.')
                if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3):
                    cleaned = cleaned.replace('.', '')
        else:
            # USD/EUR/GBP: descarta vírgulas (milhar), preserva ponto decimal.
            cleaned = cleaned.replace(',', '')
        try:
            value = float(cleaned)
            if lo <= value <= hi:
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
    currency = _detect_currency(salary_raw or '')
    salary_min, salary_max = _parse_salary_range(salary_raw or '', currency=currency)

    skills = job_data.get('skills') or None
    if isinstance(skills, list) and not skills:
        skills = None

    description = (job_data.get('description') or '').strip() or None

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
        'salary_currency': currency,
        'publication_date': _parse_date(job_data.get('publication_date', '')),
        'source': source,
        'skills': skills,
        'description': description,
        'scraped_at': datetime.now(timezone.utc).isoformat(),
    }
    # Remove chaves com None para nao sobrescrever defaults na tabela
    return {k: v for k, v in payload.items() if v is not None}


class JobsRepository:
    """
    Orquestra normalização e persistência em três sinks (todos best-effort):

      1. ``LocalJobStore``   → ``src/data/jobs.json`` (write-through atômico,
         fonte de verdade para envio de mensagens pelos bots).
      2. ``CSVJobStore``     → ``src/data/job.csv``  (append-only, histórico
         imutável para analytics).
      3. ``SupabaseJobsClient`` → tabela ``public.jobs`` (alimenta agregados
         da landing-page).

    O método ``save`` retorna True se **pelo menos um** sink confirmou. Assim,
    uma queda do Supabase não impede o JSON e o CSV de serem gravados.
    """

    def __init__(
        self,
        json_path: Optional[str] = None,
        csv_path: Optional[str] = None,
    ):
        self.local = LocalJobStore(path=json_path)
        self.csv = CSVJobStore(path=csv_path)
        self.supabase = SupabaseJobsClient()

    async def __aenter__(self):
        await self.supabase.__aenter__()
        await self.purge_stale()
        return self

    async def purge_stale(self, days: int = MAX_AGE_DAYS) -> None:
        """
        Política de purge (Fase 3):
          - JSON local: vagas com publication_date < cutoff são removidas
            (ele alimenta os bots de mensagem; >90d não devem ser enviadas).
          - Supabase (banco): mantém todas as vagas para histórico/analytics.
            O painel admin lista vagas próximas dos 90 dias para ação manual,
            e oferece purge sob demanda via RPC, mas não é mais automático.
        """
        cutoff = _cutoff_iso(days)
        try:
            removed_local = self.local.delete_older_than(cutoff)
            if removed_local:
                logger.info('Purge local (JSON): %d vagas removidas (< %s).', removed_local, cutoff)
        except Exception as exc:
            logger.error('Falha purge local: %s', exc)

    async def __aexit__(self, exc_type, exc, tb):
        try:
            self.local.flush_now()
        except Exception as flush_exc:
            logger.error('Falha flush_now no shutdown: %s', flush_exc)
        await self.supabase.__aexit__(exc_type, exc, tb)

    def flush_now(self) -> None:
        try:
            self.local.flush_now()
        except Exception as exc:
            logger.error('Falha flush_now: %s', exc)

    def known_urls(self) -> set:
        """Conjunto de job_urls ja persistidos (do JSON local). Usado em dedup."""
        return self.local.known_urls()

    # Resultados possíveis de save_with_reason()
    SAVE_OK         = 'ok'
    SAVE_NO_URL     = 'no_url'           # payload sem job_url
    SAVE_TOO_OLD    = 'too_old'          # publication_date < cutoff (90d)
    SAVE_ALL_FAILED = 'all_sinks_failed' # nenhum dos 3 sinks aceitou

    async def save(self, job_data: dict, source: Optional[str] = None) -> bool:
        """Wrapper boolean: True se persistiu em pelo menos 1 sink, False caso contrário.

        Para distinguir "vaga muito velha" (filtro intencional) de "todos os sinks
        falharam" (erro real), use ``save_with_reason``.
        """
        return (await self.save_with_reason(job_data, source)) == self.SAVE_OK

    async def save_with_reason(self, job_data: dict, source: Optional[str] = None) -> str:
        """
        Normaliza ``job_data`` e persiste nos três sinks (JSON, CSV, Supabase).

        Returns:
            - ``SAVE_OK``         persistiu em pelo menos 1 sink.
            - ``SAVE_NO_URL``     job_url ausente — vaga inválida.
            - ``SAVE_TOO_OLD``    publication_date < cutoff (filtro intencional,
                                  NÃO é erro; o controller deve marcar completed).
            - ``SAVE_ALL_FAILED`` falha real: nenhum dos 3 sinks aceitou.
        """
        payload = build_job_payload(job_data, source=source)
        if not payload.get('job_url'):
            return self.SAVE_NO_URL

        # Vagas com publication_date anterior ao cutoff sao ignoradas.
        # Sem publication_date passa direto (nao da pra julgar idade).
        pub = payload.get('publication_date')
        if pub and pub < _cutoff_iso():
            return self.SAVE_TOO_OLD

        # 1) JSON local - fonte de verdade pro bot de envio de mensagens
        local_ok = True
        try:
            self.local.upsert(payload)
        except Exception as exc:
            logger.error('Falha local_store.upsert: %s', exc)
            local_ok = False

        # 2) CSV append-only - histórico imutável para analytics
        csv_ok = self.csv.append(payload)

        # 3) Supabase - alimenta agregados da landing-page
        supa_ok = await self.supabase.upsert_job(payload)

        if not (local_ok or csv_ok or supa_ok):
            return self.SAVE_ALL_FAILED

        if not supa_ok and self.supabase.enabled:
            logger.warning('Job persistido localmente mas falhou no Supabase: %s', payload['job_url'])
        return self.SAVE_OK

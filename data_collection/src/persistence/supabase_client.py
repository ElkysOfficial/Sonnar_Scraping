"""
Cliente Supabase minimalista para upsert de vagas.

Usa a REST API direta (PostgREST) - evita dependencia do supabase-py.
Auth: SUPABASE_SERVICE_ROLE_KEY (escrita full-access, contorna RLS).

Variaveis de ambiente esperadas:
  SUPABASE_URL                ex: https://cqiaiwpjrxqxvhvmcgfs.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   service_role (NUNCA exponha no frontend)
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx


logger = logging.getLogger(__name__)


class SupabaseJobsClient:
    """
    Wrapper REST PostgREST para a tabela public.jobs.
    Reutiliza um httpx.AsyncClient enquanto o cliente esta vivo.
    """

    def __init__(
        self,
        url: Optional[str] = None,
        service_role_key: Optional[str] = None,
        timeout: float = 15.0,
    ):
        self.url = (url or os.getenv('SUPABASE_URL', '')).rstrip('/')
        self.key = service_role_key or os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

        self.enabled = bool(self.url and self.key)
        if not self.enabled:
            logger.warning(
                'Supabase desativado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no env.'
            )

    async def __aenter__(self):
        if self.enabled:
            headers = {
                'apikey': self.key,
                'Authorization': f'Bearer {self.key}',
                'Content-Type': 'application/json',
                # Prefer=resolution=merge-duplicates ativa upsert em PostgREST
                'Prefer': 'resolution=merge-duplicates,return=minimal',
            }
            self._client = httpx.AsyncClient(
                base_url=f'{self.url}/rest/v1',
                headers=headers,
                timeout=self.timeout,
            )
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def upsert_job(self, payload: dict) -> bool:
        """
        Upsert por job_url (UNIQUE). Retorna True se OK, False se falhou ou desativado.
        """
        if not self.enabled or not self._client:
            return False

        try:
            response = await self._client.post(
                '/jobs',
                json=payload,
                params={'on_conflict': 'job_url'},
            )
            if response.status_code in (200, 201, 204):
                return True
            logger.error(
                'Supabase upsert falhou status=%s body=%s payload_url=%s',
                response.status_code,
                response.text[:300],
                payload.get('job_url'),
            )
            return False
        except httpx.HTTPError as exc:
            logger.error('Supabase upsert erro de rede: %s', exc)
            return False

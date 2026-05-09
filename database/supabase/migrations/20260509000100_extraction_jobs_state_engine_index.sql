-- =====================================================
-- Indice parcial em extraction_jobs(last_attempt_at) WHERE state='running'.
--
-- Acelera o requeue_stale_running adicionado no controller (chamado a cada
-- batch ~30min). Filtra running por last_attempt_at < cutoff. Sem o indice
-- e seq scan na tabela inteira; com ele, o pg_index ja cobre a sub-tabela
-- (~30 linhas tipicas) e custa <1ms.
--
-- Indice parcial: tamanho ~30 entradas vs 15k+ de um indice completo.
--
-- NOTA: a query (state, engine) ja e coberta pelo indice existente
-- idx_extraction_jobs_engine_state (engine, state). Nao foi adicionado
-- indice novo ai para evitar redundancia.
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_running_attempt
    ON public.extraction_jobs (last_attempt_at)
    WHERE state = 'running';

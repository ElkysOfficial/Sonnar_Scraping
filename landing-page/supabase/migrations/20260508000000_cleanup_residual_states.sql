-- =====================================================
-- Cleanup pontual de estados residuais.
--
-- Contexto: corrigi 2 bugs anteriormente —
--   1. persist_skipped era usado para vagas filtradas por idade
--      (publication_date > 90d). Agora controllers.py distingue
--      SAVE_TOO_OLD (mark_completed) de SAVE_ALL_FAILED (mark_failed
--      com error_type='all_sinks_failed').
--   2. partial era marcado em engines listing-only (sem refetch_one)
--      sem propósito. Fix em controllers.py: só marca partial quando
--      _has_refetch(engine) for True.
--
-- Run posterior aos fixes ainda gerou linhas com os estados antigos
-- (provavel: scraper rodando com codigo antigo em cache, ou run que
-- comecou antes do pull). Esta migration reclassifica os residuais.
-- =====================================================

-- 1. persist_skipped → completed (vagas velhas, nao erro real)
UPDATE public.extraction_jobs
   SET state = 'completed',
       last_error_type = NULL,
       last_error_msg  = NULL
 WHERE state = 'failed'
   AND last_error_type = 'persist_skipped';

-- 2. partial em engines listing-only (sem refetch_one) → completed
UPDATE public.extraction_jobs
   SET state = 'completed',
       last_error_type = NULL,
       last_error_msg  = NULL
 WHERE state = 'partial'
   AND engine IN (
     'gupy', 'jooble', 'geekhunter', 'remoteok', 'remotive',
     'weworkremotely', 'ziprecruiter'
   );

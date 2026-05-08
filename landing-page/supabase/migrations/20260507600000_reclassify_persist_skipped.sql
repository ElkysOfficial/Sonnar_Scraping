-- =====================================================
-- Reclassifica failed por "persist_skipped" para completed.
--
-- O bug original: vagas com publication_date > 90 dias eram filtradas
-- pelo repo.save() (filtro intencional), mas o controller marcava como
-- failed com error_type="persist_skipped". Isso polui "Falhou (vai
-- tentar de novo)" do dashboard com vagas que NÃO são erro — são
-- corretamente descartadas por idade.
--
-- Bug fixado em controllers.py + jobs_repository.py (save_with_reason
-- distingue SAVE_TOO_OLD de SAVE_ALL_FAILED).
--
-- Esta migration promove os "persist_skipped" antigos para completed.
-- =====================================================

UPDATE public.extraction_jobs
   SET state = 'completed',
       last_error_type = NULL,
       last_error_msg  = NULL
 WHERE state = 'failed'
   AND last_error_type = 'persist_skipped';

-- =====================================================
-- Reclassifica partials existentes em engines listing-only.
--
-- Engines sem refetch_one (gupy, jooble, geekhunter, remoteok, remotive,
-- weworkremotely, ziprecruiter) não têm como reenriquecer descrições
-- curtas - a heurística "descrição < 200 chars = partial" gera ruído.
-- Bug fixado em controllers.py (verifica _has_refetch antes de marcar).
--
-- Este DELETE remove os partials já gravados promovendo-os para completed
-- (apenas onde attempts > 0, ou seja, já houve tentativa real).
-- =====================================================

UPDATE public.extraction_jobs
   SET state = 'completed',
       last_error_type = NULL,
       last_error_msg  = NULL
 WHERE state = 'partial'
   AND engine IN (
     'gupy', 'jooble', 'geekhunter', 'remoteok', 'remotive',
     'weworkremotely', 'ziprecruiter'
   );

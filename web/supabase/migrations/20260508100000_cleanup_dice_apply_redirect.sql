-- =====================================================
-- Limpa URLs lixo do Dice (apply-redirect).
--
-- O parser do Dice listing estava coletando URLs de "/apply-redirect?..."
-- além das URLs canônicas "/job-detail/<uuid>". apply-redirect aponta
-- para sistemas externos de candidatura (Apple Jack / Apply Pass) e
-- não tem estrutura de vaga - só polui o banco e gera refetch_empty.
--
-- Bug fixado em data_collection/src/engines/dice.py: agora descarta
-- qualquer link que contenha /apply-redirect ou que não tenha
-- /job-detail/. Esta migration limpa os ~321 registros já gravados.
-- =====================================================

-- 1. Apaga das vagas reais (public.jobs)
DELETE FROM public.jobs
 WHERE job_url LIKE '%/apply-redirect%';

-- 2. Apaga do tracker de estado
DELETE FROM public.extraction_jobs
 WHERE job_url LIKE '%/apply-redirect%';

-- 3. Apaga da DLQ (caso alguma tenha esgotado attempts)
DELETE FROM public.extraction_dlq
 WHERE job_url LIKE '%/apply-redirect%';

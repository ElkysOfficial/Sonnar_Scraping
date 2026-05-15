-- =====================================================
-- Limpa URLs do InfoJobs com cidade ausente.
--
-- O InfoJobs gera URLs no formato:
--   /vaga-de-{titulo}-em-{cidade}__{id}.aspx
-- Quando o cadastro da vaga não tem cidade preenchida, vem:
--   /vaga-de-{titulo}-em-__{id}.aspx
-- Essas paginas existem (HTTP 200) mas o site nao serve JSON-LD nelas.
-- Sem JSON-LD o parser retorna None - vira refetch_empty no tracker e
-- gasta requests sem persistir nada.
--
-- Bug fixado em data_collection/src/engines/infojobs.py: agora descarta
-- no listing qualquer href que contenha '-em-__' ou '_em-__'. Esta
-- migration apaga as 52 entradas orfas que ja foram coletadas.
--
-- Verificado: NAO ha contaminacao em public.jobs (parser ja rejeitava,
-- por isso so existem em extraction_jobs como state=failed).
-- =====================================================

DELETE FROM public.extraction_jobs
 WHERE engine = 'infojobs'
   AND job_url ~ '-em-__[0-9]+\.aspx$';

DELETE FROM public.extraction_dlq
 WHERE engine = 'infojobs'
   AND job_url ~ '-em-__[0-9]+\.aspx$';

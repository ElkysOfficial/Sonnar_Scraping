-- =====================================================
-- Cleanup: rows com domínio "sem www." que o controller emitiu antes
-- do fix do ENGINE_PRIMARY_DOMAIN.
--
-- O bug: controllers.py mapeava engine -> "dice.com" ("catho.com.br",
-- "bne.com.br", etc) para metrics como persist.ok, persist.skipped.
-- Mas o HTTP layer emite com o hostname real da request, que é
-- "www.dice.com" / "www.catho.com.br" / etc. Resultado: 2 linhas por
-- engine na tabela "Por site" - uma com métricas HTTP, outra órfã.
--
-- Bug fixado em controllers.py: ENGINE_PRIMARY_DOMAIN agora usa o
-- hostname com "www." quando aplicável. Esta migration apaga os
-- registros órfãos já gravados.
-- =====================================================

DELETE FROM public.extraction_metrics
 WHERE domain IN (
   'catho.com.br',
   'careerjet.com.br',
   'geekhunter.com.br',
   'michaelpage.com.br',
   'simplyhired.com.br',
   'bne.com.br',
   'dice.com',
   'infojobs.com.br',
   'ziprecruiter.com'
 );

DELETE FROM public.extraction_events
 WHERE domain IN (
   'catho.com.br',
   'careerjet.com.br',
   'geekhunter.com.br',
   'michaelpage.com.br',
   'simplyhired.com.br',
   'bne.com.br',
   'dice.com',
   'infojobs.com.br',
   'ziprecruiter.com'
 );

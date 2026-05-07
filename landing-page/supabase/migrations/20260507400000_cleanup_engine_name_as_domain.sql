-- =====================================================
-- Cleanup pontual: linhas com `domain` igual ao NOME da engine
-- (em vez do domínio real). Bug fixado em controllers.py (mapa
-- ENGINE_PRIMARY_DOMAIN). Apaga o lixo já gravado para que o
-- dashboard pare de mostrar duas linhas por engine.
-- =====================================================

DELETE FROM public.extraction_metrics
 WHERE domain IN (
   'linkedin','indeed','gupy','jooble','catho','careerjet','geekhunter',
   'michaelpage','programathor','remoteok','remotive','weworkremotely',
   'ziprecruiter','simplyhired','bne','dice','infojobs'
 );

DELETE FROM public.extraction_events
 WHERE domain IN (
   'linkedin','indeed','gupy','jooble','catho','careerjet','geekhunter',
   'michaelpage','programathor','remoteok','remotive','weworkremotely',
   'ziprecruiter','simplyhired','bne','dice','infojobs'
 );

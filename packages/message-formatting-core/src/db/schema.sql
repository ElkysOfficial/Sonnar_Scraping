-- Schema do banco de vagas (SQLite).
--
-- Source-of-truth da camada de persistencia do core. Substitui o jobs.json
-- legado, que era re-serializado inteiro (~80MB) a cada POST /jobs/batch e
-- travava o event loop por dezenas de segundos.
--
-- Estrategia: campos de QUERY/FILTRO/SORT viram colunas indexadas. O resto
-- do entry (description, skills, raw fields, etc.) vai em data_json como
-- payload arbitrario. data_json e o source-of-truth para round-trip ao
-- formato dos bots; as colunas dedicadas sao "indices materializados".

CREATE TABLE IF NOT EXISTS jobs (
  job_url           TEXT PRIMARY KEY NOT NULL,
  job_id            TEXT NOT NULL,
  job_title         TEXT NOT NULL,
  company           TEXT,
  source            TEXT,
  publication_date  TEXT,
  created_at        TEXT,
  updated_at        TEXT,
  sent_to_discord   INTEGER NOT NULL DEFAULT 0,
  sent_to_whatsapp  INTEGER NOT NULL DEFAULT 0,
  sent_to_telegram  INTEGER NOT NULL DEFAULT 0,
  data_json         TEXT NOT NULL
);

-- job_id (md5 do job_url) e usado em GET/DELETE /jobs/:id.
CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON jobs(job_id);

-- Suporta purge (DELETE WHERE publication_date < ?) e ORDER BY publication_date.
CREATE INDEX IF NOT EXISTS idx_jobs_publication_date ON jobs(publication_date);

-- Indices compostos para /jobs/pending?channel=X com ORDER BY publication_date ASC:
-- a query e "WHERE sent_to_<canal> = 0 ORDER BY publication_date ASC" e o
-- indice cobre os dois operadores, evitando file sort.
CREATE INDEX IF NOT EXISTS idx_jobs_pending_discord  ON jobs(sent_to_discord, publication_date);
CREATE INDEX IF NOT EXISTS idx_jobs_pending_whatsapp ON jobs(sent_to_whatsapp, publication_date);
CREATE INDEX IF NOT EXISTS idx_jobs_pending_telegram ON jobs(sent_to_telegram, publication_date);

-- /stats agrupa por source.
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);

-- =====================================================
-- MIGRATION: jobs extended fields
-- =====================================================
-- Adiciona colunas estruturadas para os dados extras que
-- engines novas (dice.com via JSON-LD) já produzem:
--   - location decomposta: location_raw, state_code, country_code
--   - salário estruturado: salary_raw, salary_min, salary_max, salary_currency
--   - skills (lista) e description (texto longo)
--   - scraped_at (timestamp da extração)
-- Todas as colunas são nullable para preservar compat com engines
-- legadas que ainda só preenchem os campos originais.
-- =====================================================

ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS location_raw     TEXT,
    ADD COLUMN IF NOT EXISTS state_code       TEXT,
    ADD COLUMN IF NOT EXISTS country_code     TEXT,
    ADD COLUMN IF NOT EXISTS salary_raw       TEXT,
    ADD COLUMN IF NOT EXISTS salary_min       BIGINT,
    ADD COLUMN IF NOT EXISTS salary_max       BIGINT,
    ADD COLUMN IF NOT EXISTS salary_currency  TEXT,
    ADD COLUMN IF NOT EXISTS skills           TEXT[],
    ADD COLUMN IF NOT EXISTS description      TEXT,
    ADD COLUMN IF NOT EXISTS scraped_at       TIMESTAMPTZ;

-- Índices úteis para filtros por geografia/salário
CREATE INDEX IF NOT EXISTS idx_jobs_country_state
    ON jobs(country_code, state_code);

CREATE INDEX IF NOT EXISTS idx_jobs_salary_max
    ON jobs(salary_max DESC NULLS LAST)
    WHERE salary_max IS NOT NULL;

-- Índice GIN para busca por skill (skills @> ARRAY['Python'])
CREATE INDEX IF NOT EXISTS idx_jobs_skills_gin
    ON jobs USING GIN (skills);

COMMENT ON COLUMN jobs.location_raw    IS 'String original de localização vinda da engine (ex.: "Remote in San Francisco, CA, US")';
COMMENT ON COLUMN jobs.state_code      IS 'UF (BR) ou state code US/ISO 3166-2 quando aplicável';
COMMENT ON COLUMN jobs.country_code    IS 'ISO 3166-1 alpha-2 (BR, US, PT, ...)';
COMMENT ON COLUMN jobs.salary_min      IS 'Mínimo do range salarial em unidades inteiras da moeda em salary_currency';
COMMENT ON COLUMN jobs.salary_max      IS 'Máximo do range salarial em unidades inteiras da moeda em salary_currency';
COMMENT ON COLUMN jobs.salary_currency IS 'ISO 4217 (BRL, USD, EUR, GBP). BRL é mensal; USD/EUR/GBP geralmente anuais.';
COMMENT ON COLUMN jobs.skills          IS 'Lista de skills/keywords extraídas do JSON-LD (Dice) ou seções de skills.';
COMMENT ON COLUMN jobs.description     IS 'Descrição completa da vaga (HTML stripado).';
COMMENT ON COLUMN jobs.scraped_at      IS 'Timestamp UTC da extração - distinto de created_at (primeira inserção).';

-- Migration: Create SYC reviewers table for autocomplete
-- Date: 2026-03-30
-- Description: Stores reviewer names used in Pick for Review for autocomplete suggestions

CREATE TABLE IF NOT EXISTS syc_reviewers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  last_used_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syc_reviewers_name ON syc_reviewers(LOWER(name));

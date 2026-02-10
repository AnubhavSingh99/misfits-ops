-- Migration: Add venue info columns for closed requirements
-- Date: 2026-02-04
-- Description: When a requirement is marked as done, capture the venue details

ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS venue_name VARCHAR(255);
ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS venue_city VARCHAR(100);
ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS venue_area VARCHAR(100);

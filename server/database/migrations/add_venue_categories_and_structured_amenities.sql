-- Migration: Add venue_categories to venue_requirements and convert amenities to structured
-- Date: 2026-02-13
-- Description: Add venue_categories TEXT[] for multi-select venue type preference,
--              add venue_categories_arr column for structured amenities (keeping old text column for backward compat)

-- Add venue_categories array column (e.g., ['CAFE', 'PUB_AND_BAR'])
ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS venue_categories TEXT[];

-- Add structured amenities array column (keeps old amenities_required text for backward compat)
ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS amenities_list TEXT[];

-- Add inactive status to venue_repository
-- (no schema change needed, just allowing 'inactive' as a valid status value)

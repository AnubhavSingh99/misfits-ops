-- Migration: Add custom city and area columns to venue_repository
-- Date: 2026-02-03
-- Description: Allow storing custom city/area names for venues in locations not yet in the production database

-- Add custom_city column for cities not in DB
ALTER TABLE venue_repository ADD COLUMN IF NOT EXISTS custom_city TEXT;

-- Add custom_area column for areas not in DB
ALTER TABLE venue_repository ADD COLUMN IF NOT EXISTS custom_area TEXT;

-- Add comment for clarity
COMMENT ON COLUMN venue_repository.custom_city IS 'Custom city name when city is not in production database (for scaling targets)';
COMMENT ON COLUMN venue_repository.custom_area IS 'Custom area name when area is not in production database (for scaling targets)';

-- Migration: Add indexes for venue repository filtering
-- Date: 2026-02-04
-- Description: Add GIN index on venue_info JSONB for activity/capacity filtering
--              and partial indexes on custom_city/custom_area for city/area filtering

-- GIN index for JSONB queries (preferred_schedules activity, capacity_category)
CREATE INDEX IF NOT EXISTS idx_venue_repository_venue_info ON venue_repository USING GIN (venue_info);

-- Partial indexes for custom city/area filtering
CREATE INDEX IF NOT EXISTS idx_venue_repository_custom_city ON venue_repository(custom_city) WHERE custom_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_repository_custom_area ON venue_repository(custom_area) WHERE custom_area IS NOT NULL;

-- Migration: Add venue requirements scheduling fields
-- Date: 2026-01-22
-- Description: Add day_type_id, time_of_day, amenities_required columns and migrate status values

-- Add day_type_id (references dim_day_types.id)
ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS day_type_id INTEGER REFERENCES dim_day_types(id);

-- Add time_of_day as TEXT array (multi-select: early_morning, morning, afternoon, evening, night, all_nighter)
ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS time_of_day TEXT[];

-- Add amenities_required (free text)
ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS amenities_required TEXT;

-- Migrate status: in_progress -> picked
UPDATE venue_requirements SET status = 'picked' WHERE status = 'in_progress';

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_venue_req_day_type ON venue_requirements(day_type_id);
CREATE INDEX IF NOT EXISTS idx_venue_req_time_of_day ON venue_requirements USING GIN(time_of_day);

-- Update comments
COMMENT ON COLUMN venue_requirements.day_type_id IS 'Day type reference (weekday, weekend, specific days) from dim_day_types';
COMMENT ON COLUMN venue_requirements.time_of_day IS 'Array of time slots: early_morning, morning, afternoon, evening, night, all_nighter';
COMMENT ON COLUMN venue_requirements.amenities_required IS 'Free text describing required amenities (parking, AC, changing rooms, etc.)';
COMMENT ON COLUMN venue_requirements.status IS 'Workflow status: not_picked, picked, venue_aligned, leader_approval, done, deprioritised';

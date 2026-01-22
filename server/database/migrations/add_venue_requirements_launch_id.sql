-- Migration: Add launch_id and target_id columns to venue_requirements
-- Date: 2026-01-22
-- Description: Adds dedicated launch_id and target_id columns to properly track venue requirements for launches and expansion targets

-- Add launch_id column
ALTER TABLE venue_requirements
ADD COLUMN IF NOT EXISTS launch_id INTEGER;

-- Create index for launch_id queries
CREATE INDEX IF NOT EXISTS idx_venue_req_launch_id
ON venue_requirements(launch_id);

-- Add comment
COMMENT ON COLUMN venue_requirements.launch_id IS 'References new_club_launches.id for requirements linked to launches';

-- Add target_id column for expansion targets
ALTER TABLE venue_requirements
ADD COLUMN IF NOT EXISTS target_id INTEGER;

-- Create index for target_id queries
CREATE INDEX IF NOT EXISTS idx_venue_req_target_id
ON venue_requirements(target_id);

-- Add comment
COMMENT ON COLUMN venue_requirements.target_id IS 'References club_dimensional_targets.id for requirements linked to expansion targets';

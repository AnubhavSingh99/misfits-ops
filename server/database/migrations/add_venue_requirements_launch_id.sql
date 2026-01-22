-- Migration: Add launch_id column to venue_requirements
-- Date: 2026-01-22
-- Description: Adds dedicated launch_id column to properly track venue requirements for launches

-- Add launch_id column
ALTER TABLE venue_requirements
ADD COLUMN IF NOT EXISTS launch_id INTEGER;

-- Create index for launch_id queries
CREATE INDEX IF NOT EXISTS idx_venue_req_launch_id
ON venue_requirements(launch_id);

-- Add comment
COMMENT ON COLUMN venue_requirements.launch_id IS 'References new_club_launches.id for requirements linked to launches';

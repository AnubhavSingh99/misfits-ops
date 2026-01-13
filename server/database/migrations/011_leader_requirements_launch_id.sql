-- Migration: Add launch_id column to leader_requirements
-- Date: 2026-01-13
-- Description: Adds dedicated launch_id column to properly track requirements
--              linked to new club launches instead of conflating with club_id

-- Add launch_id column
ALTER TABLE leader_requirements
ADD COLUMN IF NOT EXISTS launch_id INTEGER;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_leader_req_launch_id
ON leader_requirements(launch_id);

-- Add comment
COMMENT ON COLUMN leader_requirements.launch_id IS 'References new_club_launches.id for requirements linked to launches';

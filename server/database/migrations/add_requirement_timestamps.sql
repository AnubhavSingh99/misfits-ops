-- Migration: Add completed_at timestamp to requirements tables
-- Date: 2026-01-19
-- Description: Track when requirements are completed for TAT calculation

-- Add completed_at column to venue_requirements
ALTER TABLE venue_requirements
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Add completed_at column to leader_requirements
ALTER TABLE leader_requirements
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Add index for completed_at queries (for TAT reporting)
CREATE INDEX IF NOT EXISTS idx_venue_req_completed_at ON venue_requirements(completed_at);
CREATE INDEX IF NOT EXISTS idx_leader_req_completed_at ON leader_requirements(completed_at);

-- Update existing 'done' requirements to have completed_at = updated_at
-- This backfills data for requirements that were already completed
UPDATE venue_requirements
SET completed_at = updated_at
WHERE status = 'done' AND completed_at IS NULL;

UPDATE leader_requirements
SET completed_at = updated_at
WHERE status = 'done' AND completed_at IS NULL;

-- Comments
COMMENT ON COLUMN venue_requirements.completed_at IS 'Timestamp when requirement status changed to done (auto-set)';
COMMENT ON COLUMN leader_requirements.completed_at IS 'Timestamp when requirement status changed to done (auto-set)';

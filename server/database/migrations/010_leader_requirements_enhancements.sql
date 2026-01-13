-- Migration: Enhance leader_requirements table
-- Date: 2026-01-13
-- Description: Add leaders_required count and existing_leader_effort boolean

-- Add leaders_required (defaults to 1, rolls up as sum at hierarchy levels)
ALTER TABLE leader_requirements
ADD COLUMN IF NOT EXISTS leaders_required INTEGER NOT NULL DEFAULT 1;

-- Add existing_leader_effort (new effort type - current leader finds leaders)
ALTER TABLE leader_requirements
ADD COLUMN IF NOT EXISTS existing_leader_effort BOOLEAN DEFAULT false;

-- Add index for efficient rollup queries
CREATE INDEX IF NOT EXISTS idx_leader_req_leaders_count
ON leader_requirements(leaders_required);

-- Also add same columns to venue_requirements for consistency
ALTER TABLE venue_requirements
ADD COLUMN IF NOT EXISTS venues_required INTEGER NOT NULL DEFAULT 1;

ALTER TABLE venue_requirements
ADD COLUMN IF NOT EXISTS existing_leader_effort BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_venue_req_venues_count
ON venue_requirements(venues_required);

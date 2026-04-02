-- Migration: Add availability, attribution, and BAU workqueue fields to venue repository
-- Date: 2026-03-25
-- Description: Adds fields for tracking when a venue becomes available, who added it,
--   which team sourced it (BAU/Supply), and whether BAU has picked it up for review.

-- Problem 3: Available since date
ALTER TABLE venue_repository
  ADD COLUMN IF NOT EXISTS available_since DATE;

-- Problem 3: Attribution
ALTER TABLE venue_repository
  ADD COLUMN IF NOT EXISTS added_by VARCHAR(100);

ALTER TABLE venue_repository
  ADD COLUMN IF NOT EXISTS sourced_by_team VARCHAR(20) DEFAULT 'bau';

-- Problem 3: BAU workqueue flag
ALTER TABLE venue_repository
  ADD COLUMN IF NOT EXISTS bau_picked BOOLEAN DEFAULT false;

ALTER TABLE venue_repository
  ADD COLUMN IF NOT EXISTS bau_picked_at TIMESTAMP;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_venue_repo_sourced_by ON venue_repository(sourced_by_team);
CREATE INDEX IF NOT EXISTS idx_venue_repo_bau_picked ON venue_repository(bau_picked);

-- All venues start as bau_picked = false — BAU team picks them up to assign to clubs

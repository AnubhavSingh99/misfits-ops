-- Migration: add_launch_transition_columns.sql
-- Date: 2026-01-14
-- Description: Add columns to support launch-to-club transition feature
--              Enables auto-matching, manual matching, and revert capability

-- Add match_type column to track how the launch was matched
-- Values: 'auto', 'manual', 'legacy', NULL (not matched)
ALTER TABLE new_club_launches
ADD COLUMN IF NOT EXISTS match_type VARCHAR(20) DEFAULT NULL;

-- Add previous_status to enable reverting transitions
-- Stores the launch_status before transition occurred
ALTER TABLE new_club_launches
ADD COLUMN IF NOT EXISTS previous_status VARCHAR(50) DEFAULT NULL;

-- Add matched_at timestamp to track when transition occurred
-- Used for revert logic (delete targets created after this time)
ALTER TABLE new_club_launches
ADD COLUMN IF NOT EXISTS matched_at TIMESTAMP DEFAULT NULL;

-- Add matched_club_name to cache club name for display
-- Avoids join to production database for showing matched club name
ALTER TABLE new_club_launches
ADD COLUMN IF NOT EXISTS matched_club_name VARCHAR(255) DEFAULT NULL;

-- Handle existing data: Mark already-transitioned launches as 'legacy'
UPDATE new_club_launches
SET
  match_type = 'legacy',
  matched_at = updated_at,
  previous_status = 'planned'
WHERE actual_club_id IS NOT NULL
  AND match_type IS NULL;

-- Add index for querying unmatched launches efficiently
CREATE INDEX IF NOT EXISTS idx_new_club_launches_unmatched
ON new_club_launches (actual_club_id, launch_status, match_type)
WHERE actual_club_id IS NULL;

-- Add index for querying matched launches by club
CREATE INDEX IF NOT EXISTS idx_new_club_launches_matched_club
ON new_club_launches (actual_club_id)
WHERE actual_club_id IS NOT NULL;

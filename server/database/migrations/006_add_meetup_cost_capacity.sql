-- Migration: Add meetup_cost and meetup_capacity columns to target tables
-- Date: 2026-01-06
-- Description: Support auto-calculation of target_revenue = target_meetups × meetup_cost × meetup_capacity
-- Updated: 2026-01-07 - Include meetup_cost and meetup_capacity in unique constraint

-- Add columns to club_dimensional_targets
ALTER TABLE club_dimensional_targets
ADD COLUMN IF NOT EXISTS meetup_cost DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS meetup_capacity INTEGER;

-- Add columns to launch_dimensional_targets
ALTER TABLE launch_dimensional_targets
ADD COLUMN IF NOT EXISTS meetup_cost DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS meetup_capacity INTEGER;

-- Add comment explaining the revenue calculation
COMMENT ON COLUMN club_dimensional_targets.meetup_cost IS 'Cost per meetup in INR. Revenue = target_meetups × meetup_cost × meetup_capacity';
COMMENT ON COLUMN club_dimensional_targets.meetup_capacity IS 'Average number of attendees per meetup';
COMMENT ON COLUMN launch_dimensional_targets.meetup_cost IS 'Cost per meetup in INR. Revenue = target_meetups × meetup_cost × meetup_capacity';
COMMENT ON COLUMN launch_dimensional_targets.meetup_capacity IS 'Average number of attendees per meetup';

-- Update unique index to include meetup_cost and meetup_capacity
-- This allows multiple targets per club with different cost/capacity combinations
DROP INDEX IF EXISTS idx_club_dim_unique;
CREATE UNIQUE INDEX idx_club_dim_unique ON club_dimensional_targets (
  club_id,
  COALESCE(area_id, -1),
  COALESCE(day_type_id, -1),
  COALESCE(format_id, -1),
  COALESCE(meetup_cost::numeric, -1),
  COALESCE(meetup_capacity, -1)
);

-- Same for launch targets
DROP INDEX IF EXISTS idx_launch_dim_unique;
CREATE UNIQUE INDEX idx_launch_dim_unique ON launch_dimensional_targets (
  launch_id,
  COALESCE(area_id, -1),
  COALESCE(day_type_id, -1),
  COALESCE(format_id, -1),
  COALESCE(meetup_cost::numeric, -1),
  COALESCE(meetup_capacity, -1)
);

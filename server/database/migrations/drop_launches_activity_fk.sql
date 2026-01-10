-- Migration: Drop FK constraint from new_club_launches to activity_scaling_targets
-- Date: 2026-01-10
-- Description: Remove overly restrictive FK that required activities to exist in
-- activity_scaling_targets before creating launches. This allows launches for any activity.

ALTER TABLE new_club_launches DROP CONSTRAINT IF EXISTS new_club_launches_activity_name_fkey;

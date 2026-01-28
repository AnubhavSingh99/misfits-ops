-- Migration: Add closed_by column to leader_requirements
-- Date: 2026-01-28
-- Description: Track who closed/completed a leader requirement (growth_team or platform_team)
--              This triggers Slack notifications to the appropriate person

ALTER TABLE leader_requirements ADD COLUMN IF NOT EXISTS closed_by VARCHAR(20);

-- closed_by values: 'growth_team' or 'platform_team'
COMMENT ON COLUMN leader_requirements.closed_by IS 'Who closed the requirement: growth_team or platform_team. Used for Slack notifications.';

-- Index for filtering by closed_by
CREATE INDEX IF NOT EXISTS idx_leader_req_closed_by ON leader_requirements(closed_by);

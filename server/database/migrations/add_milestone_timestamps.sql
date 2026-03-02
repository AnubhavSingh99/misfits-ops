-- Migration: Add milestone timestamps for TAT tracking
-- Date: 2026-02-27
-- Description: Track when each milestone was completed + where rejected from

ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS first_call_done_at TIMESTAMPTZ;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS venue_sorted_at TIMESTAMPTZ;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS marketing_launched_at TIMESTAMPTZ;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS picked_at TIMESTAMPTZ;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS interview_started_at TIMESTAMPTZ;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS rejected_from_status TEXT;

-- Migration: Add reviewed_by and interview_ratings to club_applications
-- Date: 2026-02-27
-- Description: Track who picked/reviewed the application + separate interview ratings

ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS interview_ratings JSONB;

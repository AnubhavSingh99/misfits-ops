-- Migration: Add capacity column to venue_requirements
-- Date: 2026-01-23
-- Description: Add capacity bucket field for venue requirements

ALTER TABLE venue_requirements
ADD COLUMN IF NOT EXISTS capacity VARCHAR(20);

-- Add comment explaining valid values
COMMENT ON COLUMN venue_requirements.capacity IS 'Capacity bucket: <10, 10-20, 20-30, 30-50, 50-100, 100-200, 200-500, >500';

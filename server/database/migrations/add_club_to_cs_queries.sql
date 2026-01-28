-- Migration: Add club_id and club_name to cs_queries
-- Date: 2026-01-28
-- Description: Add club information for leader queries

ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS club_id INTEGER;
ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS club_name VARCHAR(255);

-- Create index for club_id lookups
CREATE INDEX IF NOT EXISTS idx_cs_queries_club_id ON cs_queries(club_id);

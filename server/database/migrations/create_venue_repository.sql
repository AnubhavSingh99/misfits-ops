-- Migration: Create venue_repository table
-- Date: 2026-02-03
-- Description: Venue sourcing pipeline tracker with same fields as VMS location table

CREATE TABLE IF NOT EXISTS venue_repository (
  id SERIAL PRIMARY KEY,

  -- Same as production location table
  name TEXT NOT NULL,
  url TEXT,  -- Google Maps link
  area_id BIGINT,  -- FK to production area table (city derived from area)
  venue_info JSONB DEFAULT '{}',  -- VMS fields: venue_category, seating_category, capacity_category, amenities, preferred_schedules, etc.

  -- Pipeline tracking
  status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'interested', 'negotiating', 'rejected', 'onboarded')),
  contact_name TEXT,
  contact_phone TEXT,
  contacted_by TEXT,  -- Free text: who reached out
  closed_by TEXT,     -- Free text: who closed the deal or marked rejected
  rejection_reason TEXT,
  notes TEXT,

  -- Linkage to VMS
  vms_location_id BIGINT,  -- production location.id once onboarded

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_venue_repository_status ON venue_repository(status);
CREATE INDEX IF NOT EXISTS idx_venue_repository_area_id ON venue_repository(area_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_venue_repository_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_venue_repository_updated_at ON venue_repository;
CREATE TRIGGER trigger_venue_repository_updated_at
  BEFORE UPDATE ON venue_repository
  FOR EACH ROW
  EXECUTE FUNCTION update_venue_repository_updated_at();

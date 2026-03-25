-- Migration: Add venue platform team (BAU/Supply) to venue requirements
-- Date: 2026-03-25
-- Description: Adds a separate team dimension for Venue Platform BAU and Supply teams.
--   Every requirement defaults to BAU. BAU can escalate to Supply, Supply can send back.
--   This is independent of the existing blue/green/yellow growth team field.

ALTER TABLE venue_requirements
  ADD COLUMN IF NOT EXISTS venue_platform_team VARCHAR(20) DEFAULT 'bau';

ALTER TABLE venue_requirements
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;

ALTER TABLE venue_requirements
  ADD COLUMN IF NOT EXISTS escalated_by VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_venue_req_platform_team
  ON venue_requirements(venue_platform_team);

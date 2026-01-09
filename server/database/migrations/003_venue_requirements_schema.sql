-- Migration: Create venue_requirements table
-- Date: 2026-01-07
-- Description: Track venue requirements linked to scaling tasks

CREATE TABLE IF NOT EXISTS venue_requirements (
  id SERIAL PRIMARY KEY,

  -- Naming
  name VARCHAR(255) NOT NULL,  -- Can be club name or custom name
  description TEXT,

  -- Hierarchy context (inherited from task/club)
  activity_id INTEGER,
  activity_name VARCHAR(100),
  city_id INTEGER,
  city_name VARCHAR(100),
  area_id INTEGER,
  area_name VARCHAR(100),
  club_id INTEGER,
  club_name VARCHAR(100),

  -- Status tracking
  status VARCHAR(20) DEFAULT 'not_picked',  -- not_picked, deprioritised, in_progress, done

  -- Effort attributes
  growth_team_effort BOOLEAN DEFAULT false,
  platform_team_effort BOOLEAN DEFAULT false,

  -- Comments
  comments TEXT,

  -- Team assignment (for filtering)
  team VARCHAR(20),  -- blue, green, yellow

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_venue_req_status ON venue_requirements(status);
CREATE INDEX IF NOT EXISTS idx_venue_req_activity ON venue_requirements(activity_id);
CREATE INDEX IF NOT EXISTS idx_venue_req_city ON venue_requirements(city_id);
CREATE INDEX IF NOT EXISTS idx_venue_req_area ON venue_requirements(area_id);
CREATE INDEX IF NOT EXISTS idx_venue_req_club ON venue_requirements(club_id);
CREATE INDEX IF NOT EXISTS idx_venue_req_team ON venue_requirements(team);

-- Comments
COMMENT ON TABLE venue_requirements IS 'Track venue requirements for clubs - courts, spaces, locations, etc.';
COMMENT ON COLUMN venue_requirements.name IS 'Requirement name - often pre-filled from club name';
COMMENT ON COLUMN venue_requirements.status IS 'Workflow status: not_picked, deprioritised, in_progress, done';
COMMENT ON COLUMN venue_requirements.growth_team_effort IS 'Whether growth team needs to put effort for this requirement';
COMMENT ON COLUMN venue_requirements.platform_team_effort IS 'Whether platform/tech team needs to put effort for this requirement';
COMMENT ON COLUMN venue_requirements.team IS 'Team assignment (blue/green/yellow) - auto-inherited from activity-city context';

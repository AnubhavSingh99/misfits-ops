-- Migration: Create leader_requirements table
-- Date: 2026-01-07
-- Description: Track leader requirements linked to scaling tasks

CREATE TABLE IF NOT EXISTS leader_requirements (
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
CREATE INDEX IF NOT EXISTS idx_leader_req_status ON leader_requirements(status);
CREATE INDEX IF NOT EXISTS idx_leader_req_activity ON leader_requirements(activity_id);
CREATE INDEX IF NOT EXISTS idx_leader_req_city ON leader_requirements(city_id);
CREATE INDEX IF NOT EXISTS idx_leader_req_area ON leader_requirements(area_id);
CREATE INDEX IF NOT EXISTS idx_leader_req_club ON leader_requirements(club_id);
CREATE INDEX IF NOT EXISTS idx_leader_req_team ON leader_requirements(team);

-- Comments
COMMENT ON TABLE leader_requirements IS 'Track leader requirements for clubs - sourcing coaches, instructors, etc.';
COMMENT ON COLUMN leader_requirements.name IS 'Requirement name - often pre-filled from club name';
COMMENT ON COLUMN leader_requirements.status IS 'Workflow status: not_picked, deprioritised, in_progress, done';
COMMENT ON COLUMN leader_requirements.growth_team_effort IS 'Whether growth team needs to put effort for this requirement';
COMMENT ON COLUMN leader_requirements.platform_team_effort IS 'Whether platform/tech team needs to put effort for this requirement';
COMMENT ON COLUMN leader_requirements.team IS 'Team assignment (blue/green/yellow) - auto-inherited from activity-city context';

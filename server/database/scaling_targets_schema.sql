-- Scaling Targets Database Schema
-- This schema supports the target setting and club tracking system

-- 1. Activity-level targets table
CREATE TABLE IF NOT EXISTS activity_targets (
  id SERIAL PRIMARY KEY,
  activity_name VARCHAR(100) NOT NULL,
  activity_id INTEGER,

  -- Current metrics (calculated from existing data)
  current_meetups INTEGER DEFAULT 0,
  current_revenue INTEGER DEFAULT 0, -- in paisa

  -- Manual target inputs
  target_meetups_existing INTEGER DEFAULT 0,
  target_meetups_new INTEGER DEFAULT 0,
  target_revenue_existing INTEGER DEFAULT 0, -- in paisa
  target_revenue_new INTEGER DEFAULT 0, -- in paisa

  -- Auto-calculated totals
  total_target_meetups INTEGER GENERATED ALWAYS AS (target_meetups_existing + target_meetups_new) STORED,
  total_target_revenue INTEGER GENERATED ALWAYS AS (target_revenue_existing + target_revenue_new) STORED,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),

  UNIQUE(activity_name)
);

-- 2. Club-level targets table (for existing clubs)
CREATE TABLE IF NOT EXISTS club_targets (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL,
  club_name VARCHAR(200) NOT NULL,
  activity_name VARCHAR(100) NOT NULL,

  -- Current metrics (calculated from existing data)
  current_meetups INTEGER DEFAULT 0,
  current_revenue INTEGER DEFAULT 0, -- in paisa

  -- Editable targets
  target_meetups INTEGER DEFAULT 0,
  target_revenue INTEGER DEFAULT 0, -- in paisa

  -- Club status tracking
  is_new_club BOOLEAN DEFAULT FALSE,
  launch_date TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(club_id),
  FOREIGN KEY (activity_name) REFERENCES activity_targets(activity_name) ON UPDATE CASCADE
);

-- 3. New club launch planning table
CREATE TABLE IF NOT EXISTS new_club_launches (
  id SERIAL PRIMARY KEY,
  activity_name VARCHAR(100) NOT NULL,

  -- Planning details
  planned_clubs_count INTEGER DEFAULT 1,
  target_meetups_per_club INTEGER DEFAULT 0,
  target_revenue_per_club INTEGER DEFAULT 0, -- in paisa

  -- Calculated totals
  total_target_meetups INTEGER GENERATED ALWAYS AS (planned_clubs_count * target_meetups_per_club) STORED,
  total_target_revenue INTEGER GENERATED ALWAYS AS (planned_clubs_count * target_revenue_per_club) STORED,

  -- Launch planning
  planned_launch_date TIMESTAMP,
  city VARCHAR(100),
  area VARCHAR(100),
  poc_assigned VARCHAR(100),

  -- Status tracking
  status VARCHAR(50) DEFAULT 'planned', -- planned, launched, moved_to_existing

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (activity_name) REFERENCES activity_targets(activity_name) ON UPDATE CASCADE
);

-- 4. Club transition tracking (when new clubs become existing clubs)
CREATE TABLE IF NOT EXISTS club_transitions (
  id SERIAL PRIMARY KEY,
  new_club_launch_id INTEGER NOT NULL,
  club_id INTEGER NOT NULL,
  activity_name VARCHAR(100) NOT NULL,
  transition_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Target transfer tracking
  transferred_target_meetups INTEGER DEFAULT 0,
  transferred_target_revenue INTEGER DEFAULT 0,

  FOREIGN KEY (new_club_launch_id) REFERENCES new_club_launches(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_name) REFERENCES activity_targets(activity_name) ON UPDATE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_targets_activity_name ON activity_targets(activity_name);
CREATE INDEX IF NOT EXISTS idx_club_targets_activity_name ON club_targets(activity_name);
CREATE INDEX IF NOT EXISTS idx_club_targets_club_id ON club_targets(club_id);
CREATE INDEX IF NOT EXISTS idx_new_club_launches_activity_name ON new_club_launches(activity_name);
CREATE INDEX IF NOT EXISTS idx_club_transitions_activity_name ON club_transitions(activity_name);

-- Triggers to update activity targets when club targets change
CREATE OR REPLACE FUNCTION update_activity_targets_from_clubs()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the activity targets based on sum of all club targets
  UPDATE activity_targets
  SET
    target_meetups_existing = (
      SELECT COALESCE(SUM(target_meetups), 0)
      FROM club_targets
      WHERE activity_name = COALESCE(NEW.activity_name, OLD.activity_name)
    ),
    target_revenue_existing = (
      SELECT COALESCE(SUM(target_revenue), 0)
      FROM club_targets
      WHERE activity_name = COALESCE(NEW.activity_name, OLD.activity_name)
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE activity_name = COALESCE(NEW.activity_name, OLD.activity_name);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to club_targets table
DROP TRIGGER IF EXISTS trigger_update_activity_targets ON club_targets;
CREATE TRIGGER trigger_update_activity_targets
  AFTER INSERT OR UPDATE OR DELETE ON club_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_activity_targets_from_clubs();

-- Trigger to update activity targets when new club launches change
CREATE OR REPLACE FUNCTION update_activity_targets_from_new_clubs()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the activity targets based on sum of all new club launch targets
  UPDATE activity_targets
  SET
    target_meetups_new = (
      SELECT COALESCE(SUM(total_target_meetups), 0)
      FROM new_club_launches
      WHERE activity_name = COALESCE(NEW.activity_name, OLD.activity_name)
        AND status = 'planned'
    ),
    target_revenue_new = (
      SELECT COALESCE(SUM(total_target_revenue), 0)
      FROM new_club_launches
      WHERE activity_name = COALESCE(NEW.activity_name, OLD.activity_name)
        AND status = 'planned'
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE activity_name = COALESCE(NEW.activity_name, OLD.activity_name);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to new_club_launches table
DROP TRIGGER IF EXISTS trigger_update_activity_targets_new_clubs ON new_club_launches;
CREATE TRIGGER trigger_update_activity_targets_new_clubs
  AFTER INSERT OR UPDATE OR DELETE ON new_club_launches
  FOR EACH ROW
  EXECUTE FUNCTION update_activity_targets_from_new_clubs();
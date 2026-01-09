-- Migration: Create task-requirement junction tables
-- Date: 2026-01-07
-- Description: Many-to-many linking between scaling tasks and requirements

-- Link tasks to leader requirements (many-to-many)
CREATE TABLE IF NOT EXISTS scaling_task_leader_requirements (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES scaling_tasks(id) ON DELETE CASCADE,
  leader_requirement_id INTEGER REFERENCES leader_requirements(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, leader_requirement_id)
);

-- Link tasks to venue requirements (many-to-many)
CREATE TABLE IF NOT EXISTS scaling_task_venue_requirements (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES scaling_tasks(id) ON DELETE CASCADE,
  venue_requirement_id INTEGER REFERENCES venue_requirements(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, venue_requirement_id)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_task_leader_req_task ON scaling_task_leader_requirements(task_id);
CREATE INDEX IF NOT EXISTS idx_task_leader_req_leader ON scaling_task_leader_requirements(leader_requirement_id);
CREATE INDEX IF NOT EXISTS idx_task_venue_req_task ON scaling_task_venue_requirements(task_id);
CREATE INDEX IF NOT EXISTS idx_task_venue_req_venue ON scaling_task_venue_requirements(venue_requirement_id);

-- Comments
COMMENT ON TABLE scaling_task_leader_requirements IS 'Junction table linking scaling tasks to leader requirements';
COMMENT ON TABLE scaling_task_venue_requirements IS 'Junction table linking scaling tasks to venue requirements';

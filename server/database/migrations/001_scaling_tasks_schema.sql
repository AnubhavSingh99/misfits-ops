-- Migration: Create Scaling Tasks Schema
-- Date: 2026-01-06
-- Description: Creates tables for scaling task management with hierarchy context,
--              stage transition tracking, weekly sprints, and comments

-- =====================================================
-- 1. MAIN SCALING TASKS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS scaling_tasks (
  id SERIAL PRIMARY KEY,

  -- Hierarchy context (inherited from where task was created)
  -- task_scope determines the granularity level
  task_scope VARCHAR(20) NOT NULL CHECK (task_scope IN ('activity', 'city', 'area', 'club', 'launch')),

  -- Activity level (from production database)
  activity_id INTEGER,              -- FK to production activity.id (nullable)
  activity_name VARCHAR(100),       -- Cached for display

  -- City level
  city_id INTEGER REFERENCES dim_cities(id) ON DELETE SET NULL,
  city_name VARCHAR(100),           -- Cached for display

  -- Area level
  area_id INTEGER REFERENCES dim_areas(id) ON DELETE SET NULL,
  area_name VARCHAR(100),           -- Cached for display

  -- Club level (from production database)
  club_id INTEGER,                  -- FK to production club.pk (nullable)
  club_name VARCHAR(255),           -- Cached for display

  -- Launch level
  launch_id INTEGER REFERENCES new_club_launches(id) ON DELETE SET NULL,

  -- Target linkage (optional - links task to specific dimensional target)
  target_id INTEGER REFERENCES club_dimensional_targets(id) ON DELETE SET NULL,

  -- Task content
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Stage transition tracking
  -- Tracks which stage transition this task is meant to achieve
  source_stage VARCHAR(20) CHECK (source_stage IS NULL OR source_stage IN ('not_picked', 'started', 'stage_1', 'stage_2', 'stage_3', 'stage_4')),
  target_stage VARCHAR(20) CHECK (target_stage IS NULL OR target_stage IN ('started', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'realised')),
  meetups_count INTEGER DEFAULT 0,  -- How many meetups this task is meant to move

  -- Assignment (from poc_structure)
  assigned_to_poc_id INTEGER,       -- FK to poc_structure.id (nullable - stored in local DB)
  assigned_to_name VARCHAR(100),    -- Cached assignee name for display
  assigned_team_lead VARCHAR(100),  -- Team lead name for coloring (Shashwat=blue, Saurabh=green, CD=yellow)

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'cancelled')),

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_date DATE,                      -- Optional due date for the task
  created_by VARCHAR(100)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_scope ON scaling_tasks(task_scope);
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_status ON scaling_tasks(status);
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_activity ON scaling_tasks(activity_id);
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_city ON scaling_tasks(city_id);
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_area ON scaling_tasks(area_id);
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_club ON scaling_tasks(club_id);
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_launch ON scaling_tasks(launch_id);
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_target ON scaling_tasks(target_id);
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_assignee ON scaling_tasks(assigned_to_poc_id);
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_team_lead ON scaling_tasks(assigned_team_lead);

-- Composite index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_scaling_tasks_hierarchy ON scaling_tasks(activity_id, city_id, area_id, club_id);

-- =====================================================
-- 2. TASK-WEEKS JUNCTION TABLE (for multi-week tasks)
-- =====================================================

CREATE TABLE IF NOT EXISTS scaling_task_weeks (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES scaling_tasks(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,         -- Monday of the week (always use Monday)
  position INTEGER DEFAULT 0,       -- For ordering within the week (drag-and-drop)

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure a task can only appear once per week
  UNIQUE(task_id, week_start)
);

-- Indexes for sprint queries
CREATE INDEX IF NOT EXISTS idx_task_weeks_week ON scaling_task_weeks(week_start);
CREATE INDEX IF NOT EXISTS idx_task_weeks_task ON scaling_task_weeks(task_id);
CREATE INDEX IF NOT EXISTS idx_task_weeks_position ON scaling_task_weeks(week_start, position);

-- =====================================================
-- 3. TASK COMMENTS TABLE (status updates/tracker)
-- =====================================================

CREATE TABLE IF NOT EXISTS scaling_task_comments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES scaling_tasks(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  author_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fetching comments by task
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON scaling_task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created ON scaling_task_comments(task_id, created_at DESC);

-- =====================================================
-- 4. HELPER VIEWS
-- =====================================================

-- View: Tasks with week information joined
CREATE OR REPLACE VIEW v_scaling_tasks_with_weeks AS
SELECT
  st.*,
  stw.week_start,
  stw.position as week_position,
  -- Calculate week label
  TO_CHAR(stw.week_start, 'Mon DD') || ' - ' || TO_CHAR(stw.week_start + INTERVAL '6 days', 'Mon DD, YYYY') as week_label,
  -- Count comments
  (SELECT COUNT(*) FROM scaling_task_comments stc WHERE stc.task_id = st.id) as comments_count
FROM scaling_tasks st
LEFT JOIN scaling_task_weeks stw ON st.id = stw.task_id;

-- View: Task summary by hierarchy node
CREATE OR REPLACE VIEW v_scaling_task_summary AS
SELECT
  task_scope,
  activity_id,
  city_id,
  area_id,
  club_id,
  launch_id,
  COUNT(*) FILTER (WHERE status = 'not_started') as not_started_count,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
  -- Sum of meetups by transition (for in-progress tasks)
  SUM(meetups_count) FILTER (WHERE status = 'in_progress') as in_progress_meetups,
  -- Stage transition summaries (for in-progress)
  COUNT(*) FILTER (WHERE status = 'in_progress' AND source_stage = 'not_picked' AND target_stage = 'started') as np_to_started,
  COUNT(*) FILTER (WHERE status = 'in_progress' AND source_stage = 'started' AND target_stage = 'stage_1') as started_to_s1,
  COUNT(*) FILTER (WHERE status = 'in_progress' AND source_stage = 'stage_1' AND target_stage = 'stage_2') as s1_to_s2,
  COUNT(*) FILTER (WHERE status = 'in_progress' AND source_stage = 'stage_2' AND target_stage = 'stage_3') as s2_to_s3,
  COUNT(*) FILTER (WHERE status = 'in_progress' AND source_stage = 'stage_3' AND target_stage = 'stage_4') as s3_to_s4,
  COUNT(*) FILTER (WHERE status = 'in_progress' AND source_stage = 'stage_4' AND target_stage = 'realised') as s4_to_realised
FROM scaling_tasks
GROUP BY task_scope, activity_id, city_id, area_id, club_id, launch_id;

-- =====================================================
-- 5. TRIGGER FOR UPDATED_AT
-- =====================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_scaling_task_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_scaling_task_updated_at ON scaling_tasks;
CREATE TRIGGER trigger_scaling_task_updated_at
  BEFORE UPDATE ON scaling_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_scaling_task_updated_at();

-- =====================================================
-- 6. UTILITY FUNCTIONS
-- =====================================================

-- Function to get the Monday of a given date's week
CREATE OR REPLACE FUNCTION get_week_monday(input_date DATE)
RETURNS DATE AS $$
BEGIN
  RETURN input_date - EXTRACT(ISODOW FROM input_date)::INTEGER + 1;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get task summary for a specific hierarchy node
CREATE OR REPLACE FUNCTION get_task_summary_for_node(
  p_scope VARCHAR(20),
  p_activity_id INTEGER DEFAULT NULL,
  p_city_id INTEGER DEFAULT NULL,
  p_area_id INTEGER DEFAULT NULL,
  p_club_id INTEGER DEFAULT NULL,
  p_launch_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  not_started_count BIGINT,
  in_progress_count BIGINT,
  completed_count BIGINT,
  cancelled_count BIGINT,
  by_transition JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE st.status = 'not_started'),
    COUNT(*) FILTER (WHERE st.status = 'in_progress'),
    COUNT(*) FILTER (WHERE st.status = 'completed'),
    COUNT(*) FILTER (WHERE st.status = 'cancelled'),
    jsonb_build_object(
      'NP→S', COUNT(*) FILTER (WHERE st.status IN ('not_started', 'in_progress') AND st.source_stage = 'not_picked' AND st.target_stage = 'started'),
      'S→S1', COUNT(*) FILTER (WHERE st.status IN ('not_started', 'in_progress') AND st.source_stage = 'started' AND st.target_stage = 'stage_1'),
      'S1→S2', COUNT(*) FILTER (WHERE st.status IN ('not_started', 'in_progress') AND st.source_stage = 'stage_1' AND st.target_stage = 'stage_2'),
      'S2→S3', COUNT(*) FILTER (WHERE st.status IN ('not_started', 'in_progress') AND st.source_stage = 'stage_2' AND st.target_stage = 'stage_3'),
      'S3→S4', COUNT(*) FILTER (WHERE st.status IN ('not_started', 'in_progress') AND st.source_stage = 'stage_3' AND st.target_stage = 'stage_4'),
      'S4→R', COUNT(*) FILTER (WHERE st.status IN ('not_started', 'in_progress') AND st.source_stage = 'stage_4' AND st.target_stage = 'realised')
    )
  FROM scaling_tasks st
  WHERE
    -- Match based on scope level and above
    CASE
      WHEN p_scope = 'activity' THEN st.activity_id = p_activity_id
      WHEN p_scope = 'city' THEN st.activity_id = p_activity_id AND st.city_id = p_city_id
      WHEN p_scope = 'area' THEN st.activity_id = p_activity_id AND st.city_id = p_city_id AND st.area_id = p_area_id
      WHEN p_scope = 'club' THEN st.club_id = p_club_id
      WHEN p_scope = 'launch' THEN st.launch_id = p_launch_id
      ELSE TRUE
    END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. COMMENTS
-- =====================================================

COMMENT ON TABLE scaling_tasks IS 'Tasks for scaling operations, linked to hierarchy (activity/city/area/club/launch)';
COMMENT ON TABLE scaling_task_weeks IS 'Junction table allowing tasks to appear in multiple weekly sprints';
COMMENT ON TABLE scaling_task_comments IS 'Status updates and comments on tasks with timestamps';
COMMENT ON COLUMN scaling_tasks.task_scope IS 'Granularity level: activity, city, area, club, or launch';
COMMENT ON COLUMN scaling_tasks.source_stage IS 'Starting stage for the transition this task achieves';
COMMENT ON COLUMN scaling_tasks.target_stage IS 'Target stage for the transition this task achieves';
COMMENT ON COLUMN scaling_tasks.meetups_count IS 'Number of meetups this task is meant to move between stages';
COMMENT ON COLUMN scaling_tasks.assigned_team_lead IS 'Team lead name for tile coloring: Shashwat=blue, Saurabh=green, CD=yellow';
COMMENT ON COLUMN scaling_task_weeks.week_start IS 'Monday of the week (always store as Monday)';
COMMENT ON COLUMN scaling_task_weeks.position IS 'Order within the week for drag-and-drop sorting';

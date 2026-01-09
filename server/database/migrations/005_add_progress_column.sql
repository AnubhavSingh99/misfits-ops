-- Migration: Add progress JSONB column for stage tracking
-- Date: 2026-01-05
-- Description: Adds progress tracking with stage distribution counts

-- =====================================================
-- 1. ADD PROGRESS COLUMN TO TARGET TABLES
-- =====================================================

-- Add progress column to club_dimensional_targets
ALTER TABLE club_dimensional_targets
ADD COLUMN IF NOT EXISTS progress JSONB DEFAULT '{
  "not_picked": 0,
  "started": 0,
  "stage_1": 0,
  "stage_2": 0,
  "stage_3": 0,
  "stage_4": 0,
  "realised": 0
}'::jsonb;

-- Add progress column to launch_dimensional_targets
ALTER TABLE launch_dimensional_targets
ADD COLUMN IF NOT EXISTS progress JSONB DEFAULT '{
  "not_picked": 0,
  "started": 0,
  "stage_1": 0,
  "stage_2": 0,
  "stage_3": 0,
  "stage_4": 0,
  "realised": 0
}'::jsonb;

-- =====================================================
-- 2. INDEX FOR PROGRESS QUERIES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_club_dim_progress ON club_dimensional_targets USING gin(progress);
CREATE INDEX IF NOT EXISTS idx_launch_dim_progress ON launch_dimensional_targets USING gin(progress);

-- =====================================================
-- 3. UPDATE VIEWS TO INCLUDE PROGRESS
-- =====================================================

-- Drop existing views to recreate with progress
DROP VIEW IF EXISTS v_club_dimensional_targets CASCADE;
DROP VIEW IF EXISTS v_targets_by_area CASCADE;
DROP VIEW IF EXISTS v_targets_by_city CASCADE;
DROP VIEW IF EXISTS v_targets_by_day_type CASCADE;
DROP VIEW IF EXISTS v_targets_by_format CASCADE;
DROP VIEW IF EXISTS v_targets_by_activity CASCADE;

-- View: Club targets with dimension names resolved + progress
CREATE VIEW v_club_dimensional_targets AS
SELECT
  cdt.id,
  cdt.club_id,
  cdt.club_name,
  cdt.activity_id,
  cdt.area_id,
  cdt.day_type_id,
  cdt.format_id,
  COALESCE(da.area_name, 'All Areas') as area_name,
  COALESCE(dc.city_name, 'All Cities') as city_name,
  COALESCE(dt.day_type, 'All Days') as day_type,
  COALESCE(df.format_name, 'All Formats') as format_name,
  cdt.target_meetups,
  cdt.target_revenue,
  cdt.progress,
  da.city_id,
  cdt.created_at,
  cdt.updated_at
FROM club_dimensional_targets cdt
LEFT JOIN dim_areas da ON cdt.area_id = da.id
LEFT JOIN dim_cities dc ON da.city_id = dc.id
LEFT JOIN dim_day_types dt ON cdt.day_type_id = dt.id
LEFT JOIN dim_formats df ON cdt.format_id = df.id;

-- View: Aggregation by Area with progress rollup
CREATE VIEW v_targets_by_area AS
SELECT
  da.id as area_id,
  da.area_name,
  dc.city_name,
  dc.id as city_id,
  SUM(cdt.target_meetups) as total_target_meetups,
  SUM(cdt.target_revenue) as total_target_revenue,
  COUNT(DISTINCT cdt.club_id) as club_count,
  -- Progress rollup
  SUM(COALESCE((cdt.progress->>'not_picked')::int, 0)) as total_not_picked,
  SUM(COALESCE((cdt.progress->>'started')::int, 0)) as total_started,
  SUM(COALESCE((cdt.progress->>'stage_1')::int, 0)) as total_stage_1,
  SUM(COALESCE((cdt.progress->>'stage_2')::int, 0)) as total_stage_2,
  SUM(COALESCE((cdt.progress->>'stage_3')::int, 0)) as total_stage_3,
  SUM(COALESCE((cdt.progress->>'stage_4')::int, 0)) as total_stage_4,
  SUM(COALESCE((cdt.progress->>'realised')::int, 0)) as total_realised
FROM club_dimensional_targets cdt
JOIN dim_areas da ON cdt.area_id = da.id
JOIN dim_cities dc ON da.city_id = dc.id
GROUP BY da.id, da.area_name, dc.city_name, dc.id;

-- View: Aggregation by City with progress rollup
CREATE VIEW v_targets_by_city AS
SELECT
  dc.id as city_id,
  dc.city_name,
  dc.state,
  SUM(cdt.target_meetups) as total_target_meetups,
  SUM(cdt.target_revenue) as total_target_revenue,
  COUNT(DISTINCT cdt.club_id) as club_count,
  COUNT(DISTINCT da.id) as area_count,
  -- Progress rollup
  SUM(COALESCE((cdt.progress->>'not_picked')::int, 0)) as total_not_picked,
  SUM(COALESCE((cdt.progress->>'started')::int, 0)) as total_started,
  SUM(COALESCE((cdt.progress->>'stage_1')::int, 0)) as total_stage_1,
  SUM(COALESCE((cdt.progress->>'stage_2')::int, 0)) as total_stage_2,
  SUM(COALESCE((cdt.progress->>'stage_3')::int, 0)) as total_stage_3,
  SUM(COALESCE((cdt.progress->>'stage_4')::int, 0)) as total_stage_4,
  SUM(COALESCE((cdt.progress->>'realised')::int, 0)) as total_realised
FROM club_dimensional_targets cdt
JOIN dim_areas da ON cdt.area_id = da.id
JOIN dim_cities dc ON da.city_id = dc.id
GROUP BY dc.id, dc.city_name, dc.state;

-- View: Aggregation by Day Type with progress rollup
CREATE VIEW v_targets_by_day_type AS
SELECT
  dt.id as day_type_id,
  dt.day_type,
  SUM(cdt.target_meetups) as total_target_meetups,
  SUM(cdt.target_revenue) as total_target_revenue,
  COUNT(DISTINCT cdt.club_id) as club_count,
  -- Progress rollup
  SUM(COALESCE((cdt.progress->>'not_picked')::int, 0)) as total_not_picked,
  SUM(COALESCE((cdt.progress->>'started')::int, 0)) as total_started,
  SUM(COALESCE((cdt.progress->>'stage_1')::int, 0)) as total_stage_1,
  SUM(COALESCE((cdt.progress->>'stage_2')::int, 0)) as total_stage_2,
  SUM(COALESCE((cdt.progress->>'stage_3')::int, 0)) as total_stage_3,
  SUM(COALESCE((cdt.progress->>'stage_4')::int, 0)) as total_stage_4,
  SUM(COALESCE((cdt.progress->>'realised')::int, 0)) as total_realised
FROM club_dimensional_targets cdt
JOIN dim_day_types dt ON cdt.day_type_id = dt.id
GROUP BY dt.id, dt.day_type;

-- View: Aggregation by Format with progress rollup
CREATE VIEW v_targets_by_format AS
SELECT
  df.id as format_id,
  df.format_name,
  SUM(cdt.target_meetups) as total_target_meetups,
  SUM(cdt.target_revenue) as total_target_revenue,
  COUNT(DISTINCT cdt.club_id) as club_count,
  -- Progress rollup
  SUM(COALESCE((cdt.progress->>'not_picked')::int, 0)) as total_not_picked,
  SUM(COALESCE((cdt.progress->>'started')::int, 0)) as total_started,
  SUM(COALESCE((cdt.progress->>'stage_1')::int, 0)) as total_stage_1,
  SUM(COALESCE((cdt.progress->>'stage_2')::int, 0)) as total_stage_2,
  SUM(COALESCE((cdt.progress->>'stage_3')::int, 0)) as total_stage_3,
  SUM(COALESCE((cdt.progress->>'stage_4')::int, 0)) as total_stage_4,
  SUM(COALESCE((cdt.progress->>'realised')::int, 0)) as total_realised
FROM club_dimensional_targets cdt
JOIN dim_formats df ON cdt.format_id = df.id
GROUP BY df.id, df.format_name;

-- View: Aggregation by Activity with progress rollup
CREATE VIEW v_targets_by_activity AS
SELECT
  cdt.activity_id,
  SUM(cdt.target_meetups) as total_target_meetups,
  SUM(cdt.target_revenue) as total_target_revenue,
  COUNT(DISTINCT cdt.club_id) as club_count,
  -- Progress rollup
  SUM(COALESCE((cdt.progress->>'not_picked')::int, 0)) as total_not_picked,
  SUM(COALESCE((cdt.progress->>'started')::int, 0)) as total_started,
  SUM(COALESCE((cdt.progress->>'stage_1')::int, 0)) as total_stage_1,
  SUM(COALESCE((cdt.progress->>'stage_2')::int, 0)) as total_stage_2,
  SUM(COALESCE((cdt.progress->>'stage_3')::int, 0)) as total_stage_3,
  SUM(COALESCE((cdt.progress->>'stage_4')::int, 0)) as total_stage_4,
  SUM(COALESCE((cdt.progress->>'realised')::int, 0)) as total_realised
FROM club_dimensional_targets cdt
WHERE cdt.activity_id IS NOT NULL
GROUP BY cdt.activity_id;

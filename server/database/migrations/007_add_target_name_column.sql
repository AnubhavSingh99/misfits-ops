-- Migration: Add name column to dimensional target tables
-- Date: 2026-01-07
-- Description: Allow custom names for targets (e.g., "Premium Meetups", "Weekend Slots")

-- Add name column to club_dimensional_targets
ALTER TABLE club_dimensional_targets ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Add name column to launch_dimensional_targets
ALTER TABLE launch_dimensional_targets ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Add comments
COMMENT ON COLUMN club_dimensional_targets.name IS 'Optional custom name for the target (e.g., "Premium Meetups", "Weekend Slots")';
COMMENT ON COLUMN launch_dimensional_targets.name IS 'Optional custom name for the target';

-- Recreate view with name column
DROP VIEW IF EXISTS v_club_dimensional_targets;

CREATE VIEW v_club_dimensional_targets AS
SELECT
  cdt.id,
  cdt.club_id,
  cdt.club_name,
  cdt.activity_id,
  cdt.area_id,
  cdt.day_type_id,
  cdt.format_id,
  cdt.name,
  COALESCE(da.area_name, 'All Areas') AS area_name,
  COALESCE(dc.city_name, 'All Cities') AS city_name,
  COALESCE(dt.day_type, 'All Days') AS day_type,
  COALESCE(df.format_name, 'All Formats') AS format_name,
  cdt.target_meetups,
  cdt.target_revenue,
  cdt.meetup_cost,
  cdt.meetup_capacity,
  cdt.progress,
  da.city_id,
  cdt.created_at,
  cdt.updated_at
FROM club_dimensional_targets cdt
LEFT JOIN dim_areas da ON cdt.area_id = da.id
LEFT JOIN dim_cities dc ON da.city_id = dc.id
LEFT JOIN dim_day_types dt ON cdt.day_type_id = dt.id
LEFT JOIN dim_formats df ON cdt.format_id = df.id;

-- Dimensional Targets Schema
-- This schema replaces the flat target system with a multi-dimensional target system
-- Supports: Area (→City), Day Type, Format dimensions with rollup capabilities

-- =====================================================
-- 0. CLEANUP: DROP OLD FLAT TARGET TABLES
-- =====================================================

DROP VIEW IF EXISTS v_club_dimensional_targets CASCADE;
DROP VIEW IF EXISTS v_targets_by_area CASCADE;
DROP VIEW IF EXISTS v_targets_by_city CASCADE;
DROP VIEW IF EXISTS v_targets_by_day_type CASCADE;
DROP VIEW IF EXISTS v_targets_by_format CASCADE;

DROP TABLE IF EXISTS club_transitions CASCADE;
DROP TABLE IF EXISTS club_targets CASCADE;
DROP TABLE IF EXISTS activity_targets CASCADE;
DROP TABLE IF EXISTS club_dimensional_targets CASCADE;
DROP TABLE IF EXISTS launch_dimensional_targets CASCADE;
DROP TABLE IF EXISTS dim_areas CASCADE;
DROP TABLE IF EXISTS dim_cities CASCADE;
DROP TABLE IF EXISTS dim_day_types CASCADE;
DROP TABLE IF EXISTS dim_formats CASCADE;

-- Remove flat target columns from new_club_launches if they exist
DO $$
BEGIN
  ALTER TABLE new_club_launches DROP COLUMN IF EXISTS target_meetups;
  ALTER TABLE new_club_launches DROP COLUMN IF EXISTS target_revenue;
  ALTER TABLE new_club_launches DROP COLUMN IF EXISTS target_meetups_per_club;
  ALTER TABLE new_club_launches DROP COLUMN IF EXISTS target_revenue_per_club;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist, ignore
    NULL;
END $$;

-- =====================================================
-- 1. NORMALIZED DIMENSION LOOKUP TABLES
-- =====================================================

-- Cities table (synced from production)
CREATE TABLE dim_cities (
  id SERIAL PRIMARY KEY,
  production_city_id INTEGER,        -- FK to production city.id
  city_name VARCHAR(100) NOT NULL UNIQUE,
  state VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Areas table (synced from production, includes city relationship)
CREATE TABLE dim_areas (
  id SERIAL PRIMARY KEY,
  production_area_id INTEGER,        -- FK to production area.id (nullable for custom)
  area_name VARCHAR(100) NOT NULL,
  city_id INTEGER REFERENCES dim_cities(id),
  is_custom BOOLEAN DEFAULT FALSE,   -- TRUE = user-added, not from production
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(area_name, city_id)
);

-- Day types (predefined + custom)
CREATE TABLE dim_day_types (
  id SERIAL PRIMARY KEY,
  day_type VARCHAR(30) NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  is_custom BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed day types
INSERT INTO dim_day_types (day_type, display_order, is_custom) VALUES
  ('weekday', 1, FALSE),
  ('weekend', 2, FALSE),
  ('monday', 10, FALSE),
  ('tuesday', 11, FALSE),
  ('wednesday', 12, FALSE),
  ('thursday', 13, FALSE),
  ('friday', 14, FALSE),
  ('saturday', 15, FALSE),
  ('sunday', 16, FALSE)
ON CONFLICT (day_type) DO NOTHING;

-- Formats (predefined + custom)
CREATE TABLE dim_formats (
  id SERIAL PRIMARY KEY,
  format_name VARCHAR(50) NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  is_custom BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed formats
INSERT INTO dim_formats (format_name, display_order, is_custom) VALUES
  ('casual', 1, FALSE),
  ('tournament', 2, FALSE),
  ('coaching', 3, FALSE),
  ('league', 4, FALSE)
ON CONFLICT (format_name) DO NOTHING;

-- =====================================================
-- 2. EXISTING CLUB DIMENSIONAL TARGETS
-- =====================================================

CREATE TABLE club_dimensional_targets (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL,          -- FK to production club.pk
  activity_id INTEGER,               -- FK to production activity.id (for rollup)
  club_name VARCHAR(255),            -- Cached for display

  -- Normalized dimension FKs (NULL = applies to ALL)
  area_id INTEGER REFERENCES dim_areas(id),
  day_type_id INTEGER REFERENCES dim_day_types(id),
  format_id INTEGER REFERENCES dim_formats(id),

  -- Targets
  target_meetups INTEGER NOT NULL DEFAULT 0,
  target_revenue INTEGER DEFAULT 0,  -- in paisa

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100)
);

-- Unique index for club + dimension combination (handles NULLs in PG < 15)
CREATE UNIQUE INDEX idx_club_dim_unique ON club_dimensional_targets (
  club_id,
  COALESCE(area_id, -1),
  COALESCE(day_type_id, -1),
  COALESCE(format_id, -1)
);

-- =====================================================
-- 3. NEW CLUB LAUNCH DIMENSIONAL TARGETS
-- =====================================================

CREATE TABLE launch_dimensional_targets (
  id SERIAL PRIMARY KEY,
  launch_id INTEGER NOT NULL,        -- FK to new_club_launches.id
  activity_name VARCHAR(100),        -- For rollup by activity

  -- Normalized dimension FKs (NULL = applies to ALL)
  area_id INTEGER REFERENCES dim_areas(id),
  day_type_id INTEGER REFERENCES dim_day_types(id),
  format_id INTEGER REFERENCES dim_formats(id),

  -- Targets
  target_meetups INTEGER NOT NULL DEFAULT 0,
  target_revenue INTEGER DEFAULT 0,  -- in paisa

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100)
);

-- Unique index for launch + dimension combination (handles NULLs in PG < 15)
CREATE UNIQUE INDEX idx_launch_dim_unique ON launch_dimensional_targets (
  launch_id,
  COALESCE(area_id, -1),
  COALESCE(day_type_id, -1),
  COALESCE(format_id, -1)
);

-- =====================================================
-- 4. INDEXES FOR AGGREGATION QUERIES
-- =====================================================

-- Club targets indexes
CREATE INDEX idx_club_dim_club ON club_dimensional_targets(club_id);
CREATE INDEX idx_club_dim_area ON club_dimensional_targets(area_id);
CREATE INDEX idx_club_dim_day ON club_dimensional_targets(day_type_id);
CREATE INDEX idx_club_dim_format ON club_dimensional_targets(format_id);
CREATE INDEX idx_club_dim_activity ON club_dimensional_targets(activity_id);

-- Launch targets indexes
CREATE INDEX idx_launch_dim_launch ON launch_dimensional_targets(launch_id);
CREATE INDEX idx_launch_dim_area ON launch_dimensional_targets(area_id);
CREATE INDEX idx_launch_dim_activity ON launch_dimensional_targets(activity_name);

-- Area-city index for city rollup
CREATE INDEX idx_dim_area_city ON dim_areas(city_id);

-- =====================================================
-- 5. AGGREGATION VIEWS
-- =====================================================

-- View: Club targets with dimension names resolved
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
  da.city_id,
  cdt.created_at,
  cdt.updated_at
FROM club_dimensional_targets cdt
LEFT JOIN dim_areas da ON cdt.area_id = da.id
LEFT JOIN dim_cities dc ON da.city_id = dc.id
LEFT JOIN dim_day_types dt ON cdt.day_type_id = dt.id
LEFT JOIN dim_formats df ON cdt.format_id = df.id;

-- View: Aggregation by Area (across all clubs)
CREATE VIEW v_targets_by_area AS
SELECT
  da.id as area_id,
  da.area_name,
  dc.city_name,
  dc.id as city_id,
  SUM(cdt.target_meetups) as total_target_meetups,
  SUM(cdt.target_revenue) as total_target_revenue,
  COUNT(DISTINCT cdt.club_id) as club_count
FROM club_dimensional_targets cdt
JOIN dim_areas da ON cdt.area_id = da.id
JOIN dim_cities dc ON da.city_id = dc.id
GROUP BY da.id, da.area_name, dc.city_name, dc.id;

-- View: Aggregation by City (rollup from areas)
CREATE VIEW v_targets_by_city AS
SELECT
  dc.id as city_id,
  dc.city_name,
  dc.state,
  SUM(cdt.target_meetups) as total_target_meetups,
  SUM(cdt.target_revenue) as total_target_revenue,
  COUNT(DISTINCT cdt.club_id) as club_count,
  COUNT(DISTINCT da.id) as area_count
FROM club_dimensional_targets cdt
JOIN dim_areas da ON cdt.area_id = da.id
JOIN dim_cities dc ON da.city_id = dc.id
GROUP BY dc.id, dc.city_name, dc.state;

-- View: Aggregation by Day Type
CREATE VIEW v_targets_by_day_type AS
SELECT
  dt.id as day_type_id,
  dt.day_type,
  SUM(cdt.target_meetups) as total_target_meetups,
  SUM(cdt.target_revenue) as total_target_revenue,
  COUNT(DISTINCT cdt.club_id) as club_count
FROM club_dimensional_targets cdt
JOIN dim_day_types dt ON cdt.day_type_id = dt.id
GROUP BY dt.id, dt.day_type;

-- View: Aggregation by Format
CREATE VIEW v_targets_by_format AS
SELECT
  df.id as format_id,
  df.format_name,
  SUM(cdt.target_meetups) as total_target_meetups,
  SUM(cdt.target_revenue) as total_target_revenue,
  COUNT(DISTINCT cdt.club_id) as club_count
FROM club_dimensional_targets cdt
JOIN dim_formats df ON cdt.format_id = df.id
GROUP BY df.id, df.format_name;

-- View: Aggregation by Activity
CREATE VIEW v_targets_by_activity AS
SELECT
  cdt.activity_id,
  SUM(cdt.target_meetups) as total_target_meetups,
  SUM(cdt.target_revenue) as total_target_revenue,
  COUNT(DISTINCT cdt.club_id) as club_count
FROM club_dimensional_targets cdt
WHERE cdt.activity_id IS NOT NULL
GROUP BY cdt.activity_id;

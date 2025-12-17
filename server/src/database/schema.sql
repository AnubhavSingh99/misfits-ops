-- Misfits Operations Platform Schema v8
-- Meetup-centric model with real-time POC allocation

-- 1. POC Structure Table (Dynamic allocation support)
CREATE TABLE poc_structure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  poc_type VARCHAR(20) NOT NULL, -- 'activity_head' or 'city_head'

  -- For Activity Heads (manages specific activities across all cities)
  activities TEXT[], -- Array like ['Music', 'Dance']

  -- For City Heads (manages all activities in specific cities)
  cities TEXT[], -- Array like ['Mumbai', 'Delhi']

  -- Team Structure
  team_name VARCHAR(50), -- 'Phoenix', 'Rocket', 'Support'
  team_role VARCHAR(50), -- 'Leader', 'Member', 'Coordinator'

  -- Performance Tracking
  revenue_target DECIMAL(10,2) DEFAULT 0,
  revenue_actual DECIMAL(10,2) DEFAULT 0,
  health_score INTEGER DEFAULT 0,
  club_count INTEGER DEFAULT 0,
  meetup_count INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Meetups Table (Primary revenue unit)
CREATE TABLE meetups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_series_id VARCHAR(50) UNIQUE NOT NULL, -- Like "MUM-MUS-001"
  club_id UUID REFERENCES club(pk), -- Links to existing club table

  -- Basic Information
  activity VARCHAR(50) NOT NULL, -- 'Music', 'Running', 'Photography'
  city VARCHAR(50) NOT NULL,
  area VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL, -- "Mumbai Music Jam #1"

  -- Revenue Configuration (PRIMARY FOCUS)
  price_per_meetup DECIMAL(10,2) NOT NULL,
  capacity INTEGER NOT NULL,
  frequency VARCHAR(20) NOT NULL, -- 'weekly', 'biweekly', 'monthly'
  meetups_per_month INTEGER NOT NULL,

  -- Expected vs Actual
  expected_revenue DECIMAL(10,2) GENERATED ALWAYS AS (price_per_meetup * meetups_per_month) STORED,
  actual_revenue DECIMAL(10,2) DEFAULT 0,

  -- Stage Tracking
  current_stage VARCHAR(20) DEFAULT 'not_picked', -- 'not_picked', 'stage_1', 'stage_2', 'stage_3', 'realised'

  -- Health Metrics (Real-time calculated)
  health_status VARCHAR(10) DEFAULT 'NEW', -- 'GREEN', 'YELLOW', 'RED', 'NEW'
  capacity_utilization DECIMAL(5,2) DEFAULT 0, -- % of capacity filled
  repeat_rate DECIMAL(5,2) DEFAULT 0, -- % of returning users
  average_rating DECIMAL(3,2) DEFAULT 0, -- Average user rating
  revenue_achievement DECIMAL(5,2) DEFAULT 0, -- % of revenue target achieved

  -- Dynamic POC Assignment
  activity_head_id UUID REFERENCES poc_structure(id), -- Can change dynamically
  city_head_id UUID REFERENCES poc_structure(id), -- Can change dynamically
  primary_owner_id UUID REFERENCES poc_structure(id), -- Current main owner

  -- Tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  health_last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. POC Assignment History (Track ownership changes)
CREATE TABLE poc_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id UUID REFERENCES meetups(id),
  poc_id UUID REFERENCES poc_structure(id),
  assignment_type VARCHAR(20) NOT NULL, -- 'activity_head', 'city_head', 'primary_owner'

  -- Assignment Period
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by VARCHAR(100) NOT NULL, -- Who made the assignment
  unassigned_at TIMESTAMP NULL,

  -- Reason for Change
  reason TEXT,
  notes TEXT
);

-- 4. Real-time Health Tracking
CREATE TABLE health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id UUID REFERENCES meetups(id),

  -- Snapshot timestamp
  measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 4 Core Metrics
  capacity_utilization DECIMAL(5,2),
  repeat_rate DECIMAL(5,2),
  average_rating DECIMAL(3,2),
  revenue_achievement DECIMAL(5,2),

  -- Calculated Health
  health_status VARCHAR(10),

  -- Issues Detected
  issues_detected TEXT[],
  recommendations TEXT[]
);

-- 5. Week-over-Week Tracking with Comments
CREATE TABLE wow_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id UUID REFERENCES meetups(id),
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,

  -- Stage Progression
  previous_stage VARCHAR(20),
  current_stage VARCHAR(20),
  stage_changed BOOLEAN DEFAULT false,

  -- Revenue Tracking
  revenue_last_week DECIMAL(10,2) DEFAULT 0,
  revenue_this_week DECIMAL(10,2) DEFAULT 0,
  revenue_change DECIMAL(10,2) GENERATED ALWAYS AS (revenue_this_week - revenue_last_week) STORED,

  -- Human Context (KEY FEATURE)
  comment TEXT, -- "Venue negotiations ongoing", "Leader fell sick, finding backup"
  action_taken TEXT, -- What was done this week
  blocker TEXT, -- What's blocking progress
  next_week_plan TEXT, -- What's planned for next week

  -- Metadata
  updated_by VARCHAR(100) NOT NULL, -- POC who updated
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Real-time Notifications
CREATE TABLE real_time_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  poc_id UUID REFERENCES poc_structure(id),
  notification_type VARCHAR(50) NOT NULL, -- 'health_alert', 'stage_change', 'revenue_risk'
  priority VARCHAR(10) NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'

  -- Content
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  action_required BOOLEAN DEFAULT false,
  action_url VARCHAR(500),

  -- Related Entity
  related_meetup_id UUID REFERENCES meetups(id),
  related_club_id UUID,

  -- Status
  is_read BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP,
  resolved_at TIMESTAMP
);

-- 7. Team Performance & Gamification
CREATE TABLE team_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name VARCHAR(50) NOT NULL,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,

  -- Metrics
  revenue_total DECIMAL(10,2) DEFAULT 0,
  meetups_launched INTEGER DEFAULT 0,
  clubs_healthy INTEGER DEFAULT 0,
  stages_advanced INTEGER DEFAULT 0,

  -- Gamification Points
  points_earned INTEGER DEFAULT 0,
  achievements TEXT[],

  -- Calculated at end of week
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES for Performance
CREATE INDEX idx_meetups_activity ON meetups(activity);
CREATE INDEX idx_meetups_city ON meetups(city);
CREATE INDEX idx_meetups_health ON meetups(health_status);
CREATE INDEX idx_meetups_poc_activity ON meetups(activity_head_id);
CREATE INDEX idx_meetups_poc_city ON meetups(city_head_id);
CREATE INDEX idx_poc_structure_activities ON poc_structure USING GIN(activities);
CREATE INDEX idx_poc_structure_cities ON poc_structure USING GIN(cities);
CREATE INDEX idx_health_metrics_meetup_time ON health_metrics(meetup_id, measured_at);

-- TRIGGERS for Real-time Updates
CREATE OR REPLACE FUNCTION update_meetup_health()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate health status when metrics change
  NEW.health_last_calculated = CURRENT_TIMESTAMP;

  -- Simple health calculation
  IF (NEW.capacity_utilization >= 0.75 AND
      NEW.repeat_rate >= 0.60 AND
      NEW.average_rating >= 4.7 AND
      NEW.revenue_achievement >= 1.0) THEN
    NEW.health_status = 'GREEN';
  ELSIF (NEW.capacity_utilization < 0.60 OR
         NEW.repeat_rate < 0.40 OR
         NEW.average_rating < 4.5 OR
         NEW.revenue_achievement < 0.8) THEN
    NEW.health_status = 'RED';
  ELSE
    NEW.health_status = 'YELLOW';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_meetup_health
  BEFORE UPDATE ON meetups
  FOR EACH ROW
  EXECUTE FUNCTION update_meetup_health();

-- FUNCTION for POC Filtering (Your Music Example)
CREATE OR REPLACE FUNCTION get_meetups_for_poc(poc_name VARCHAR, poc_activity VARCHAR DEFAULT NULL)
RETURNS TABLE (
  meetup_id UUID,
  meetup_name VARCHAR,
  activity VARCHAR,
  city VARCHAR,
  revenue DECIMAL,
  health VARCHAR,
  stage VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.name,
    m.activity,
    m.city,
    m.actual_revenue,
    m.health_status,
    m.current_stage
  FROM meetups m
  JOIN poc_structure p_activity ON m.activity_head_id = p_activity.id
  LEFT JOIN poc_structure p_city ON m.city_head_id = p_city.id
  WHERE
    (p_activity.name = poc_name AND (poc_activity IS NULL OR m.activity = poc_activity))
    OR
    (p_city.name = poc_name AND (poc_activity IS NULL OR m.activity = poc_activity))
  ORDER BY m.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Insert Sample Data for Your Music Example
INSERT INTO poc_structure (name, poc_type, activities, team_name, team_role) VALUES
('Saurabh', 'activity_head', ARRAY['Music'], 'Phoenix', 'Leader'),
('Rahul', 'activity_head', ARRAY['Running', 'Cycling'], 'Phoenix', 'Member'),
('Priya', 'activity_head', ARRAY['Photography'], 'Rocket', 'Member'),
('Priya', 'city_head', ARRAY[], ARRAY['Mumbai'], 'Rocket', 'Member'); -- Dual role

-- Sample Music Meetups for Saurabh
INSERT INTO meetups (meetup_series_id, activity, city, area, name, price_per_meetup, capacity, frequency, meetups_per_month, activity_head_id)
SELECT
  'MUM-MUS-001',
  'Music',
  'Mumbai',
  'Bandra',
  'Mumbai Music Jam #1',
  1500,
  25,
  'weekly',
  4,
  (SELECT id FROM poc_structure WHERE name = 'Saurabh' AND poc_type = 'activity_head');
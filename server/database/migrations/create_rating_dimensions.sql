-- Migration: Create rating_dimensions table for configurable screening/interview factors
-- Date: 2026-02-28

CREATE TABLE IF NOT EXISTS rating_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT DEFAULT '',
  step TEXT NOT NULL CHECK (step IN ('screening', 'interview')),
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_dims_key_step ON rating_dimensions(key, step) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_rating_dims_step_active ON rating_dimensions(step, active);

-- Seed existing 5 dimensions for screening
INSERT INTO rating_dimensions (key, label, description, step, sort_order) VALUES
  ('intention', 'Intention', 'Why do they want to do this?', 'screening', 1),
  ('passion', 'Passion', 'How passionate about the activity?', 'screening', 2),
  ('time_availability', 'Time Availability', 'Can commit to regular meetups?', 'screening', 3),
  ('competency', 'Competency', 'Skills/experience with activity?', 'screening', 4),
  ('objective', 'Objective', 'Goal for running community?', 'screening', 5);

-- Seed same 5 dimensions for interview
INSERT INTO rating_dimensions (key, label, description, step, sort_order) VALUES
  ('intention', 'Intention', 'Why do they want to do this?', 'interview', 1),
  ('passion', 'Passion', 'How passionate about the activity?', 'interview', 2),
  ('time_availability', 'Time Availability', 'Can commit to regular meetups?', 'interview', 3),
  ('competency', 'Competency', 'Skills/experience with activity?', 'interview', 4),
  ('objective', 'Objective', 'Goal for running community?', 'interview', 5);

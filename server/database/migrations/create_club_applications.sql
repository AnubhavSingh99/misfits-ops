-- Migration: Create club_applications table for Start Your Club pipeline
-- Date: 2026-02-27

CREATE TABLE IF NOT EXISTS club_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT,
  user_phone TEXT,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'LANDED',
  exit_type TEXT,
  source TEXT DEFAULT 'web',
  city TEXT,
  activity TEXT,
  awareness TEXT,
  archived BOOLEAN DEFAULT false,

  questionnaire_data JSONB DEFAULT '{}',
  screening_ratings JSONB,
  rejection_reason TEXT,

  split_template_id UUID,
  split_percentage JSONB,
  first_call_done BOOLEAN DEFAULT false,
  venue_sorted BOOLEAN DEFAULT false,
  marketing_launched BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  selected_at TIMESTAMPTZ,
  club_created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_club_apps_status ON club_applications(status);
CREATE INDEX IF NOT EXISTS idx_club_apps_city ON club_applications(city);
CREATE INDEX IF NOT EXISTS idx_club_apps_activity ON club_applications(activity);
CREATE UNIQUE INDEX IF NOT EXISTS idx_club_apps_active_user ON club_applications(user_id) WHERE archived = false AND user_id IS NOT NULL;

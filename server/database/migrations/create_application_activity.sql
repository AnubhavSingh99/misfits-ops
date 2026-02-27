-- Migration: Create application_activity table for notes, calls, connect requests
-- Date: 2026-02-27

CREATE TABLE IF NOT EXISTS application_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES club_applications(id),
  type TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_app ON application_activity(application_id);

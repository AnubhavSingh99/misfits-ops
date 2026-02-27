-- Migration: Create application_status_events table for audit trail
-- Date: 2026-02-27

CREATE TABLE IF NOT EXISTS application_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES club_applications(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_id BIGINT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_events_app ON application_status_events(application_id);

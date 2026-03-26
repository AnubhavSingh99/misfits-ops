-- Create user safety reports table for tracking user-reported safety issues
-- This table mirrors data from misfits.user_reports but adds status tracking for CS team

CREATE TABLE IF NOT EXISTS user_safety_reports (
  id SERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL UNIQUE, -- References user_reports.id from misfits DB
  reporter_user_id BIGINT NOT NULL,
  reporter_name VARCHAR(255),
  reporter_contact VARCHAR(20),
  reported_user_id BIGINT NOT NULL,
  reported_name VARCHAR(255),
  reported_contact VARCHAR(20),
  reason VARCHAR(50) NOT NULL,
  description TEXT,
  image_urls TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'in_progress', 'resolved')),
  assigned_to VARCHAR(100),
  resolution_notes TEXT,
  reported_user_blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_status ON user_safety_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_reporter ON user_safety_reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_reported ON user_safety_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_created ON user_safety_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_report_id ON user_safety_reports(report_id);

-- Add comments for documentation
COMMENT ON TABLE user_safety_reports IS 'Tracks user safety reports with status management for customer service team';
COMMENT ON COLUMN user_safety_reports.report_id IS 'Foreign key to user_reports.id in misfits database';
COMMENT ON COLUMN user_safety_reports.status IS 'Report status: created (new), in_progress (being investigated), resolved (completed)';
COMMENT ON COLUMN user_safety_reports.reported_user_blocked IS 'Whether the reported user has been blocked on the platform';

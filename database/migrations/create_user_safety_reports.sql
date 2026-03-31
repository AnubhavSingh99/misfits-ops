-- Create user_safety_reports table
CREATE TABLE IF NOT EXISTS user_safety_reports (
  id SERIAL PRIMARY KEY,
  report_id INTEGER UNIQUE NOT NULL,
  reporter_user_id INTEGER NOT NULL,
  reporter_name VARCHAR(255),
  reporter_contact VARCHAR(20),
  reported_user_id INTEGER NOT NULL,
  reported_name VARCHAR(255),
  reported_contact VARCHAR(20),
  reason VARCHAR(100) NOT NULL,
  description TEXT,
  image_urls TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'in_progress', 'resolved')),
  assigned_to VARCHAR(255),
  resolution_notes TEXT,
  reported_user_blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for user_safety_reports
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_status ON user_safety_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_reported_user ON user_safety_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_reporter ON user_safety_reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_created_at ON user_safety_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_blocked ON user_safety_reports(reported_user_blocked);

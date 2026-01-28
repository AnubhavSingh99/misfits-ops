-- Migration: Add Slack columns to cs_queries
-- Date: 2026-01-28
-- Description: Track Slack messages for CS tickets

-- Add Slack tracking columns
ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS slack_channel VARCHAR(50);
ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS slack_channel_name VARCHAR(100);
ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS slack_message_ts VARCHAR(50);
ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS slack_sent_at TIMESTAMP;
ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS sla_breach_notified BOOLEAN DEFAULT FALSE;
ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS sla_breach_notified_at TIMESTAMP;

-- Index for finding tickets sent to Slack
CREATE INDEX IF NOT EXISTS idx_cs_queries_slack_channel ON cs_queries(slack_channel) WHERE slack_channel IS NOT NULL;

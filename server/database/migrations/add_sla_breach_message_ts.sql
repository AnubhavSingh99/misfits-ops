-- Migration: Add SLA breach message timestamp for thread replies
-- Date: 2026-01-28
-- Description: Track the Slack message timestamp for SLA breach notifications
--              to enable thread replies for escalating notifications

ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS sla_breach_message_ts VARCHAR(50);

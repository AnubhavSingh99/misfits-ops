-- Migration: Update CS query statuses
-- Date: 2026-01-28
-- Description: Change status workflow to: created, in_progress, ticket_communicated, resolved, resolution_communicated

-- First update existing data to new status names
UPDATE cs_queries SET status = 'created' WHERE status = 'open';
UPDATE cs_queries SET status = 'resolution_communicated' WHERE status = 'closed';

-- Drop old constraint and add new one
ALTER TABLE cs_queries DROP CONSTRAINT IF EXISTS cs_queries_status_check;
ALTER TABLE cs_queries ADD CONSTRAINT cs_queries_status_check
  CHECK (status IN ('created', 'in_progress', 'ticket_communicated', 'resolved', 'resolution_communicated'));

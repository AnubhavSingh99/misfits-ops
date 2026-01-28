-- Migration: Add no_contact flag to track entries without phone numbers
-- Date: 2026-01-28
-- Description: Track tickets where user didn't provide contact info

-- Add column to track no-contact entries
ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS has_contact_info BOOLEAN DEFAULT TRUE;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_cs_queries_has_contact_info ON cs_queries(has_contact_info);

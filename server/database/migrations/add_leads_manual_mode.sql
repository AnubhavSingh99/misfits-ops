-- Migration: Add manual_mode to leads
-- Date: 2026-02-19
-- Description: Toggle to disable automation per lead

ALTER TABLE leads ADD COLUMN IF NOT EXISTS manual_mode BOOLEAN DEFAULT false;

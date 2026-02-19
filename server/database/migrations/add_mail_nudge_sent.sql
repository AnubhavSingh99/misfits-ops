-- Migration: Add mail_nudge_sent column to leads
-- Date: 2026-02-20
-- Description: Track whether we already nudged a lead for a call when they asked for mail

ALTER TABLE leads ADD COLUMN IF NOT EXISTS mail_nudge_sent BOOLEAN DEFAULT FALSE;

-- Migration: Add venue_categories column to venue_requirements
-- Date: 2026-02-16
-- Description: Add missing venue_categories text array column

ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS venue_categories text[];

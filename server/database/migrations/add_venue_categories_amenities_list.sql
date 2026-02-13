-- Migration: Add venue_categories and amenities_list columns to venue_requirements
-- Date: 2026-02-13
-- Description: Adds structured venue category and amenities list fields for VMS integration

ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS venue_categories TEXT[];
ALTER TABLE venue_requirements ADD COLUMN IF NOT EXISTS amenities_list TEXT[];

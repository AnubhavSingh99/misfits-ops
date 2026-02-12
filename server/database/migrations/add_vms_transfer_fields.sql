-- Migration: Add VMS transfer tracking fields to venue_repository
-- Date: 2026-02-13
-- Description: Track whether a venue has been transferred to VMS (production location table)

ALTER TABLE venue_repository ADD COLUMN IF NOT EXISTS transferred_to_vms BOOLEAN DEFAULT false;
ALTER TABLE venue_repository ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMP;
ALTER TABLE venue_repository ADD COLUMN IF NOT EXISTS venue_manager_phone TEXT;

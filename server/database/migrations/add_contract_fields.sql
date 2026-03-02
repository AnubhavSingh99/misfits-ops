-- Migration: Add contract upload fields to club_applications
-- Date: 2026-02-27
-- Description: Track uploaded contract and signed contract with timestamps

ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS contract_url TEXT;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS contract_uploaded_at TIMESTAMPTZ;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS signed_contract_url TEXT;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS signed_contract_uploaded_at TIMESTAMPTZ;

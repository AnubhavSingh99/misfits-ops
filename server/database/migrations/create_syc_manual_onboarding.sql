-- Migration: Track manually completed SYC onboarding in local ops DB
-- Date: 2026-05-11

CREATE TABLE IF NOT EXISTS syc_manual_onboarding (
  application_id BIGINT PRIMARY KEY,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syc_manual_onboarding_completed_at
  ON syc_manual_onboarding (completed_at DESC);

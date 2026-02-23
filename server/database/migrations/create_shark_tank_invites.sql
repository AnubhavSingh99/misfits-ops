-- Migration: Create shark_tank_invites table
-- Date: 2026-02-23
-- Description: Track WhatsApp invite status for Shark Tank watch party

CREATE TABLE IF NOT EXISTS shark_tank_invites (
  id SERIAL PRIMARY KEY,
  club_name VARCHAR(255) NOT NULL,
  activity_name VARCHAR(100),
  team VARCHAR(20),
  leader_name VARCHAR(255) NOT NULL,
  leader_phone VARCHAR(20),
  poc VARCHAR(50),
  status VARCHAR(20) DEFAULT 'not_done',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shark_invites_status ON shark_tank_invites(status);
CREATE INDEX IF NOT EXISTS idx_shark_invites_poc ON shark_tank_invites(poc);

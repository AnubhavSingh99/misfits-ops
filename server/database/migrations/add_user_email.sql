-- Migration: Add user_email column to cs_queries
-- Date: 2026-01-28
-- Description: Store user email from sheet data

ALTER TABLE cs_queries ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

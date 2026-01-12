-- Migration: Drop unique constraint on club_dimensional_targets
-- Date: 2026-01-12
-- Description: Allow multiple targets with same dimensions for a club

-- Drop the unique index that prevents duplicate dimension combinations
DROP INDEX IF EXISTS idx_club_dim_unique;

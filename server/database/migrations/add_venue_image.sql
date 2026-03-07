-- Migration: Add image support to venue_repository
-- Date: 2026-03-08
-- Description: Add image_file_id and image_s3_url columns for venue images

ALTER TABLE venue_repository ADD COLUMN IF NOT EXISTS image_file_id BIGINT;
ALTER TABLE venue_repository ADD COLUMN IF NOT EXISTS image_s3_url TEXT;

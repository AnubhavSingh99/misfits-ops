-- Migration: Add comments table for leader and venue requirements
-- Date: 2026-01-19
-- Description: Unified comments table for both leader and venue requirements

-- Create requirement_comments table
CREATE TABLE IF NOT EXISTS requirement_comments (
  id SERIAL PRIMARY KEY,
  requirement_id INTEGER NOT NULL,
  requirement_type VARCHAR(10) NOT NULL CHECK (requirement_type IN ('leader', 'venue')),
  comment_text TEXT NOT NULL,
  author_name VARCHAR(100) DEFAULT 'Anonymous',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient querying by requirement type and id
CREATE INDEX IF NOT EXISTS idx_req_comments_lookup ON requirement_comments(requirement_type, requirement_id);

-- Index for fetching comments in chronological order
CREATE INDEX IF NOT EXISTS idx_req_comments_created ON requirement_comments(requirement_type, requirement_id, created_at DESC);

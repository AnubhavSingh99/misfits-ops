-- Migration: Create Customer Service Dashboard Tables
-- Date: 2026-01-28
-- Description: Tables for managing customer service queries from users, leaders, and venues

-- 1. Query Types Lookup Table (per stakeholder type, with optional subcategory)
CREATE TABLE IF NOT EXISTS cs_query_types (
    id SERIAL PRIMARY KEY,
    stakeholder_type VARCHAR(20) NOT NULL CHECK (stakeholder_type IN ('user', 'leader', 'venue')),
    name VARCHAR(100) NOT NULL,
    parent_id INTEGER REFERENCES cs_query_types(id),  -- NULL = main type, NOT NULL = subcategory
    default_sla_hours INTEGER NOT NULL DEFAULT 24,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(stakeholder_type, name, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_cs_query_types_parent ON cs_query_types(parent_id);

-- 2. Main Queries Table
CREATE TABLE IF NOT EXISTS cs_queries (
    id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(20) NOT NULL UNIQUE,
    stakeholder_type VARCHAR(20) NOT NULL CHECK (stakeholder_type IN ('user', 'leader', 'venue')),
    query_type_id INTEGER NOT NULL REFERENCES cs_query_types(id),
    source VARCHAR(20) NOT NULL CHECK (source IN ('app', 'website', 'playstore', 'appstore', 'whatsapp')),

    -- Reference to Misfits DB (stored as ID, lookup done at runtime)
    user_id INTEGER,
    user_name VARCHAR(100),
    user_contact VARCHAR(100),

    -- Query details
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'pending', 'resolved', 'closed')),
    assigned_to VARCHAR(100),
    sla_hours INTEGER NOT NULL DEFAULT 24,

    -- JSONB fields for flexibility
    attachments JSONB DEFAULT '[]'::jsonb,
    comments JSONB DEFAULT '[]'::jsonb,

    -- Resolution
    resolution_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    first_response_at TIMESTAMP,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cs_queries_status ON cs_queries(status);
CREATE INDEX IF NOT EXISTS idx_cs_queries_stakeholder ON cs_queries(stakeholder_type);
CREATE INDEX IF NOT EXISTS idx_cs_queries_assigned ON cs_queries(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cs_queries_created ON cs_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_queries_priority ON cs_queries(priority);

-- Query types will be added via UI or separate seed script
-- INSERT INTO cs_query_types (stakeholder_type, name, default_sla_hours) VALUES
--     ('user', 'Example Type', 24);
-- ON CONFLICT (stakeholder_type, name) DO NOTHING;

-- Function to auto-generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
    year_part TEXT;
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(ticket_number FROM 9) AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM cs_queries
    WHERE ticket_number LIKE 'CS-' || year_part || '-%';

    NEW.ticket_number := 'CS-' || year_part || '-' || LPAD(seq_num::TEXT, 5, '0');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate ticket number on insert
DROP TRIGGER IF EXISTS trg_generate_ticket_number ON cs_queries;
CREATE TRIGGER trg_generate_ticket_number
    BEFORE INSERT ON cs_queries
    FOR EACH ROW
    WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
    EXECUTE FUNCTION generate_ticket_number();

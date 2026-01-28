-- Migration: Fix ticket number generation to use sequence (prevents collision)
-- Date: 2026-01-28
-- Description: Replace MAX-based ticket number with sequence to prevent race conditions

-- Create sequence for ticket numbers
CREATE SEQUENCE IF NOT EXISTS cs_ticket_seq START WITH 1;

-- Set sequence to current max
DO $$
DECLARE
    max_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 9) AS INTEGER)), 0)
    INTO max_num
    FROM cs_queries
    WHERE ticket_number LIKE 'CS-2026-%';

    IF max_num > 0 THEN
        PERFORM setval('cs_ticket_seq', max_num);
    END IF;
END $$;

-- Replace the trigger function
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
    year_part TEXT;
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    seq_num := nextval('cs_ticket_seq');
    NEW.ticket_number := 'CS-' || year_part || '-' || LPAD(seq_num::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Migration: Restructure club application statuses (14 → 12, 3-layer model)
-- Date: 2026-02-28
-- Description:
--   Layer 1 (Journey): ACTIVE, ABANDONED, NOT_INTERESTED
--   Layer 2 (Evaluation): SUBMITTED, UNDER_REVIEW, ON_HOLD, INTERVIEW_PENDING, INTERVIEW_SCHEDULED, INTERVIEW_DONE
--   Layer 3 (Outcome): SELECTED, CLUB_CREATED, REJECTED
--
--   Removes: LANDED, STORY_VIEWED, FORM_IN_PROGRESS (→ ACTIVE), FORM_ABANDONED (→ ABANDONED), FORM_SUBMITTED (→ SUBMITTED)
--   Adds: last_screen, last_story_slide, last_question_index, last_question_section, total_questions, abandoned_at

-- 1. Add new tracking metadata columns
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS last_screen TEXT;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS last_story_slide INTEGER;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS last_question_index INTEGER;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS last_question_section TEXT;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS total_questions INTEGER;
ALTER TABLE club_applications ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ;

-- 2. Migrate status values (order matters: specific first)
UPDATE club_applications SET status = 'ABANDONED' WHERE status = 'FORM_ABANDONED';
UPDATE club_applications SET status = 'SUBMITTED' WHERE status = 'FORM_SUBMITTED';
UPDATE club_applications SET status = 'ACTIVE' WHERE status IN ('LANDED', 'STORY_VIEWED', 'FORM_IN_PROGRESS');

-- 3. Migrate rejected_from_status references
UPDATE club_applications SET rejected_from_status = 'SUBMITTED' WHERE rejected_from_status = 'FORM_SUBMITTED';
UPDATE club_applications SET rejected_from_status = 'ACTIVE' WHERE rejected_from_status IN ('LANDED', 'STORY_VIEWED', 'FORM_IN_PROGRESS');
UPDATE club_applications SET rejected_from_status = 'ABANDONED' WHERE rejected_from_status = 'FORM_ABANDONED';

-- 4. Update default status for new rows
ALTER TABLE club_applications ALTER COLUMN status SET DEFAULT 'ACTIVE';

-- 5. Rebuild status index
DROP INDEX IF EXISTS idx_club_apps_status;
CREATE INDEX idx_club_apps_status ON club_applications(status);

-- 6. Add index for Follow Up tab queries (ABANDONED by last_screen)
CREATE INDEX IF NOT EXISTS idx_club_apps_abandoned_screen ON club_applications(last_screen) WHERE status = 'ABANDONED';

-- NOTE: application_status_events audit trail is NOT modified — preserves historical from_status/to_status values

-- Create a local tracking table for venue booking requests
-- Stores meeting_status that can be updated by ops team

CREATE TABLE IF NOT EXISTS venue_booking_request_tracking (
  id SERIAL PRIMARY KEY,
  venue_booking_request_id BIGINT NOT NULL UNIQUE,
  meeting_status TEXT NOT NULL DEFAULT 'not_picked' CHECK (meeting_status IN ('not_picked', 'scheduled', 'done', 'rescheduled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_vbr_tracking_request_id ON venue_booking_request_tracking(venue_booking_request_id);
CREATE INDEX IF NOT EXISTS idx_vbr_tracking_meeting_status ON venue_booking_request_tracking(meeting_status);

-- Add comments
COMMENT ON TABLE venue_booking_request_tracking IS 'Tracks meeting status for venue booking requests from production DB';
COMMENT ON COLUMN venue_booking_request_tracking.venue_booking_request_id IS 'References venue_booking_request.id from production database';
COMMENT ON COLUMN venue_booking_request_tracking.meeting_status IS 'Meeting status: not_picked, scheduled, done, rescheduled';

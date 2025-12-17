-- WoW Comments Table for Misfits Operations Platform
-- This table stores weekly comments, blockers, and actions for each club

CREATE TABLE IF NOT EXISTS wow_comments (
    id SERIAL PRIMARY KEY,
    club_name VARCHAR(255) NOT NULL,
    week_label VARCHAR(50) NOT NULL,
    comment TEXT,
    blocker TEXT,
    action_taken TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure one record per club per week
    UNIQUE(club_name, week_label)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_wow_comments_club_name ON wow_comments(club_name);
CREATE INDEX IF NOT EXISTS idx_wow_comments_week_label ON wow_comments(week_label);
CREATE INDEX IF NOT EXISTS idx_wow_comments_created_at ON wow_comments(created_at);

-- Insert sample data to match Week 1, Week 2, Week 3, Week 4 format
INSERT INTO wow_comments (club_name, week_label, comment, blocker, action_taken) VALUES
-- Week 1 (Current Week)
('Mumbai Run #1', 'Week 1', 'Strong momentum, premium positioning working', '', 'Promoted to WhatsApp groups'),
('Mumbai Run #2', 'Week 1', 'Recovery phase after venue issues', 'New venue higher cost', 'Negotiated rate, approved budget increase'),
('Mumbai Run #3', 'Week 1', 'Excellent capacity utilization and member satisfaction', '', 'Expanded to 2x per week'),
('Mumbai Tennis', 'Week 1', 'Consistent performance, good member retention', '', 'Added advanced level sessions'),

-- Week 2 (1 Week Ago)
('Mumbai Run #1', 'Week 2', 'Maintained growth trajectory, member feedback positive', '', 'Increased marketing spend'),
('Mumbai Run #2', 'Week 2', 'Venue transition period, temporary capacity reduction', 'Venue lease expired', 'Found alternative location'),
('Mumbai Run #3', 'Week 2', 'Strong week-over-week growth continuing', '', 'Added beginner sessions'),
('Mumbai Tennis', 'Week 2', 'Weather challenges but good attendance', 'Monsoon affecting outdoor courts', 'Booked indoor backup venue'),

-- Week 3 (2 Weeks Ago)
('Mumbai Run #1', 'Week 3', 'Scaling strategy showing results, community building strong', '', 'Launched member referral program'),
('Mumbai Run #2', 'Week 3', 'Gradual improvement in member engagement', '', 'Introduced themed runs'),
('Mumbai Run #3', 'Week 3', 'Excellent member retention and word-of-mouth growth', '', 'Increased frequency to weekly'),
('Mumbai Tennis', 'Week 3', 'Good progress in skill development programs', '', 'Added coaching sessions'),

-- Week 4 (3 Weeks Ago)
('Mumbai Run #1', 'Week 4', 'Launch phase successful, scaling strategy in place', '', 'Initial member onboarding completed'),
('Mumbai Run #2', 'Week 4', 'Initial setup challenges but good member response', 'Route permits pending', 'Obtained necessary permissions'),
('Mumbai Run #3', 'Week 4', 'Strong initial momentum, community forming well', '', 'Set up WhatsApp group'),
('Mumbai Tennis', 'Week 4', 'Early stage development, good interest shown', '', 'Secured court bookings'),

-- Week 5 (4 Weeks Ago)
('Mumbai Run #1', 'Week 5', 'Pre-launch preparation phase', '', 'Finalized route and venue bookings'),
('Mumbai Run #2', 'Week 5', 'Initial community outreach efforts', '', 'Started social media campaigns'),
('Mumbai Run #3', 'Week 5', 'Beta testing with core group', '', 'Collected initial feedback'),
('Mumbai Tennis', 'Week 5', 'Court evaluation and selection', '', 'Negotiated facility agreements'),

-- Week 6 (5 Weeks Ago)
('Mumbai Run #1', 'Week 6', 'Planning and strategy development', '', 'Created detailed implementation roadmap'),
('Mumbai Run #2', 'Week 6', 'Market research and competitor analysis', '', 'Identified differentiation opportunities'),
('Mumbai Run #3', 'Week 6', 'Pilot program design phase', '', 'Developed initial framework'),
('Mumbai Tennis', 'Week 6', 'Instructor recruitment and training', '', 'Onboarded certified coaches')

ON CONFLICT (club_name, week_label) DO NOTHING;

-- Add comment with usage instructions
COMMENT ON TABLE wow_comments IS 'Stores weekly tracking comments for club performance monitoring';
COMMENT ON COLUMN wow_comments.club_name IS 'Name of the club being tracked';
COMMENT ON COLUMN wow_comments.week_label IS 'Week identifier: Current Week, 1 Week Ago, 2 Weeks Ago, etc.';
COMMENT ON COLUMN wow_comments.comment IS 'Progress comment for the week';
COMMENT ON COLUMN wow_comments.blocker IS 'Any blockers or issues identified';
COMMENT ON COLUMN wow_comments.action_taken IS 'Actions taken to address issues or improve performance';
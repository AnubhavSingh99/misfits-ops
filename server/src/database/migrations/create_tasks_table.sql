-- Task Tracker Tables
-- Create tasks table for task management system

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to VARCHAR(100) NOT NULL, -- POC name
    assigned_by VARCHAR(100) NOT NULL, -- Creator name
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, cancelled
    priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
    deadline DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create task comments table for tracking updates and communication
CREATE TABLE IF NOT EXISTS task_comments (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    commented_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE
    ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing
INSERT INTO tasks (title, description, assigned_to, assigned_by, status, priority, deadline) VALUES
('Review Q4 targets for Badminton', 'Review and finalize Q4 growth targets for badminton activities across all areas', 'POC 1', 'Admin', 'pending', 'high', '2025-01-15'),
('Update club health metrics', 'Review and update the health calculation engine based on new requirements', 'POC 2', 'Admin', 'in_progress', 'medium', '2025-01-20'),
('Organize team meeting', 'Schedule and organize monthly team sync meeting', 'POC 1', 'Admin', 'pending', 'low', '2025-01-10'),
('Database optimization', 'Optimize database queries for better performance', 'POC 2', 'Admin', 'completed', 'medium', '2025-01-05'),
('Launch tracking setup', 'Set up launch tracking for new clubs in Gurgaon', 'POC 1', 'Admin', 'pending', 'urgent', '2025-01-08');
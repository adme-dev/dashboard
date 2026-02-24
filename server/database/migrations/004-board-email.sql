-- Add email token to departments (boards) for email-to-board functionality
ALTER TABLE departments ADD COLUMN IF NOT EXISTS board_email_token VARCHAR(32) UNIQUE;

-- Index for fast lookup by token
CREATE INDEX IF NOT EXISTS idx_departments_email_token ON departments(board_email_token) WHERE board_email_token IS NOT NULL;

-- Add title column to team_members
ALTER TABLE team_members 
ADD COLUMN IF NOT EXISTS title VARCHAR(255);

COMMENT ON COLUMN team_members.title IS 'Job title from Monday.com';

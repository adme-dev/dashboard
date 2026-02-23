-- Add Monday.com sync fields to team_members

-- Add monday_user_id column
ALTER TABLE team_members 
ADD COLUMN IF NOT EXISTS monday_user_id VARCHAR(50);

-- Add avatar_url column
ALTER TABLE team_members 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create index for monday_user_id lookups
CREATE INDEX IF NOT EXISTS idx_team_members_monday_id 
ON team_members(monday_user_id) 
WHERE monday_user_id IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN team_members.monday_user_id IS 'Monday.com user ID for syncing';
COMMENT ON COLUMN team_members.avatar_url IS 'User avatar image URL';

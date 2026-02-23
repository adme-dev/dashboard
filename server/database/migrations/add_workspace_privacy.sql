-- Add privacy column to workspaces
ALTER TABLE workspaces 
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;

COMMENT ON COLUMN workspaces.is_private IS 'Whether the workspace is private (closed) or open to all team members';

-- Create index for privacy filtering
CREATE INDEX IF NOT EXISTS idx_workspaces_privacy ON workspaces(is_private) WHERE is_active = true;

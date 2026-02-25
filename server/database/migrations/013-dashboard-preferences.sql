-- 013-dashboard-preferences.sql
-- Add dashboard_preferences JSONB column to team_members for widget customization

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS dashboard_preferences JSONB DEFAULT NULL;

COMMENT ON COLUMN team_members.dashboard_preferences IS 'User dashboard widget config: { widgets: string[], pinnedItems: { type, id, label }[] }';

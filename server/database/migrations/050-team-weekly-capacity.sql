-- Add weekly_capacity column to team_members
-- Used by capacity planning / resource forecasting
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS weekly_capacity DECIMAL(5,2) DEFAULT 40;

ALTER TABLE client_team_assignments
  ADD COLUMN IF NOT EXISTS can_manage_inventory_feed_directly boolean NOT NULL DEFAULT false;

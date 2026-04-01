CREATE TABLE IF NOT EXISTS client_team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'primary_am',
  assigned_by UUID REFERENCES team_members(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS idx_client_team_client ON client_team_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_team_member ON client_team_assignments(team_member_id);

ALTER TABLE client_team_assignments
  ADD CONSTRAINT chk_assignment_role CHECK (role IN ('primary_am', 'secondary_am', 'support'));

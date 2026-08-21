-- One explicitly selected agency board may be exposed as a read-only,
-- client-filtered projection in the client portal.

ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS portal_board_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agency_clients_portal_board_id
  ON agency_clients (portal_board_id)
  WHERE portal_board_id IS NOT NULL;


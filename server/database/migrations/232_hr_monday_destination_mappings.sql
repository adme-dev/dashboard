-- Explicitly binds every approved Monday evidence board to its internal landing
-- destination. A governed import must never infer or silently skip a department.
ALTER TABLE hr_monday_evidence_scopes
  ADD COLUMN IF NOT EXISTS destination_mappings JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN hr_monday_evidence_scopes.destination_mappings IS
  'Owner-approved board-to-department/project destinations used by governed Monday imports and incremental syncs.';

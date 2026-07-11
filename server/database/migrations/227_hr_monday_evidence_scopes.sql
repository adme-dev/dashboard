-- Explicit, owner-approved Monday evidence boundaries. Importers must require
-- an approved row and enforce its allowlists before reading any work item.
CREATE TABLE IF NOT EXISTS hr_monday_evidence_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  board_ids JSONB NOT NULL,
  allowed_fields JSONB NOT NULL,
  purpose TEXT NOT NULL,
  exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 365 CHECK (retention_days BETWEEN 30 AND 2555),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'revoked')),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  CHECK (jsonb_array_length(board_ids) > 0)
);

CREATE INDEX IF NOT EXISTS idx_hr_monday_scope_status
  ON hr_monday_evidence_scopes(status, period_start, period_end);

COMMENT ON TABLE hr_monday_evidence_scopes IS
  'Owner-approved allowlists and bounded periods for future Monday HR evidence adapters; no approved row means no HR import.';

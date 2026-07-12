-- HR reads a purpose-limited extract, never Monday's unrestricted operational
-- source_data/column_values payloads. Revoking a scope removes its extracts.
CREATE TABLE IF NOT EXISTS hr_monday_evidence_extracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES hr_monday_evidence_scopes(id) ON DELETE CASCADE,
  monday_board_id VARCHAR(100) NOT NULL,
  monday_board_name VARCHAR(255),
  monday_item_id VARCHAR(100) NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title VARCHAR(500),
  assignee_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  due_date DATE,
  status_name VARCHAR(255),
  is_blocked BOOLEAN,
  source_created_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  source_ref TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  limitations TEXT[] NOT NULL DEFAULT ARRAY[
    'Minimal allowlisted task metadata only; no descriptions, comments, files or source payloads',
    'Work metadata provides process context and is not an employee performance conclusion'
  ]::TEXT[],
  UNIQUE (scope_id, monday_board_id, monday_item_id),
  CHECK (source_ref = 'monday:item:' || monday_board_id || ':' || monday_item_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_monday_extract_scope_observed
  ON hr_monday_evidence_extracts(scope_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_monday_extract_assignee
  ON hr_monday_evidence_extracts(scope_id, assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_monday_extract_expiry
  ON hr_monday_evidence_extracts(expires_at);

COMMENT ON TABLE hr_monday_evidence_extracts IS
  'Purpose-limited HR evidence snapshots. Contains no Monday raw payload, description, update/comment body, file, or questionnaire content.';

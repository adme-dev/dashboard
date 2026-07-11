-- Durable cursor and reconciliation state for governed HR Monday syncs.
CREATE TABLE IF NOT EXISTS hr_monday_sync_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope_id UUID NOT NULL REFERENCES hr_monday_evidence_scopes(id) ON DELETE CASCADE,
  monday_board_id VARCHAR(100) NOT NULL,
  cursor TEXT,
  last_source_updated_at TIMESTAMPTZ,
  last_started_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'completed', 'failed')),
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_archived INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scope_id, monday_board_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_monday_sync_states_scope_status
  ON hr_monday_sync_states(scope_id, status);

COMMENT ON TABLE hr_monday_sync_states IS 'Resumable, auditable cursor state for approved HR Monday evidence scopes.';

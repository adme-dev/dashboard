CREATE TABLE IF NOT EXISTS hr_monday_evidence_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope_id UUID NOT NULL REFERENCES hr_monday_evidence_scopes(id),
  webhook_event_id UUID NOT NULL UNIQUE REFERENCES monday_webhook_events(id),
  monday_board_id VARCHAR(100) NOT NULL,
  monday_item_id VARCHAR(100),
  change_kind VARCHAR(24) NOT NULL CHECK (change_kind IN ('assignment', 'status', 'archived', 'deleted', 'restored', 'moved')),
  field_id VARCHAR(160),
  occurred_at TIMESTAMPTZ NOT NULL,
  source_system VARCHAR(24) NOT NULL DEFAULT 'monday',
  limitations TEXT[] NOT NULL DEFAULT ARRAY['Webhook receipt time is used when Monday does not provide a universal event timestamp', 'Event records prove a source change occurred; they do not establish performance or intent']::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_monday_evidence_events_scope_item
  ON hr_monday_evidence_events(scope_id, monday_item_id, occurred_at DESC);

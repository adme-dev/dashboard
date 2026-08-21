-- Durable CRM promotion state and deduplicated integration-health alerts.

CREATE TABLE IF NOT EXISTS lead_crm_promotion_state (
  lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  outcome TEXT,
  last_error_class TEXT,
  first_queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_crm_promotion_state_client_status
  ON lead_crm_promotion_state (client_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS lead_integration_alert_state (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  issue_code TEXT NOT NULL,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  PRIMARY KEY (client_id, issue_code)
);

CREATE INDEX IF NOT EXISTS idx_lead_integration_alert_state_active
  ON lead_integration_alert_state (last_detected_at DESC)
  WHERE resolved_at IS NULL;

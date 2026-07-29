-- Content-free transport counters and durable, re-armable email health alerts.

BEGIN;

CREATE TABLE IF NOT EXISTS lead_email_transport_events (
  batch_id UUID NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 0 AND 31),
  endpoint_id UUID REFERENCES lead_email_endpoints(id) ON DELETE SET NULL,
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  correlation_id UUID,
  event_class TEXT NOT NULL CHECK (event_class IN (
    'pre_policy',
    'unknown_recipient',
    'signature_failure',
    'policy_denied',
    'r2_write_failure',
    'r2_delete_failure',
    'ai_schema_rejection'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (batch_id, ordinal),
  CHECK (endpoint_id IS NULL OR client_id IS NOT NULL),
  FOREIGN KEY (endpoint_id, client_id)
    REFERENCES lead_email_endpoints(id, client_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_email_transport_events_client_time
  ON lead_email_transport_events (client_id, created_at DESC, event_class);

CREATE INDEX IF NOT EXISTS idx_lead_email_transport_events_endpoint_time
  ON lead_email_transport_events (endpoint_id, created_at DESC, event_class)
  WHERE endpoint_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_email_ingestions_endpoint_accepted
  ON lead_email_ingestions (endpoint_id, created_at DESC)
  WHERE status = 'accepted';

CREATE TABLE IF NOT EXISTS lead_email_alert_state (
  endpoint_id UUID NOT NULL REFERENCES lead_email_endpoints(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  alert_code TEXT NOT NULL CHECK (alert_code IN (
    'consecutive_failures',
    'failure_rate',
    'silence',
    'unassigned',
    'first_response_sla',
    'unknown_recipient_spike',
    'signature_failures',
    'r2_retention_failures',
    'ai_schema_rejections'
  )),
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  notification_claim_token UUID,
  notification_claimed_at TIMESTAMPTZ,
  PRIMARY KEY (endpoint_id, alert_code),
  FOREIGN KEY (endpoint_id, client_id)
    REFERENCES lead_email_endpoints(id, client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_email_alert_state_active
  ON lead_email_alert_state (client_id, last_detected_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE lead_email_alert_state
  DROP CONSTRAINT IF EXISTS lead_email_alert_state_claim_check,
  ADD CONSTRAINT lead_email_alert_state_claim_check CHECK (
    (notification_claim_token IS NULL AND notification_claimed_at IS NULL)
    OR (notification_claim_token IS NOT NULL AND notification_claimed_at IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS lead_email_global_alert_state (
  alert_code TEXT PRIMARY KEY CHECK (alert_code IN (
    'unknown_recipient_spike',
    'signature_failures'
  )),
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  notification_claim_token UUID,
  notification_claimed_at TIMESTAMPTZ,
  CHECK (
    (notification_claim_token IS NULL AND notification_claimed_at IS NULL)
    OR (notification_claim_token IS NOT NULL AND notification_claimed_at IS NOT NULL)
  )
);

COMMIT;

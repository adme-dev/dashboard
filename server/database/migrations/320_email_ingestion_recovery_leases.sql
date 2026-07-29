-- Durable ownership for email-ingestion recovery and content-free replay audit.

BEGIN;

ALTER TABLE lead_email_ingestions
  ADD COLUMN IF NOT EXISTS recovery_lease_token UUID,
  ADD COLUMN IF NOT EXISTS recovery_claimed_at TIMESTAMPTZ;

ALTER TABLE lead_email_ingestions
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_recovery_lease_check,
  ADD CONSTRAINT lead_email_ingestions_recovery_lease_check CHECK (
    (recovery_lease_token IS NULL AND recovery_claimed_at IS NULL)
    OR (recovery_lease_token IS NOT NULL AND recovery_claimed_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_lead_email_ingestions_recovery_lease
  ON lead_email_ingestions (next_attempt_at, created_at, id)
  WHERE terminal_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_email_endpoints_id_client
  ON lead_email_endpoints (id, client_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_email_ingestions_id_endpoint_client
  ON lead_email_ingestions (id, endpoint_id, client_id);

CREATE TABLE IF NOT EXISTS lead_email_ingestion_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_id UUID NOT NULL,
  endpoint_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('cron', 'team_member')),
  action TEXT NOT NULL CHECK (action IN (
    'recovery_claimed',
    'recovery_completed',
    'recovery_rescheduled',
    'recovery_quarantined',
    'terminal_cleanup',
    'manual_replay_requested',
    'manual_replay_completed',
    'manual_replay_rejected'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'claimed',
    'accepted',
    'duplicate',
    'quarantined',
    'rescheduled',
    'skipped',
    'deleted'
  )),
  reason TEXT CHECK (
    reason IS NULL OR reason IN (
      'missing_evidence',
      'corrupt_evidence',
      'endpoint_unavailable',
      'sender_policy_denied',
      'attempts_exhausted',
      'evidence_expired',
      'canonical_transient',
      'lease_lost'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (endpoint_id, client_id)
    REFERENCES lead_email_endpoints(id, client_id) ON DELETE RESTRICT,
  FOREIGN KEY (ingestion_id, endpoint_id, client_id)
    REFERENCES lead_email_ingestions(id, endpoint_id, client_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_lead_email_ingestion_audits_ingestion_created
  ON lead_email_ingestion_audits (ingestion_id, created_at DESC, id DESC);

COMMIT;

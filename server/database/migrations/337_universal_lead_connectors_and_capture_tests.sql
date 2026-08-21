-- Provider-neutral lead connectors and append-only end-to-end capture tests.

BEGIN;

CREATE TABLE IF NOT EXISTS lead_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  site_id UUID REFERENCES tracking_sites(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'first_party_gateway', 'provider_webhook', 'provider_poll',
    'meta_lead_ads', 'google_lead_form', 'controlled_import',
    'browser_candidate'
  )),
  provider TEXT NOT NULL CHECK (
    char_length(provider) BETWEEN 1 AND 100
    AND provider ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  status TEXT NOT NULL DEFAULT 'test' CHECK (status IN (
    'active', 'test', 'stale', 'error', 'disabled'
  )),
  authority TEXT NOT NULL DEFAULT 'candidate_only' CHECK (
    authority IN ('canonical', 'candidate_only')
  ),
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_origins JSONB NOT NULL DEFAULT '[]'::jsonb,
  form_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  public_token TEXT UNIQUE,
  secret_ciphertext BYTEA,
  secret_iv BYTEA,
  previous_secret_ciphertext BYTEA,
  previous_secret_iv BYTEA,
  previous_secret_valid_until TIMESTAMPTZ,
  credential_ref TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  poll_cursor JSONB,
  last_receipt_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_poll_at TIMESTAMPTZ,
  last_error_class TEXT,
  duplicate_receipts BIGINT NOT NULL DEFAULT 0 CHECK (duplicate_receipts >= 0),
  replay_rejections BIGINT NOT NULL DEFAULT 0 CHECK (replay_rejections >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  provisioned_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  provision_reason TEXT CHECK (
    provision_reason IS NULL OR char_length(provision_reason) BETWEEN 1 AND 1000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(capabilities) = 'array'),
  CHECK (jsonb_typeof(approved_origins) = 'array'),
  CHECK (jsonb_typeof(form_references) = 'array'),
  CHECK (jsonb_typeof(config) = 'object'),
  CHECK (
    authority = 'candidate_only'
    OR type <> 'browser_candidate'
  ),
  CHECK (
    public_token IS NULL
    OR char_length(public_token) BETWEEN 24 AND 128
  ),
  CHECK (
    (secret_ciphertext IS NULL AND secret_iv IS NULL)
    OR (secret_ciphertext IS NOT NULL AND secret_iv IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_connectors_client_status
  ON lead_connectors (client_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_connectors_stale_receipt
  ON lead_connectors (last_receipt_at)
  WHERE status IN ('active', 'stale') AND authority = 'canonical';
CREATE INDEX IF NOT EXISTS idx_lead_connectors_poll_freshness
  ON lead_connectors (last_poll_at)
  WHERE type = 'provider_poll' AND status <> 'disabled';

CREATE TABLE IF NOT EXISTS lead_capture_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  site_id UUID REFERENCES tracking_sites(id) ON DELETE SET NULL,
  connector_id UUID NOT NULL REFERENCES lead_connectors(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  expected_origin TEXT NOT NULL CHECK (char_length(expected_origin) BETWEEN 8 AND 2048),
  expected_stages JSONB NOT NULL,
  bootstrap_token_digest TEXT NOT NULL UNIQUE CHECK (char_length(bootstrap_token_digest) = 64),
  bootstrap_consumed_at TIMESTAMPTZ,
  evidence_token_digest TEXT UNIQUE CHECK (
    evidence_token_digest IS NULL OR char_length(evidence_token_digest) = 64
  ),
  status TEXT NOT NULL DEFAULT 'created' CHECK (
    status IN ('created', 'running', 'passed', 'failed', 'timed_out', 'cancelled')
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(expected_stages) = 'array'),
  CHECK (expires_at > created_at),
  CHECK (
    (status IN ('created', 'running') AND completed_at IS NULL)
    OR (status IN ('passed', 'failed', 'timed_out', 'cancelled') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_capture_test_runs_active
  ON lead_capture_test_runs (client_id, connector_id, expires_at)
  WHERE status IN ('created', 'running');

CREATE TABLE IF NOT EXISTS lead_capture_test_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES lead_capture_test_runs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN (
    'tracker_loaded', 'candidate_created', 'provider_success_observed',
    'trusted_receipt_accepted', 'candidate_reconciled',
    'canonical_test_lead_stored', 'destinations_validated'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN ('passed', 'failed', 'skipped')),
  evidence_key TEXT NOT NULL CHECK (char_length(evidence_key) BETWEEN 1 AND 255),
  redacted_diagnostic TEXT CHECK (
    redacted_diagnostic IS NULL OR char_length(redacted_diagnostic) <= 1000
  ),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, stage, evidence_key)
);

CREATE INDEX IF NOT EXISTS idx_lead_capture_test_events_run
  ON lead_capture_test_events (run_id, occurred_at, id);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS test_run_id UUID
    REFERENCES lead_capture_test_runs(id) ON DELETE SET NULL;

ALTER TABLE lead_submission_intents
  ADD COLUMN IF NOT EXISTS test_run_id UUID
    REFERENCES lead_capture_test_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_test_run
  ON leads (test_run_id, submitted_at DESC)
  WHERE test_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_submission_intents_test_run
  ON lead_submission_intents (test_run_id, occurred_at DESC)
  WHERE test_run_id IS NOT NULL;

CREATE OR REPLACE FUNCTION protect_lead_capture_test_event_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'lead capture test evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_capture_test_events_append_only
  ON lead_capture_test_events;
CREATE TRIGGER trg_lead_capture_test_events_append_only
BEFORE UPDATE OR DELETE ON lead_capture_test_events
FOR EACH ROW EXECUTE FUNCTION protect_lead_capture_test_event_evidence();

CREATE OR REPLACE FUNCTION protect_lead_capture_test_run_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lead capture test runs cannot be deleted';
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.connector_id IS DISTINCT FROM OLD.connector_id
    OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.expected_origin IS DISTINCT FROM OLD.expected_origin
    OR NEW.expected_stages IS DISTINCT FROM OLD.expected_stages
    OR NEW.bootstrap_token_digest IS DISTINCT FROM OLD.bootstrap_token_digest
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'lead capture test identity is immutable';
  END IF;

  IF OLD.status IN ('passed', 'failed', 'timed_out', 'cancelled') THEN
    RAISE EXCEPTION 'completed lead capture tests are immutable';
  END IF;

  IF OLD.status = 'created' AND NEW.status NOT IN ('created', 'running', 'cancelled', 'timed_out') THEN
    RAISE EXCEPTION 'invalid lead capture test transition';
  END IF;

  IF OLD.status = 'running' AND NEW.status NOT IN ('running', 'passed', 'failed', 'cancelled', 'timed_out') THEN
    RAISE EXCEPTION 'invalid lead capture test transition';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_capture_test_runs_transition
  ON lead_capture_test_runs;
CREATE TRIGGER trg_lead_capture_test_runs_transition
BEFORE UPDATE OR DELETE ON lead_capture_test_runs
FOR EACH ROW EXECUTE FUNCTION protect_lead_capture_test_run_transition();

COMMIT;

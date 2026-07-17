-- 258_measurement_provider_test_runs.sql
-- Redacted, tenant-scoped evidence for explicit provider validation actions.
-- Transient test codes, click identifiers and provider credentials are never stored.

BEGIN;

CREATE TABLE IF NOT EXISTS measurement_provider_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  destination_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google_data_manager')),
  mode TEXT NOT NULL CHECK (mode IN ('meta_test_events', 'google_validate_only')),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'accepted', 'failed')),
  canonical_event_name TEXT NOT NULL CHECK (canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion'
  )),
  provider_event_name TEXT NOT NULL
    CHECK (char_length(provider_event_name) BETWEEN 1 AND 255),
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 255),
  provider_request_id TEXT CHECK (
    provider_request_id IS NULL OR char_length(provider_request_id) BETWEEN 1 AND 255
  ),
  error_class TEXT CHECK (error_class IS NULL OR char_length(error_class) BETWEEN 1 AND 255),
  redacted_error TEXT CHECK (redacted_error IS NULL OR char_length(redacted_error) <= 1000),
  actor_id TEXT NOT NULL CHECK (char_length(actor_id) BETWEEN 1 AND 255),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (client_id, idempotency_key),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES client_measurement_profiles(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, destination_id)
    REFERENCES conversion_destinations(client_id, id) ON DELETE CASCADE,
  CHECK (
    (status = 'requested' AND completed_at IS NULL)
    OR (status IN ('accepted', 'failed') AND completed_at IS NOT NULL)
  ),
  CHECK (
    (platform = 'meta' AND mode = 'meta_test_events')
    OR (platform = 'google_data_manager' AND mode = 'google_validate_only')
  )
);

CREATE INDEX IF NOT EXISTS idx_measurement_provider_test_runs_destination
  ON measurement_provider_test_runs (client_id, destination_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurement_provider_test_runs_status
  ON measurement_provider_test_runs (status, requested_at)
  WHERE status = 'requested';

CREATE OR REPLACE FUNCTION protect_measurement_provider_test_run_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'measurement provider test evidence is append-only';
  END IF;

  IF OLD.status <> 'requested' THEN
    RAISE EXCEPTION 'completed measurement provider test evidence is immutable';
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
    OR NEW.destination_id IS DISTINCT FROM OLD.destination_id
    OR NEW.platform IS DISTINCT FROM OLD.platform
    OR NEW.mode IS DISTINCT FROM OLD.mode
    OR NEW.canonical_event_name IS DISTINCT FROM OLD.canonical_event_name
    OR NEW.provider_event_name IS DISTINCT FROM OLD.provider_event_name
    OR NEW.config_version IS DISTINCT FROM OLD.config_version
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
  THEN
    RAISE EXCEPTION 'measurement provider test identity is immutable';
  END IF;

  IF NEW.status NOT IN ('accepted', 'failed') OR NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'measurement provider test can only transition once to a terminal state';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_measurement_provider_test_runs_append_only
  ON measurement_provider_test_runs;
CREATE TRIGGER trg_measurement_provider_test_runs_append_only
BEFORE UPDATE OR DELETE ON measurement_provider_test_runs
FOR EACH ROW EXECUTE FUNCTION protect_measurement_provider_test_run_evidence();

COMMIT;

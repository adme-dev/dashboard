-- Independent stream freshness and bounded sync progress. Provider credentials
-- and raw provider responses are deliberately excluded.

BEGIN;

ALTER TABLE google_ads_call_sync_state
  ADD COLUMN IF NOT EXISTS last_requested_start_date DATE,
  ADD COLUMN IF NOT EXISTS last_requested_end_date DATE,
  ADD COLUMN IF NOT EXISTS covered_start_date DATE,
  ADD COLUMN IF NOT EXISTS covered_end_date DATE,
  ADD COLUMN IF NOT EXISTS current_job_id UUID,
  ADD COLUMN IF NOT EXISTS current_job_state TEXT NOT NULL DEFAULT 'idle'
    CHECK (current_job_state IN ('idle', 'pending', 'running', 'completed', 'failed'));

CREATE TABLE IF NOT EXISTS measurement_data_freshness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  connection_id UUID,
  stream TEXT NOT NULL CHECK (stream IN (
    'spend', 'campaign_conversions', 'conversion_actions', 'website_events', 'provider_calls'
  )),
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_row_count INTEGER NOT NULL DEFAULT 0 CHECK (last_row_count >= 0),
  requested_start_date DATE,
  requested_end_date DATE,
  covered_start_date DATE,
  covered_end_date DATE,
  current_job_id UUID,
  current_job_state TEXT NOT NULL DEFAULT 'idle' CHECK (
    current_job_state IN ('idle', 'pending', 'running', 'completed', 'failed')
  ),
  unavailable_reason_code TEXT CHECK (
    unavailable_reason_code IS NULL OR unavailable_reason_code ~ '^[a-z][a-z0-9_]{0,99}$'
  ),
  last_error_code TEXT CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{0,99}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, connection_id)
    REFERENCES social_connections(client_id, id) ON DELETE CASCADE,
  CHECK (requested_start_date IS NULL OR requested_end_date IS NULL OR requested_start_date <= requested_end_date),
  CHECK (covered_start_date IS NULL OR covered_end_date IS NULL OR covered_start_date <= covered_end_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_data_freshness_stream
  ON measurement_data_freshness (
    client_id, COALESCE(connection_id, '00000000-0000-0000-0000-000000000000'::uuid), stream
  );

CREATE INDEX IF NOT EXISTS idx_measurement_data_freshness_client
  ON measurement_data_freshness (client_id, stream, updated_at DESC);

CREATE TABLE IF NOT EXISTS measurement_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  connection_id UUID,
  stream TEXT NOT NULL CHECK (stream IN (
    'spend', 'campaign_conversions', 'conversion_actions', 'website_events', 'provider_calls'
  )),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 255),
  requested_start_date DATE NOT NULL,
  requested_end_date DATE NOT NULL,
  covered_start_date DATE,
  covered_end_date DATE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'completed', 'failed')),
  expected_units INTEGER CHECK (expected_units IS NULL OR expected_units >= 0),
  completed_units INTEGER NOT NULL DEFAULT 0 CHECK (completed_units >= 0),
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  requested_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (client_id, connection_id)
    REFERENCES social_connections(client_id, id) ON DELETE RESTRICT,
  UNIQUE (client_id, id),
  UNIQUE (client_id, stream, idempotency_key),
  CHECK (requested_start_date <= requested_end_date),
  CHECK (requested_end_date - requested_start_date <= 397)
);

CREATE TABLE IF NOT EXISTS measurement_sync_job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  job_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'requested', 'started', 'progress', 'account_failed', 'completed', 'failed'
  )),
  account_customer_id TEXT CHECK (
    account_customer_id IS NULL OR account_customer_id ~ '^[0-9]{1,20}$'
  ),
  completed_units INTEGER CHECK (completed_units IS NULL OR completed_units >= 0),
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, job_id) REFERENCES measurement_sync_jobs(client_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_measurement_sync_job_events_job
  ON measurement_sync_job_events (client_id, job_id, created_at ASC);

DROP TRIGGER IF EXISTS trg_measurement_sync_job_events_append_only ON measurement_sync_job_events;
CREATE TRIGGER trg_measurement_sync_job_events_append_only
BEFORE UPDATE OR DELETE ON measurement_sync_job_events
FOR EACH ROW EXECUTE FUNCTION prevent_measurement_evidence_mutation();

COMMIT;

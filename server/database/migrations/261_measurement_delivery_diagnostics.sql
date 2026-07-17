-- Migration 261: asynchronous provider delivery diagnostics.
-- Adds a separate lease/cadence state so provider acceptance is never treated
-- as terminal delivery and diagnostic polling cannot trigger re-ingestion.

ALTER TABLE conversion_deliveries
  ADD COLUMN IF NOT EXISTS diagnostic_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS diagnostic_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diagnostic_next_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diagnostic_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diagnostic_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diagnostic_claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS diagnostic_check_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diagnostic_warning_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diagnostic_error_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE conversion_deliveries
  DROP CONSTRAINT IF EXISTS conversion_deliveries_diagnostic_status_check;
ALTER TABLE conversion_deliveries
  ADD CONSTRAINT conversion_deliveries_diagnostic_status_check
  CHECK (diagnostic_status IN (
    'not_required', 'pending', 'processing', 'success',
    'partial_success', 'failed', 'timed_out'
  ));

ALTER TABLE conversion_deliveries
  DROP CONSTRAINT IF EXISTS conversion_deliveries_diagnostic_check_count_check;
ALTER TABLE conversion_deliveries
  ADD CONSTRAINT conversion_deliveries_diagnostic_check_count_check
  CHECK (
    diagnostic_check_count >= 0
    AND diagnostic_warning_count >= 0
    AND diagnostic_error_count >= 0
  );

CREATE INDEX IF NOT EXISTS idx_conversion_deliveries_diagnostics_due
  ON conversion_deliveries (diagnostic_next_check_at, created_at)
  WHERE diagnostic_status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS conversion_delivery_diagnostic_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL,
  check_number INTEGER NOT NULL CHECK (check_number > 0),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'processing', 'success', 'partial_success', 'failed',
    'http_failure', 'timed_out', 'credential_failure'
  )),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  error_class TEXT CHECK (error_class IS NULL OR char_length(error_class) <= 255),
  redacted_diagnostic TEXT CHECK (
    redacted_diagnostic IS NULL OR char_length(redacted_diagnostic) <= 1000
  ),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (delivery_id, check_number),
  FOREIGN KEY (client_id, delivery_id)
    REFERENCES conversion_deliveries(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversion_delivery_diagnostic_checks_delivery
  ON conversion_delivery_diagnostic_checks (client_id, delivery_id, check_number DESC);

DROP TRIGGER IF EXISTS trg_conversion_delivery_diagnostic_checks_append_only
  ON conversion_delivery_diagnostic_checks;
CREATE TRIGGER trg_conversion_delivery_diagnostic_checks_append_only
BEFORE UPDATE OR DELETE ON conversion_delivery_diagnostic_checks
FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

COMMENT ON TABLE conversion_delivery_diagnostic_checks IS
  'Append-only redacted provider request-status evidence; raw provider responses are never retained.';

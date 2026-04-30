-- Migration 086: Anomaly persistence cleanup
-- Follow-up to 085 — addresses code quality review:
--   1. Rename indexes/trigger to match repo convention (idx_/trg_ prefixes).
--   2. Add CHECK so a 'snoozed' row always has a snoozed_until (prevents stuck snoozes).
--   3. Add index on last_detected_at for "stale anomaly" queries.

BEGIN;

-- ── 1. Naming convention alignment ──────────────────────────────────
-- Existing repo convention is idx_<table>_<columns> and trg_<table>_<event>.
ALTER INDEX IF EXISTS anomalies_active_fingerprint_idx
  RENAME TO uniq_anomalies_active_fingerprint;
ALTER INDEX IF EXISTS anomalies_tenant_status_idx
  RENAME TO idx_anomalies_tenant_status;
ALTER INDEX IF EXISTS anomalies_group_key_idx
  RENAME TO idx_anomalies_group_key;
ALTER INDEX IF EXISTS anomalies_severity_idx
  RENAME TO idx_anomalies_tenant_severity_status;
ALTER INDEX IF EXISTS anomalies_first_detected_idx
  RENAME TO idx_anomalies_tenant_first_detected;
ALTER INDEX IF EXISTS anomaly_events_anomaly_id_idx
  RENAME TO idx_anomaly_events_anomaly_created;

ALTER TRIGGER update_anomalies_updated_at ON anomalies
  RENAME TO trg_anomalies_updated_at;

-- ── 2. Prevent stuck-snoozed rows ───────────────────────────────────
-- A row with status='snoozed' MUST have a snoozed_until timestamp.
-- Without this, a missed un-snooze operation leaves a row blocking re-detection
-- via the active-fingerprint partial unique index forever.
ALTER TABLE anomalies
  ADD CONSTRAINT anomalies_snoozed_requires_until CHECK (
    status <> 'snoozed' OR snoozed_until IS NOT NULL
  );

-- ── 3. Index for stale-anomaly queries ──────────────────────────────
-- "Anomalies not updated in the last N hours" / "stale incidents" patterns.
CREATE INDEX IF NOT EXISTS idx_anomalies_tenant_last_detected
  ON anomalies (tenant_id, last_detected_at DESC);

COMMIT;

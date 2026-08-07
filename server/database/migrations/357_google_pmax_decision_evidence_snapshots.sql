-- 357_google_pmax_decision_evidence_snapshots.sql
-- Immutable, config-bound whole-platform evidence snapshots for governed launch decisions.

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_launch_evidence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id UUID NOT NULL,
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  config_hash TEXT NOT NULL CHECK (
    char_length(config_hash) = 64
    AND config_hash ~ '^[a-f0-9]{64}$'
  ),
  evidence_hash TEXT NOT NULL CHECK (
    char_length(evidence_hash) = 64
    AND evidence_hash ~ '^[a-f0-9]{64}$'
  ),
  snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(snapshot) = 'object'
    AND octet_length(snapshot::text) <= 262144
    AND NOT campaign_launch_payload_has_sensitive_keys(snapshot)
  ),
  collected_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (launch_id, config_version, config_hash)
    REFERENCES campaign_launches (id, config_version, config_hash) ON DELETE RESTRICT,
  UNIQUE (launch_id, config_version, config_hash, evidence_hash)
);

CREATE INDEX IF NOT EXISTS idx_campaign_launch_evidence_timeline
  ON campaign_launch_evidence_snapshots (launch_id, collected_at DESC, id DESC);

DROP TRIGGER IF EXISTS trg_campaign_launch_evidence_append_only
  ON campaign_launch_evidence_snapshots;
CREATE TRIGGER trg_campaign_launch_evidence_append_only
  BEFORE UPDATE OR DELETE ON campaign_launch_evidence_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

DROP TRIGGER IF EXISTS trg_campaign_launch_evidence_no_truncate
  ON campaign_launch_evidence_snapshots;
CREATE TRIGGER trg_campaign_launch_evidence_no_truncate
  BEFORE TRUNCATE ON campaign_launch_evidence_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

COMMIT;

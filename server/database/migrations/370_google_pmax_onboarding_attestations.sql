-- 370_google_pmax_onboarding_attestations.sql
-- Immutable, expiring human/provider onboarding evidence bound to one launch config.

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_launch_onboarding_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id UUID NOT NULL,
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  config_hash TEXT NOT NULL CHECK (
    char_length(config_hash) = 64
    AND config_hash ~ '^[a-f0-9]{64}$'
  ),
  snapshot_hash TEXT NOT NULL CHECK (
    char_length(snapshot_hash) = 64
    AND snapshot_hash ~ '^[a-f0-9]{64}$'
  ),
  snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(snapshot) = 'object'
    AND octet_length(snapshot::text) <= 131072
    AND NOT campaign_launch_payload_has_sensitive_keys(snapshot)
  ),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 20 AND 2000),
  attested_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  attested_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > attested_at),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (launch_id, config_version, config_hash)
    REFERENCES campaign_launches (id, config_version, config_hash) ON DELETE RESTRICT,
  UNIQUE (launch_id, config_version, config_hash, snapshot_hash, attested_by),
  CONSTRAINT campaign_launch_onboarding_snapshot_identity_check CHECK (
    snapshot->>'schemaVersion' = '1'
    AND snapshot->>'snapshotHash' = snapshot_hash
    AND snapshot#>>'{identity,launchId}' = launch_id::text
    AND snapshot#>>'{identity,configVersion}' = config_version::text
    AND snapshot#>>'{identity,configHash}' = config_hash
  )
);

CREATE INDEX IF NOT EXISTS idx_campaign_launch_onboarding_current
  ON campaign_launch_onboarding_attestations (launch_id, config_version, attested_at DESC, id DESC);

DROP TRIGGER IF EXISTS trg_campaign_launch_onboarding_append_only
  ON campaign_launch_onboarding_attestations;
CREATE TRIGGER trg_campaign_launch_onboarding_append_only
  BEFORE UPDATE OR DELETE ON campaign_launch_onboarding_attestations
  FOR EACH ROW EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

DROP TRIGGER IF EXISTS trg_campaign_launch_onboarding_no_truncate
  ON campaign_launch_onboarding_attestations;
CREATE TRIGGER trg_campaign_launch_onboarding_no_truncate
  BEFORE TRUNCATE ON campaign_launch_onboarding_attestations
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

COMMIT;

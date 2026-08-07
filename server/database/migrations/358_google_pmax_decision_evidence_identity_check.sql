-- 358_google_pmax_decision_evidence_identity_check.sql
-- Enforce agreement between indexed snapshot columns and the canonical JSON identity.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'campaign_launch_evidence_snapshot_identity_check'
       AND conrelid = 'campaign_launch_evidence_snapshots'::regclass
  ) THEN
    ALTER TABLE campaign_launch_evidence_snapshots
      ADD CONSTRAINT campaign_launch_evidence_snapshot_identity_check CHECK (
        jsonb_typeof(snapshot->'identity') = 'object'
        AND snapshot->>'schemaVersion' = '1'
        AND snapshot->>'evidenceHash' = evidence_hash
        AND snapshot#>>'{identity,configVersion}' = config_version::text
        AND snapshot#>>'{identity,configHash}' = config_hash
      );
  END IF;
END $$;

COMMIT;

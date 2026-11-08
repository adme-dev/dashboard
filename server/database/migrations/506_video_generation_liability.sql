-- Canonical job liability. Spend stays on video_generation_jobs; this is not a second ledger.
-- Unresolved reserved/uncertain rows continue to count after a month boundary.
-- Reported rows belong to the UTC month of completed_at (else created_at). Released rows do not count.
-- Historical failed rows are NOT released to zero: the old worker labeled lost submits and
-- provider failures as failed without proving they were unbilled. Blocked rows with no actual
-- cost were compliance rejects before submit and can release. An actual cost is kept on every status.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE video_generation_jobs
  ADD COLUMN IF NOT EXISTS liability_state TEXT,
  ADD COLUMN IF NOT EXISTS liability_cents INTEGER,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS submission_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_eligible BOOLEAN NOT NULL DEFAULT true;

-- Backfill is deliberately stricter than new-job initialization: legacy submissions had no durable claim.
UPDATE video_generation_jobs
   SET liability_cents = CASE
         WHEN actual_cost_cents IS NOT NULL THEN actual_cost_cents
         WHEN status = 'blocked' THEN 0
         ELSE estimated_cost_cents
       END,
       liability_state = CASE
         WHEN actual_cost_cents IS NOT NULL THEN 'reported'
         WHEN status = 'blocked' THEN 'released'
         WHEN status IN ('queued', 'running') THEN 'uncertain'
         WHEN status = 'succeeded' THEN 'uncertain'
         WHEN status = 'failed' THEN 'uncertain'
         ELSE 'uncertain'
       END,
       -- Older code had no before-submit claim. A queued legacy row may have
       -- reached its provider before a crash: hold it for reconciliation, never
       -- infer permission to submit it again. New inserts retain NULL claims.
       submission_attempted_at = CASE WHEN status IN ('queued', 'running', 'unknown')
         THEN COALESCE(submission_attempted_at, started_at, updated_at, created_at)
         ELSE submission_attempted_at END,
       -- Blocked rows never reached a provider. Keep the fingerprint fallback aligned
       -- with initialDispatchEligible, which forces dispatch_eligible false.
       dispatch_eligible = CASE WHEN status = 'blocked' THEN false ELSE dispatch_eligible END
 WHERE liability_state IS NULL;

-- Compatibility for new inserts from the previous Pages build during the coordinated
-- paused/drained consumer rollout. Unlike the historical backfill, these new inserts
-- have not been consumed yet; preserve their real unclaimed state for the new Worker.
CREATE OR REPLACE FUNCTION video_generation_legacy_liability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('succeeded', 'failed') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.output_asset_id IS DISTINCT FROM OLD.output_asset_id
      OR NEW.output_r2_key IS DISTINCT FROM OLD.output_r2_key THEN
      RETURN OLD;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.liability_state IS NULL OR NEW.liability_cents IS NULL) THEN
    NEW.liability_state := CASE WHEN NEW.actual_cost_cents IS NOT NULL THEN 'reported'
      WHEN NEW.status = 'blocked' THEN 'released'
      WHEN NEW.status = 'queued' AND NEW.provider_request_id IS NULL THEN 'reserved'
      ELSE 'uncertain' END;
    NEW.liability_cents := CASE WHEN NEW.actual_cost_cents IS NOT NULL THEN NEW.actual_cost_cents
      WHEN NEW.status = 'blocked' THEN 0 ELSE NEW.estimated_cost_cents END;
    NEW.dispatch_eligible := NEW.status = 'queued' AND NEW.provider_request_id IS NULL;
    IF NEW.provider_request_id IS NOT NULL OR NEW.status IN ('running', 'unknown') THEN
      NEW.submission_attempted_at := COALESCE(NEW.submission_attempted_at, NEW.created_at, now());
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.request_fingerprint IS NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.actual_cost_cents IS DISTINCT FROM OLD.actual_cost_cents THEN
      IF NEW.actual_cost_cents IS NOT NULL THEN
        NEW.liability_state := 'reported';
        NEW.liability_cents := NEW.actual_cost_cents;
      ELSIF NEW.status <> 'blocked' AND NEW.liability_state <> 'released' THEN
        NEW.liability_state := 'uncertain';
        NEW.liability_cents := GREATEST(OLD.liability_cents, NEW.estimated_cost_cents);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS video_generation_legacy_liability_compat ON video_generation_jobs;
CREATE TRIGGER video_generation_legacy_liability_compat
  BEFORE INSERT OR UPDATE ON video_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION video_generation_legacy_liability();

ALTER TABLE video_generation_jobs
  ALTER COLUMN liability_state SET NOT NULL,
  ALTER COLUMN liability_cents SET NOT NULL;

ALTER TABLE video_generation_jobs
  DROP CONSTRAINT IF EXISTS video_generation_jobs_liability_state_check;
ALTER TABLE video_generation_jobs
  ADD CONSTRAINT video_generation_jobs_liability_state_check
  CHECK (liability_state IN ('released', 'reserved', 'uncertain', 'reported'));

ALTER TABLE video_generation_jobs
  DROP CONSTRAINT IF EXISTS video_generation_jobs_liability_cents_check;
ALTER TABLE video_generation_jobs
  ADD CONSTRAINT video_generation_jobs_liability_cents_check
  CHECK (liability_cents >= 0);

ALTER TABLE video_generation_jobs
  DROP CONSTRAINT IF EXISTS video_generation_jobs_released_zero_check;
ALTER TABLE video_generation_jobs
  ADD CONSTRAINT video_generation_jobs_released_zero_check
  CHECK (liability_state <> 'released' OR liability_cents = 0);

ALTER TABLE video_generation_jobs
  DROP CONSTRAINT IF EXISTS video_generation_jobs_request_fingerprint_check;
ALTER TABLE video_generation_jobs
  ADD CONSTRAINT video_generation_jobs_request_fingerprint_check
  CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9a-f]{64}$');

DO $$
DECLARE
  existing RECORD;
BEGIN
  FOR existing IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'video_generation_jobs'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%queued%'
       AND pg_get_constraintdef(oid) ILIKE '%blocked%'
       AND pg_get_constraintdef(oid) ~ 'status'
  LOOP
    EXECUTE format('ALTER TABLE video_generation_jobs DROP CONSTRAINT %I', existing.conname);
  END LOOP;
END $$;

ALTER TABLE video_generation_jobs
  DROP CONSTRAINT IF EXISTS video_generation_jobs_status_check;
ALTER TABLE video_generation_jobs
  ADD CONSTRAINT video_generation_jobs_status_check
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'blocked', 'unknown'))
  NOT VALID;
ALTER TABLE video_generation_jobs VALIDATE CONSTRAINT video_generation_jobs_status_check;

CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_open_liability
  ON video_generation_jobs (tenant_id, project_id, liability_state);

CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_unclaimed_dispatch
  ON video_generation_jobs (created_at)
  WHERE status = 'queued'
    AND submission_attempted_at IS NULL
    AND dispatch_eligible = true
    AND provider_request_id IS NULL;

-- Do not silently rewrite historical duplicates: if any exist, this additive
-- migration fails and requires explicit reconciliation before release.
CREATE UNIQUE INDEX IF NOT EXISTS video_generation_jobs_project_operation
  ON video_generation_jobs (project_id, idempotency_key);

COMMIT;

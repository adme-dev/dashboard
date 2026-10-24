-- Immutable complete observations only. No review, consent or admission selector.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_reconciliations (
  capture_id UUID PRIMARY KEY,
  operation_id UUID NOT NULL REFERENCES page_studio_transfer_recovery_heads(operation_id),
  request_id UUID NOT NULL REFERENCES page_studio_transfer_requests(request_id),
  request_revision INTEGER NOT NULL CHECK(request_revision BETWEEN 1 AND 2147483646),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  recovery_id UUID NOT NULL,
  epoch INTEGER NOT NULL CHECK(epoch BETWEEN 1 AND 2147483646),
  pg_version INTEGER NOT NULL CHECK(pg_version BETWEEN 1 AND 2147483646),
  d1_version INTEGER NOT NULL CHECK(d1_version BETWEEN 1 AND 2147483646),
  invocation_digest TEXT NOT NULL CHECK(invocation_digest ~ '^[a-f0-9]{64}$'),
  invariant JSONB NOT NULL CHECK(jsonb_typeof(invariant)='object'),
  invariant_json TEXT NOT NULL CHECK(octet_length(invariant_json)<=65536),
  invariant_digest TEXT NOT NULL CHECK(invariant_digest ~ '^[a-f0-9]{64}$'),
  observed_started_at TIMESTAMPTZ NOT NULL CHECK(isfinite(observed_started_at)),
  observed_completed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK(invariant_json::jsonb=invariant),
  CHECK(observed_started_at<=observed_completed_at),
  CHECK((invariant->>'formatVersion'='1' AND invariant->>'captureId'=capture_id::text
    AND invariant->'authority'->>'operationId'=operation_id::text
    AND invariant->'authority'->>'intentDigest'=intent_digest
    AND invariant->'authority'->>'requestId'=request_id::text
    AND invariant->'authority'->>'requestRevision'=request_revision::text
    AND invariant->'authority'->>'recoveryId'=recovery_id::text
    AND invariant->'authority'->>'epoch'=epoch::text
    AND invariant->'authority'->>'pgVersion'=pg_version::text
    AND invariant->'authority'->>'d1Version'=d1_version::text
    AND invariant->>'invocationDigest'=invocation_digest
    AND invariant->'observation'->>'kind'='completed-early-phase-inventory'
    AND invariant->'observation'->>'version'='1'
    AND invariant->'observation'->>'envelopeDigest'=invocation_digest) IS TRUE)
);
CREATE OR REPLACE FUNCTION page_studio_transfer_reconciliation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE retained_site UUID; head_created TIMESTAMPTZ;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Recovery reconciliation is immutable'; END IF;
  SELECT site_id INTO retained_site FROM page_studio_managed_transfer_intents WHERE operation_id=NEW.operation_id;
  IF retained_site IS NULL THEN RAISE EXCEPTION 'Recovery reconciliation identity mismatch'; END IF;
  -- Same serialization as G1 and original transfer admission. No remote work
  -- takes place while this lock is held by the capture transaction.
  PERFORM id FROM page_studio_sites WHERE id=retained_site FOR NO KEY UPDATE NOWAIT;
  SELECT created_at INTO head_created FROM page_studio_transfer_recovery_heads
    WHERE operation_id=NEW.operation_id AND intent_digest=NEW.intent_digest AND recovery_id=NEW.recovery_id
      AND epoch=NEW.epoch AND cas_version=NEW.pg_version AND mode='reconciling'
      AND deadline>clock_timestamp() AND deadline=(NEW.invariant->'authority'->>'deadline')::timestamptz
      AND review_revision IS NULL AND review_digest IS NULL AND reconciliation_digest IS NULL
      AND admission_id IS NULL AND d1_prepared_digest IS NULL AND applied_grant_digest IS NULL;
  IF head_created IS NULL OR NEW.observed_started_at<head_created OR NEW.observed_started_at>clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM page_studio_transfer_requests WHERE request_id=NEW.request_id
      AND site_id=retained_site AND operation_id=NEW.operation_id AND intent_digest=NEW.intent_digest
      AND revision=NEW.request_revision AND state='reserved')
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_completions WHERE operation_id=NEW.operation_id)
    THEN RAISE EXCEPTION 'Recovery reconciliation authority mismatch'; END IF;
  NEW.observed_completed_at:=clock_timestamp();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_transfer_reconciliation_guard ON page_studio_transfer_recovery_reconciliations;
CREATE TRIGGER page_studio_transfer_reconciliation_guard BEFORE INSERT OR UPDATE OR DELETE ON page_studio_transfer_recovery_reconciliations
  FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_reconciliation_guard();
COMMIT;

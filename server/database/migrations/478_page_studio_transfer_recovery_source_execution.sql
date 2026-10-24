-- Recovery-only immutable association. No upload, schema installation or route
-- selection is authorized by this row; actual Studio/physical fences are separate.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_source_executions (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_executions(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  recovery_id UUID NOT NULL,
  epoch INTEGER NOT NULL CHECK(epoch=1),
  admission_id UUID NOT NULL REFERENCES page_studio_transfer_recovery_applications(admission_id),
  applied_digest TEXT NOT NULL CHECK(applied_digest ~ '^[a-f0-9]{64}$'),
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  recovery_descriptor JSONB NOT NULL CHECK(jsonb_typeof(recovery_descriptor)='object'),
  descriptor_digest TEXT NOT NULL CHECK(descriptor_digest ~ '^[a-f0-9]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION page_studio_transfer_recovery_source_execution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h page_studio_transfer_recovery_heads%ROWTYPE; a page_studio_transfer_recovery_applications%ROWTYPE;
  e page_studio_managed_transfer_executions%ROWTYPE; site UUID;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Recovery source execution association is immutable'; END IF;
  SELECT site_id INTO site FROM page_studio_managed_transfer_intents WHERE operation_id=NEW.operation_id;
  PERFORM id FROM page_studio_sites WHERE id=site FOR NO KEY UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recovery source site is unavailable'; END IF;
  SELECT * INTO h FROM page_studio_transfer_recovery_heads WHERE operation_id=NEW.operation_id;
  SELECT * INTO a FROM page_studio_transfer_recovery_applications WHERE admission_id=NEW.admission_id;
  SELECT * INTO e FROM page_studio_managed_transfer_executions WHERE operation_id=NEW.operation_id;
  IF h.operation_id IS NULL OR a.admission_id IS NULL OR e.operation_id IS NULL
    OR h.mode IS DISTINCT FROM 'applied' OR h.cas_version IS DISTINCT FROM 4 OR h.deadline<=clock_timestamp()
    OR h.intent_digest IS DISTINCT FROM NEW.intent_digest OR h.recovery_id IS DISTINCT FROM NEW.recovery_id
    OR h.epoch IS DISTINCT FROM NEW.epoch OR h.admission_id IS DISTINCT FROM NEW.admission_id
    OR h.applied_grant_digest IS DISTINCT FROM NEW.applied_digest
    OR a.operation_id IS DISTINCT FROM NEW.operation_id OR a.digest IS DISTINCT FROM NEW.applied_digest
    OR a.body->>'recoveryId' IS DISTINCT FROM NEW.recovery_id::text
    OR a.body->>'intentDigest' IS DISTINCT FROM NEW.intent_digest
    OR (a.body->>'deadline')::timestamptz IS DISTINCT FROM h.deadline
    OR e.intent_digest IS DISTINCT FROM NEW.intent_digest OR e.request_digest IS DISTINCT FROM NEW.request_digest
    OR NEW.recovery_descriptor->>'kind' IS DISTINCT FROM 'managed-transfer-recovery-source-v1'
    OR NEW.recovery_descriptor->'formatVersion' IS DISTINCT FROM '1'::jsonb
    OR (NEW.recovery_descriptor->>'layoutDigest' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM TRUE
    OR NEW.recovery_descriptor->'execution'->'version' IS DISTINCT FROM e.request->'policy'->'version'
    OR NEW.recovery_descriptor->'execution'->>'kind' IS DISTINCT FROM 'managed-draft-transfer'
    OR NEW.recovery_descriptor->'execution'->'from' IS DISTINCT FROM e.request->'policy'->'from'
    OR NEW.recovery_descriptor->'execution'->'to' IS DISTINCT FROM e.request->'policy'->'to'
    OR NEW.recovery_descriptor->'execution'->>'accountId' IS DISTINCT FROM e.account_id
    OR NEW.recovery_descriptor->'execution'->>'namespace' IS DISTINCT FROM e.namespace
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_completions WHERE operation_id=NEW.operation_id)
    OR NOT EXISTS(SELECT 1 FROM page_studio_transfer_recovery_reviews r
      JOIN page_studio_transfer_recovery_approvals approval ON approval.review_id=r.review_id
      WHERE r.review_id::text=a.body->>'reviewId' AND r.operation_id=NEW.operation_id
        AND r.recovery_id=NEW.recovery_id AND r.revision=h.review_revision AND r.review_digest=h.review_digest
        AND approval.approval->'freshCapture'->>'digest'=h.reconciliation_digest
        AND h.deadline<=(r.review->>'maximumDeadline')::timestamptz
        AND (SELECT count(*) FROM page_studio_transfer_recovery_consents c WHERE c.review_id=r.review_id
          AND c.expires_at>clock_timestamp() AND c.expires_at>=h.deadline)=2) THEN
    RAISE EXCEPTION 'Recovery source execution requires exact current applied identity';
  END IF;
  NEW.recorded_at:=clock_timestamp();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS transfer_recovery_source_execution_guard ON page_studio_transfer_recovery_source_executions;
CREATE TRIGGER transfer_recovery_source_execution_guard BEFORE INSERT OR UPDATE OR DELETE
  ON page_studio_transfer_recovery_source_executions FOR EACH ROW
  EXECUTE FUNCTION page_studio_transfer_recovery_source_execution_guard();
COMMIT;

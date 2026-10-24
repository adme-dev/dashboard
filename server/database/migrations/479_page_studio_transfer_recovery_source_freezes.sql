-- Immutable source-only Forms freeze association; no D1 effect or physical
-- completion is implied. Canonical JSON and digest recomputation are helper checks.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_source_freezes (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_source_drafts(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  recovery_id UUID NOT NULL,
  epoch INTEGER NOT NULL CHECK(epoch=1),
  admission_id UUID NOT NULL REFERENCES page_studio_transfer_recovery_applications(admission_id),
  applied_digest TEXT NOT NULL CHECK(applied_digest ~ '^[a-f0-9]{64}$'),
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  invocation_id UUID NOT NULL UNIQUE,
  association JSONB NOT NULL CHECK(jsonb_typeof(association)='object'),
  association_json TEXT NOT NULL CHECK(octet_length(association_json)<=16384 AND association_json::jsonb=association),
  association_digest TEXT NOT NULL CHECK(association_digest ~ '^[a-f0-9]{64}$'),
  descriptor JSONB NOT NULL CHECK(jsonb_typeof(descriptor)='object' AND octet_length(descriptor::text)<=1024),
  descriptor_digest TEXT NOT NULL CHECK(descriptor_digest ~ '^[a-f0-9]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION page_studio_transfer_recovery_source_freeze_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h page_studio_transfer_recovery_heads%ROWTYPE; a page_studio_transfer_recovery_applications%ROWTYPE;
  e page_studio_managed_transfer_source_drafts%ROWTYPE; x page_studio_managed_transfer_executions%ROWTYPE;
  source page_studio_transfer_recovery_source_executions%ROWTYPE; site UUID;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Recovery source freeze association is immutable'; END IF;
  SELECT site_id INTO site FROM page_studio_managed_transfer_intents WHERE operation_id=NEW.operation_id;
  PERFORM id FROM page_studio_sites WHERE id=site FOR NO KEY UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recovery source site is unavailable'; END IF;
  SELECT * INTO h FROM page_studio_transfer_recovery_heads WHERE operation_id=NEW.operation_id;
  SELECT * INTO a FROM page_studio_transfer_recovery_applications WHERE admission_id=NEW.admission_id;
  SELECT * INTO e FROM page_studio_managed_transfer_source_drafts WHERE operation_id=NEW.operation_id;
  SELECT * INTO x FROM page_studio_managed_transfer_executions WHERE operation_id=NEW.operation_id;
  SELECT * INTO source FROM page_studio_transfer_recovery_source_executions WHERE operation_id=NEW.operation_id;
  IF h.operation_id IS NULL OR a.admission_id IS NULL OR e.operation_id IS NULL OR x.operation_id IS NULL OR source.operation_id IS NULL
    OR h.mode IS DISTINCT FROM 'applied' OR h.cas_version IS DISTINCT FROM 4 OR h.deadline<=clock_timestamp()
    OR h.intent_digest IS DISTINCT FROM NEW.intent_digest OR h.recovery_id IS DISTINCT FROM NEW.recovery_id
    OR h.epoch IS DISTINCT FROM NEW.epoch OR h.admission_id IS DISTINCT FROM NEW.admission_id
    OR h.applied_grant_digest IS DISTINCT FROM NEW.applied_digest
    OR a.operation_id IS DISTINCT FROM NEW.operation_id OR a.digest IS DISTINCT FROM NEW.applied_digest
    OR a.body->>'recoveryId' IS DISTINCT FROM NEW.recovery_id::text
    OR a.body->>'intentDigest' IS DISTINCT FROM NEW.intent_digest
    OR (a.body->>'deadline')::timestamptz IS DISTINCT FROM h.deadline
    OR e.intent_digest IS DISTINCT FROM NEW.intent_digest OR e.request_digest IS DISTINCT FROM NEW.request_digest
    OR source.intent_digest IS DISTINCT FROM NEW.intent_digest OR source.recovery_id IS DISTINCT FROM NEW.recovery_id
    OR source.epoch IS DISTINCT FROM NEW.epoch OR source.admission_id IS DISTINCT FROM NEW.admission_id
    OR source.applied_digest IS DISTINCT FROM NEW.applied_digest
    OR source.request_digest IS DISTINCT FROM x.request_digest
    OR NEW.descriptor->>'kind' IS DISTINCT FROM 'managed-transfer-recovery-source-freeze-v1'
    OR NEW.descriptor->'formatVersion' IS DISTINCT FROM '1'::jsonb
    OR (NEW.descriptor->>'layoutDigest' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM TRUE
    OR NEW.association->>'kind' IS DISTINCT FROM 'managed-transfer-recovery-source-freeze-v1'
    OR NEW.association->'formatVersion' IS DISTINCT FROM '1'::jsonb
    OR NEW.association->>'operationId' IS DISTINCT FROM NEW.operation_id::text
    OR NEW.association->>'intentDigest' IS DISTINCT FROM NEW.intent_digest
    OR NEW.association->>'recoveryId' IS DISTINCT FROM NEW.recovery_id::text
    OR NEW.association->'epoch' IS DISTINCT FROM '1'::jsonb
    OR NEW.association->>'admissionId' IS DISTINCT FROM NEW.admission_id::text
    OR NEW.association->>'appliedDigest' IS DISTINCT FROM NEW.applied_digest
    OR NEW.association->>'requestDigest' IS DISTINCT FROM NEW.request_digest
    OR NEW.association->>'invocationId' IS DISTINCT FROM NEW.invocation_id::text
    OR NEW.association->>'descriptorDigest' IS DISTINCT FROM NEW.descriptor_digest
    OR NEW.association->>'sourceRequestDigest' IS DISTINCT FROM source.request_digest
    OR NEW.association->>'sourceDescriptorDigest' IS DISTINCT FROM source.descriptor_digest
    OR (NEW.association->>'enabledHeadDigest' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM TRUE
    OR (NEW.association->>'sourceReceiptDigest' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM TRUE
    OR (NEW.association->>'sourceInstallClaimDigest' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM TRUE
    OR (NEW.association->>'sourceSelectionIdentity' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM TRUE
    OR e.request->>'executionIdentity' IS DISTINCT FROM NEW.association->>'sourceSelectionIdentity'
    OR e.request->'fenceIntent'->'scope' IS DISTINCT FROM x.request->'sourceScope'
    OR e.request->'fenceIntent'->'target' IS DISTINCT FROM x.request->'sourceTarget'
    OR e.request->'fenceIntent'->>'transferId' IS DISTINCT FROM NEW.operation_id::text
    OR e.request->'fenceIntent'->>'nativeIntentDigest' IS DISTINCT FROM NEW.intent_digest
    OR NOT EXISTS(SELECT 1 FROM page_studio_transfer_requests r WHERE r.request_id::text=a.request->>'requestId'
      AND r.site_id=site AND r.operation_id=NEW.operation_id AND r.intent_digest=NEW.intent_digest AND r.state='reserved'
      AND r.revision::text=a.request->>'expectedRevision')
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_destination_executions WHERE operation_id=NEW.operation_id)
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_destination_execution_verifications WHERE operation_id=NEW.operation_id)
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_copy_graph_requests WHERE operation_id=NEW.operation_id)
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_copy_graph_verifications WHERE operation_id=NEW.operation_id)
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_forms_history_requests WHERE operation_id=NEW.operation_id)
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_forms_history_verifications WHERE operation_id=NEW.operation_id)
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_completions WHERE operation_id=NEW.operation_id)
    OR NOT EXISTS(SELECT 1 FROM page_studio_transfer_recovery_reviews r
      JOIN page_studio_transfer_recovery_approvals approval ON approval.review_id=r.review_id
      WHERE r.review_id::text=a.body->>'reviewId' AND r.operation_id=NEW.operation_id
        AND r.recovery_id=NEW.recovery_id AND r.revision=h.review_revision AND r.review_digest=h.review_digest
        AND approval.approval->'freshCapture'->>'digest'=h.reconciliation_digest
        AND h.deadline<=(r.review->>'maximumDeadline')::timestamptz
        AND (SELECT count(*) FROM page_studio_transfer_recovery_consents c WHERE c.review_id=r.review_id
          AND c.expires_at>clock_timestamp() AND c.expires_at>=h.deadline)=2) THEN
    RAISE EXCEPTION 'Recovery source freeze requires exact current applied identity';
  END IF;
  NEW.recorded_at:=clock_timestamp();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS transfer_recovery_source_freeze_guard ON page_studio_transfer_recovery_source_freezes;
CREATE TRIGGER transfer_recovery_source_freeze_guard BEFORE INSERT OR UPDATE OR DELETE
  ON page_studio_transfer_recovery_source_freezes FOR EACH ROW
  EXECUTE FUNCTION page_studio_transfer_recovery_source_freeze_guard();
COMMIT;

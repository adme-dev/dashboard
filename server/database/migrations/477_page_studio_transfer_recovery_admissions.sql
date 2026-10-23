-- Non-dispatching PG A1/A3. D1 preparation/enablement and per-effect conjunction
-- are separate; neither this table nor one PG state grants a provider effect.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_admissions (
  admission_id UUID PRIMARY KEY,
  operation_id UUID NOT NULL UNIQUE REFERENCES page_studio_transfer_recovery_heads(operation_id),
  recovery_id UUID NOT NULL,
  review_id UUID NOT NULL,
  revision INTEGER NOT NULL,
  review_digest TEXT NOT NULL,
  body JSONB NOT NULL,
  digest TEXT NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  request JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(admission_id,operation_id),
  FOREIGN KEY(review_id,revision,review_digest) REFERENCES page_studio_transfer_recovery_reviews(review_id,revision,review_digest),
  CHECK((body->>'admissionId'=admission_id::text AND body->>'operationId'=operation_id::text
    AND body->>'recoveryId'=recovery_id::text AND body->>'reviewId'=review_id::text
    AND (body->>'revision')::integer=revision AND body->>'reviewDigest'=review_digest
    AND body->'formatVersion'='1'::jsonb AND body->'epoch'='1'::jsonb AND body->'pgVersion'='3'::jsonb
    AND (body->>'prepareEventId')::uuid<>(body->>'enableEventId')::uuid
    AND (body->>'prepareEventId')::uuid<>recovery_id AND (body->>'enableEventId')::uuid<>recovery_id) IS TRUE)
);
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_applications (
  admission_id UUID PRIMARY KEY,
  operation_id UUID NOT NULL UNIQUE,
  body JSONB NOT NULL,
  digest TEXT NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  request JSONB NOT NULL,
  prepared JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(admission_id,operation_id) REFERENCES page_studio_transfer_recovery_admissions(admission_id,operation_id),
  CHECK((body->>'admissionId'=admission_id::text AND body->>'operationId'=operation_id::text
    AND body->'formatVersion'='1'::jsonb AND body->'epoch'='1'::jsonb AND body->'pgVersion'='4'::jsonb
    AND body->>'preparedDigest'=prepared->'head'->>'preparedDigest'
    AND prepared->'head'->>'admissionId'=admission_id::text
    AND prepared->'head'->>'operationId'=operation_id::text
    AND prepared->'head'->>'mode'='prepared' AND prepared->'head'->'version'='2'::jsonb) IS TRUE)
);
CREATE OR REPLACE FUNCTION page_studio_transfer_recovery_admission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h page_studio_transfer_recovery_heads%ROWTYPE; p page_studio_transfer_recovery_admissions%ROWTYPE; site UUID;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Recovery admission history is immutable'; END IF;
  SELECT site_id INTO site FROM page_studio_managed_transfer_intents WHERE operation_id=NEW.operation_id;
  PERFORM id FROM page_studio_sites WHERE id=site FOR NO KEY UPDATE NOWAIT;
  SELECT * INTO h FROM page_studio_transfer_recovery_heads WHERE operation_id=NEW.operation_id;
  IF h.operation_id IS NULL OR h.epoch<>1 OR h.deadline<=clock_timestamp()
    OR (NEW.body->>'deadline')::timestamptz IS DISTINCT FROM h.deadline
    OR NEW.body->>'intentDigest' IS DISTINCT FROM h.intent_digest
    OR NEW.body->>'recoveryId' IS DISTINCT FROM h.recovery_id::text
    OR NEW.body->>'reviewDigest' IS DISTINCT FROM h.review_digest
    OR (NEW.body->>'revision')::integer IS DISTINCT FROM h.review_revision
    OR NEW.body->>'reconciliationDigest' IS DISTINCT FROM h.reconciliation_digest
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_completions WHERE operation_id=NEW.operation_id)
    OR NOT EXISTS(SELECT 1 FROM page_studio_transfer_recovery_reviews r
      JOIN page_studio_transfer_recovery_approvals a ON a.review_id=r.review_id
      WHERE r.review_id::text=NEW.body->>'reviewId' AND r.operation_id=h.operation_id AND r.recovery_id=h.recovery_id
        AND r.revision=h.review_revision AND r.review_digest=h.review_digest
        AND a.approval->'freshCapture'->>'digest'=h.reconciliation_digest
        AND h.deadline<=(r.review->>'maximumDeadline')::timestamptz
        AND (SELECT count(*) FROM page_studio_transfer_recovery_consents c WHERE c.review_id=r.review_id
          AND c.expires_at>clock_timestamp() AND c.expires_at>=h.deadline)=2) THEN
    RAISE EXCEPTION 'Recovery admission requires exact live approved authority'; END IF;
  IF TG_TABLE_NAME='page_studio_transfer_recovery_admissions' THEN
    IF h.mode<>'approved' OR h.cas_version<>2 OR h.admission_id IS NOT NULL THEN
      RAISE EXCEPTION 'Recovery pending grant requires exact approved head'; END IF;
    NEW.issued_at:=clock_timestamp();
  ELSE
    SELECT * INTO p FROM page_studio_transfer_recovery_admissions WHERE admission_id=NEW.admission_id;
    IF p.admission_id IS NULL OR h.mode<>'pending' OR h.cas_version<>3 OR h.admission_id IS DISTINCT FROM p.admission_id
      OR NEW.body->>'pendingDigest' IS DISTINCT FROM p.digest
      OR NEW.body->>'reviewId' IS DISTINCT FROM p.review_id::text
      OR NEW.prepared->'head'->>'pendingDigest' IS DISTINCT FROM p.digest
      OR NEW.prepared->'prepare'->>'eventId' IS DISTINCT FROM p.body->>'prepareEventId' THEN
      RAISE EXCEPTION 'Recovery applied grant requires exact prepared evidence'; END IF;
    NEW.applied_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS transfer_recovery_admission_guard ON page_studio_transfer_recovery_admissions;
CREATE TRIGGER transfer_recovery_admission_guard BEFORE INSERT OR UPDATE OR DELETE ON page_studio_transfer_recovery_admissions
  FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_recovery_admission_guard();
DROP TRIGGER IF EXISTS transfer_recovery_application_guard ON page_studio_transfer_recovery_applications;
CREATE TRIGGER transfer_recovery_application_guard BEFORE INSERT OR UPDATE OR DELETE ON page_studio_transfer_recovery_applications
  FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_recovery_admission_guard();
ALTER TABLE page_studio_transfer_recovery_heads DROP CONSTRAINT IF EXISTS transfer_recovery_nonadmitting_review;
ALTER TABLE page_studio_transfer_recovery_heads DROP CONSTRAINT IF EXISTS transfer_recovery_admission_states;
ALTER TABLE page_studio_transfer_recovery_heads ADD CONSTRAINT transfer_recovery_admission_states CHECK(
  ((mode IN ('reconciling','revoked') AND review_revision IS NULL AND review_digest IS NULL AND reconciliation_digest IS NULL
    AND admission_id IS NULL AND d1_prepared_digest IS NULL AND applied_grant_digest IS NULL)
   OR (review_revision BETWEEN 1 AND 2147483646 AND review_revision IS NOT NULL
    AND review_digest ~ '^[a-f0-9]{64}$' AND review_digest IS NOT NULL
    AND reconciliation_digest ~ '^[a-f0-9]{64}$' AND reconciliation_digest IS NOT NULL
    AND ((mode IN ('approved','revoked') AND admission_id IS NULL AND d1_prepared_digest IS NULL AND applied_grant_digest IS NULL)
      OR (mode IN ('pending','revoked') AND admission_id IS NOT NULL AND d1_prepared_digest IS NULL AND applied_grant_digest IS NULL)
      OR (mode IN ('applied','revoked') AND admission_id IS NOT NULL AND d1_prepared_digest ~ '^[a-f0-9]{64}$'
        AND d1_prepared_digest IS NOT NULL AND applied_grant_digest ~ '^[a-f0-9]{64}$' AND applied_grant_digest IS NOT NULL)))));
CREATE OR REPLACE FUNCTION page_studio_transfer_recovery_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE retained_digest TEXT; retained_site UUID;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Recovery head is retained'; END IF;
  SELECT intent_digest,site_id INTO retained_digest,retained_site FROM page_studio_managed_transfer_intents WHERE operation_id=NEW.operation_id;
  IF retained_digest IS NULL OR retained_digest<>NEW.intent_digest THEN RAISE EXCEPTION 'Recovery original intent mismatch'; END IF;
  PERFORM id FROM page_studio_sites WHERE id=retained_site FOR NO KEY UPDATE NOWAIT;
  IF TG_OP='INSERT' OR NEW.recovery_id IS DISTINCT FROM OLD.recovery_id THEN
    IF EXISTS(SELECT 1 FROM page_studio_transfer_recovery_events WHERE recovery_id=NEW.recovery_id)
      THEN RAISE EXCEPTION 'Recovery identity cannot be reused'; END IF;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.epoch<>1 OR NEW.cas_version<>1 OR NEW.mode<>'reconciling' OR NEW.deadline<=clock_timestamp()
      THEN RAISE EXCEPTION 'Recovery must begin closed'; END IF;
    NEW.created_at:=clock_timestamp();
  ELSE
    IF ROW(NEW.operation_id,NEW.intent_digest,NEW.created_at) IS DISTINCT FROM ROW(OLD.operation_id,OLD.intent_digest,OLD.created_at)
      OR NEW.cas_version::bigint<>OLD.cas_version::bigint+1 THEN RAISE EXCEPTION 'Recovery identity or CAS mismatch'; END IF;
    IF OLD.mode IN ('reconciling','approved','pending','applied') AND NEW.mode='revoked' THEN
      IF ROW(NEW.epoch,NEW.recovery_id,NEW.deadline,NEW.review_revision,NEW.review_digest,NEW.reconciliation_digest,NEW.admission_id,NEW.d1_prepared_digest,NEW.applied_grant_digest)
        IS DISTINCT FROM ROW(OLD.epoch,OLD.recovery_id,OLD.deadline,OLD.review_revision,OLD.review_digest,OLD.reconciliation_digest,OLD.admission_id,OLD.d1_prepared_digest,OLD.applied_grant_digest)
        THEN RAISE EXCEPTION 'Recovery revocation identity mismatch'; END IF;
    ELSIF OLD.mode='reconciling' AND NEW.mode='approved' THEN
      IF OLD.epoch<>1 OR OLD.cas_version<>1 OR NEW.epoch<>OLD.epoch OR NEW.recovery_id<>OLD.recovery_id
        OR NEW.deadline>OLD.deadline OR NEW.deadline<=clock_timestamp()
        OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_completions WHERE operation_id=NEW.operation_id)
        OR NOT EXISTS(SELECT 1 FROM page_studio_transfer_recovery_reviews r
          JOIN page_studio_transfer_recovery_approvals a ON a.review_id=r.review_id
          WHERE r.operation_id=NEW.operation_id AND r.recovery_id=NEW.recovery_id AND r.revision=NEW.review_revision
            AND r.review_digest=NEW.review_digest AND a.approval->'freshCapture'->>'digest'=NEW.reconciliation_digest
            AND (a.approval->>'deadline')::timestamptz=NEW.deadline
            AND (a.approval->>'headVersion')::integer=NEW.cas_version
            AND NEW.deadline<=(r.review->>'maximumDeadline')::timestamptz
            AND (SELECT count(*) FROM page_studio_transfer_recovery_consents c
              WHERE c.review_id=r.review_id AND c.expires_at>clock_timestamp() AND c.expires_at>=NEW.deadline)=2) THEN
        RAISE EXCEPTION 'Recovery approval requires exact consent evidence'; END IF;
    ELSIF (OLD.mode='approved' AND NEW.mode='pending') OR (OLD.mode='pending' AND NEW.mode='applied') THEN
      IF OLD.epoch<>1 OR ROW(NEW.epoch,NEW.recovery_id,NEW.deadline,NEW.review_revision,NEW.review_digest,NEW.reconciliation_digest)
        IS DISTINCT FROM ROW(OLD.epoch,OLD.recovery_id,OLD.deadline,OLD.review_revision,OLD.review_digest,OLD.reconciliation_digest)
        OR NEW.deadline<=clock_timestamp()
        OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_completions WHERE operation_id=NEW.operation_id)
        OR NOT EXISTS(SELECT 1 FROM page_studio_transfer_recovery_reviews r
          WHERE r.operation_id=NEW.operation_id AND r.recovery_id=NEW.recovery_id AND r.revision=NEW.review_revision
            AND r.review_digest=NEW.review_digest AND NEW.deadline<=(r.review->>'maximumDeadline')::timestamptz
            AND (SELECT count(*) FROM page_studio_transfer_recovery_consents c WHERE c.review_id=r.review_id
              AND c.expires_at>clock_timestamp() AND c.expires_at>=NEW.deadline)=2) THEN
        RAISE EXCEPTION 'Recovery admission identity or deadline changed'; END IF;
      IF NEW.mode='pending' THEN
        IF OLD.cas_version<>2 OR NEW.cas_version<>3 OR NOT EXISTS(
          SELECT 1 FROM page_studio_transfer_recovery_admissions p WHERE p.admission_id=NEW.admission_id
            AND p.operation_id=NEW.operation_id AND p.recovery_id=NEW.recovery_id AND p.revision=NEW.review_revision
            AND p.review_digest=NEW.review_digest AND p.body->>'reconciliationDigest'=NEW.reconciliation_digest
            AND (p.body->>'deadline')::timestamptz=NEW.deadline) THEN
          RAISE EXCEPTION 'Recovery pending CAS requires exact immutable grant'; END IF;
      ELSE
        IF OLD.cas_version<>3 OR NEW.cas_version<>4 OR NEW.admission_id IS DISTINCT FROM OLD.admission_id
          OR NOT EXISTS(SELECT 1 FROM page_studio_transfer_recovery_applications a WHERE a.admission_id=NEW.admission_id
            AND a.operation_id=NEW.operation_id AND a.digest=NEW.applied_grant_digest
            AND a.body->>'preparedDigest'=NEW.d1_prepared_digest
            AND (a.body->>'deadline')::timestamptz=NEW.deadline) THEN
          RAISE EXCEPTION 'Recovery applied CAS requires exact immutable grant'; END IF;
      END IF;
    ELSIF OLD.mode='revoked' AND NEW.mode='reconciling' THEN
      IF NEW.epoch::bigint<>OLD.epoch::bigint+1 OR NEW.recovery_id=OLD.recovery_id OR NEW.deadline<=clock_timestamp()
        THEN RAISE EXCEPTION 'Recovery next epoch mismatch'; END IF;
    ELSE RAISE EXCEPTION 'Recovery admission is not implemented'; END IF;
  END IF;
  NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
COMMIT;

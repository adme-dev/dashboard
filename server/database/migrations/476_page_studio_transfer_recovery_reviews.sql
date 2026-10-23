-- Review/consent only. Approved is not admission; every admission field remains null.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_reviews (
  review_id UUID PRIMARY KEY,
  operation_id UUID NOT NULL REFERENCES page_studio_transfer_recovery_heads(operation_id),
  recovery_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 2147483646),
  review_digest TEXT NOT NULL CHECK(review_digest ~ '^[a-f0-9]{64}$'),
  review JSONB NOT NULL,
  request JSONB NOT NULL,
  operator_login_hash TEXT NOT NULL CHECK(operator_login_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(operation_id,recovery_id,revision), UNIQUE(review_id,revision,review_digest),
  CHECK((review->>'reviewId'=review_id::text AND (review->>'revision')::integer=revision
    AND review->'evidence'->'authority'->>'operationId'=operation_id::text
    AND review->'evidence'->'authority'->>'recoveryId'=recovery_id::text) IS TRUE)
);
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_consents (
  consent_id UUID PRIMARY KEY,
  review_id UUID NOT NULL,
  revision INTEGER NOT NULL,
  review_digest TEXT NOT NULL,
  party TEXT NOT NULL CHECK(party IN ('owner','operator')),
  actor_id UUID NOT NULL,
  login_hash TEXT NOT NULL CHECK(login_hash ~ '^[a-f0-9]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL CHECK(isfinite(expires_at)),
  UNIQUE(review_id,party),
  FOREIGN KEY(review_id,revision,review_digest) REFERENCES page_studio_transfer_recovery_reviews(review_id,revision,review_digest),
  CHECK(expires_at>issued_at)
);
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_approvals (
  approval_id UUID PRIMARY KEY,
  review_id UUID NOT NULL UNIQUE REFERENCES page_studio_transfer_recovery_reviews(review_id),
  fresh_capture_id UUID NOT NULL UNIQUE REFERENCES page_studio_transfer_recovery_reconciliations(capture_id),
  approval JSONB NOT NULL,
  approval_digest TEXT NOT NULL CHECK(approval_digest ~ '^[a-f0-9]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK((approval->>'approvalId'=approval_id::text AND approval->>'reviewId'=review_id::text
    AND approval->'freshCapture'->>'captureId'=fresh_capture_id::text) IS TRUE)
);
CREATE OR REPLACE FUNCTION page_studio_transfer_recovery_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r page_studio_transfer_recovery_reviews%ROWTYPE; h page_studio_transfer_recovery_heads%ROWTYPE; site UUID; expiry TIMESTAMPTZ;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Recovery review history is immutable'; END IF;
  IF TG_TABLE_NAME='page_studio_transfer_recovery_reviews' THEN r:=NEW;
  ELSE SELECT * INTO r FROM page_studio_transfer_recovery_reviews WHERE review_id=NEW.review_id; END IF;
  SELECT site_id INTO site FROM page_studio_managed_transfer_intents WHERE operation_id=r.operation_id;
  PERFORM id FROM page_studio_sites WHERE id=site FOR NO KEY UPDATE NOWAIT;
  SELECT * INTO h FROM page_studio_transfer_recovery_heads WHERE operation_id=r.operation_id;
  IF h.mode<>'reconciling' OR h.epoch<>1 OR h.cas_version<>1 OR h.recovery_id<>r.recovery_id
    OR h.deadline<=clock_timestamp() OR h.review_digest IS NOT NULL
    OR EXISTS(SELECT 1 FROM page_studio_managed_transfer_completions WHERE operation_id=r.operation_id) THEN
    RAISE EXCEPTION 'Recovery review requires exact closed authority'; END IF;
  expiry:=(r.review->>'maximumDeadline')::timestamptz;
  IF expiry IS NULL OR NOT isfinite(expiry) OR expiry<=clock_timestamp() OR expiry>h.deadline THEN
    RAISE EXCEPTION 'Recovery review deadline is unavailable'; END IF;
  IF TG_TABLE_NAME='page_studio_transfer_recovery_reviews' THEN
    IF NEW.revision<>COALESCE((SELECT max(revision) FROM page_studio_transfer_recovery_reviews
      WHERE operation_id=r.operation_id AND recovery_id=r.recovery_id),0)+1
      OR (r.review->'evidence'->'authority'->>'pgVersion')::integer IS DISTINCT FROM h.cas_version
      OR r.review->'evidence'->'authority'->>'intentDigest' IS DISTINCT FROM h.intent_digest THEN
      RAISE EXCEPTION 'Recovery review revision changed'; END IF;
    NEW.created_at:=clock_timestamp();
  ELSIF TG_TABLE_NAME='page_studio_transfer_recovery_consents' THEN
    IF NEW.actor_id::text IS DISTINCT FROM (CASE WHEN NEW.party='owner' THEN r.review->'evidence'->'principals'->>'identityId'
      ELSE r.review->'evidence'->'principals'->>'operatorId' END) OR NEW.expires_at>expiry THEN
      RAISE EXCEPTION 'Recovery consent identity or deadline mismatch'; END IF;
    NEW.issued_at:=clock_timestamp();
  ELSE
    IF (SELECT count(*) FROM page_studio_transfer_recovery_consents WHERE review_id=r.review_id
      AND expires_at>clock_timestamp())<>2
      OR NOT EXISTS(SELECT 1 FROM page_studio_transfer_recovery_reconciliations c
        WHERE c.capture_id=NEW.fresh_capture_id AND c.operation_id=h.operation_id AND c.recovery_id=h.recovery_id
          AND c.pg_version=h.cas_version AND c.d1_version=1
          AND c.invariant_digest=NEW.approval->'freshCapture'->>'digest') THEN
      RAISE EXCEPTION 'Recovery approval evidence is unavailable'; END IF;
    NEW.recorded_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS transfer_recovery_review_guard ON page_studio_transfer_recovery_reviews;
CREATE TRIGGER transfer_recovery_review_guard BEFORE INSERT OR UPDATE OR DELETE ON page_studio_transfer_recovery_reviews
  FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_recovery_review_guard();
DROP TRIGGER IF EXISTS transfer_recovery_consent_guard ON page_studio_transfer_recovery_consents;
CREATE TRIGGER transfer_recovery_consent_guard BEFORE INSERT OR UPDATE OR DELETE ON page_studio_transfer_recovery_consents
  FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_recovery_review_guard();
DROP TRIGGER IF EXISTS transfer_recovery_approval_guard ON page_studio_transfer_recovery_approvals;
CREATE TRIGGER transfer_recovery_approval_guard BEFORE INSERT OR UPDATE OR DELETE ON page_studio_transfer_recovery_approvals
  FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_recovery_review_guard();
DO $$ DECLARE c TEXT; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='page_studio_transfer_recovery_heads'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%review_revision IS NULL%'
  LOOP EXECUTE format('ALTER TABLE page_studio_transfer_recovery_heads DROP CONSTRAINT %I',c); END LOOP;
END $$;
ALTER TABLE page_studio_transfer_recovery_heads ADD CONSTRAINT transfer_recovery_nonadmitting_review CHECK(
  admission_id IS NULL AND d1_prepared_digest IS NULL AND applied_grant_digest IS NULL
  AND ((mode IN ('reconciling','revoked') AND review_revision IS NULL AND review_digest IS NULL AND reconciliation_digest IS NULL)
    OR (mode IN ('approved','revoked') AND review_revision BETWEEN 1 AND 2147483646
      AND review_digest ~ '^[a-f0-9]{64}$' AND reconciliation_digest ~ '^[a-f0-9]{64}$'
      AND review_revision IS NOT NULL AND review_digest IS NOT NULL AND reconciliation_digest IS NOT NULL)));
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
    IF OLD.mode IN ('reconciling','approved') AND NEW.mode='revoked' THEN
      IF ROW(NEW.epoch,NEW.recovery_id,NEW.deadline,NEW.review_revision,NEW.review_digest,NEW.reconciliation_digest)
        IS DISTINCT FROM ROW(OLD.epoch,OLD.recovery_id,OLD.deadline,OLD.review_revision,OLD.review_digest,OLD.reconciliation_digest)
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
    ELSIF OLD.mode='revoked' AND NEW.mode='reconciling' THEN
      IF NEW.epoch::bigint<>OLD.epoch::bigint+1 OR NEW.recovery_id=OLD.recovery_id OR NEW.deadline<=clock_timestamp()
        THEN RAISE EXCEPTION 'Recovery next epoch mismatch'; END IF;
    ELSE RAISE EXCEPTION 'Recovery admission is not implemented'; END IF;
  END IF;
  NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
COMMIT;

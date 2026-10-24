-- Version-dispatched review/consent guard. No route or customer activation.
BEGIN;
CREATE OR REPLACE FUNCTION page_studio_transfer_recovery_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r page_studio_transfer_recovery_reviews%ROWTYPE; h page_studio_transfer_recovery_heads%ROWTYPE; site UUID; expiry TIMESTAMPTZ;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Recovery review history is immutable'; END IF;
  IF TG_TABLE_NAME='page_studio_transfer_recovery_reviews' THEN r:=NEW;
  ELSE SELECT * INTO r FROM page_studio_transfer_recovery_reviews WHERE review_id=NEW.review_id; END IF;
  SELECT site_id INTO site FROM page_studio_managed_transfer_intents WHERE operation_id=r.operation_id;
  PERFORM id FROM page_studio_sites WHERE id=site FOR NO KEY UPDATE NOWAIT;
  SELECT * INTO h FROM page_studio_transfer_recovery_heads WHERE operation_id=r.operation_id;
  -- Continuations retain the original native lineage but obtain new consent.
  -- The v1 branch below remains byte-for-byte unchanged.
  IF r.review->>'formatVersion'='2' THEN
    IF TG_TABLE_NAME='page_studio_transfer_recovery_approvals' THEN
      RAISE EXCEPTION 'Continuation grants cannot use legacy approvals'; END IF;
    IF r.review->>'kind' IS DISTINCT FROM 'managed-transfer-continuation-review-v2'
      OR r.review->>'remainingWork' IS DISTINCT FROM 'same-operation-source-through-retention'
      OR h.epoch IS DISTINCT FROM 1 OR h.recovery_id IS DISTINCT FROM r.recovery_id
      OR NOT ((h.mode='applied' AND h.cas_version=4) OR (h.mode='revoked' AND h.cas_version=5)) IS TRUE
      OR r.review->'evidence'->'authority'->>'intentDigest' IS DISTINCT FROM h.intent_digest
      OR NOT EXISTS(SELECT 1 FROM page_studio_transfer_recovery_source_freezes f
        WHERE f.operation_id=h.operation_id AND f.intent_digest=h.intent_digest
          AND f.association->>'enabledHeadDigest'=r.review->'predecessor'->>'originalRecoveryHeadDigest'
          AND f.association->>'enabledHeadDigest'=r.review->'evidence'->'authority'->>'originalRecoveryHeadDigest'
          AND f.association->>'enabledHeadDigest'=r.review->'progress'->>'originalRecoveryHeadDigest'
          AND f.association->>'recoveryId'=r.recovery_id::text
          AND f.admission_id=h.admission_id
          AND f.association->>'appliedDigest'=h.applied_grant_digest) THEN
      RAISE EXCEPTION 'Continuation review original lineage mismatch'; END IF;
    expiry:=(r.review->>'maximumDeadline')::timestamptz;
    IF NOT (isfinite(expiry) AND expiry>clock_timestamp()
      AND expiry>(r.review->>'issuedAt')::timestamptz
      AND expiry<=(r.review->>'issuedAt')::timestamptz+interval '1 hour'
      AND (r.review->>'issuedAt')::timestamptz<=clock_timestamp()
      AND date_trunc('milliseconds',expiry)=expiry) IS TRUE THEN
      RAISE EXCEPTION 'Continuation review deadline is unavailable'; END IF;
    IF TG_TABLE_NAME='page_studio_transfer_recovery_reviews' THEN
      IF NEW.revision<>COALESCE((SELECT max(revision) FROM page_studio_transfer_recovery_reviews
        WHERE operation_id=r.operation_id AND recovery_id=r.recovery_id),0)+1 THEN
        RAISE EXCEPTION 'Continuation review revision changed'; END IF;
      NEW.created_at:=clock_timestamp();
    ELSE
      IF r.revision IS DISTINCT FROM (SELECT max(revision) FROM page_studio_transfer_recovery_reviews
        WHERE operation_id=r.operation_id AND recovery_id=r.recovery_id)
        OR NEW.actor_id::text IS DISTINCT FROM (CASE WHEN NEW.party='owner' THEN r.review->'evidence'->'principals'->>'identityId'
          ELSE r.review->'evidence'->'principals'->>'operatorId' END)
        OR NEW.expires_at>expiry OR NEW.expires_at<=clock_timestamp()
        OR date_trunc('milliseconds',NEW.expires_at)<>NEW.expires_at THEN
        RAISE EXCEPTION 'Continuation consent identity or deadline mismatch'; END IF;
      NEW.issued_at:=date_trunc('milliseconds',clock_timestamp());
    END IF;
    RETURN NEW;
  END IF;
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
-- Exact canonical projection matching projectContinuationConsent. The v2 guard
-- stores millisecond timestamps, so no precision is silently discarded here.
CREATE OR REPLACE FUNCTION page_studio_continuation_consent_digest(c page_studio_transfer_recovery_consents)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT AS $$
 SELECT encode(sha256(convert_to(
  '{"actorId":'||to_json(c.actor_id::text)::text||',"consentId":'||to_json(c.consent_id::text)::text
  ||',"expiresAt":'||to_json(to_char(c.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text
  ||',"formatVersion":2,"issuedAt":'||to_json(to_char(c.issued_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text
  ||',"kind":"managed-transfer-continuation-consent-v2","loginHash":'||to_json(c.login_hash)::text
  ||',"party":'||to_json(c.party)::text||',"reviewDigest":'||to_json(c.review_digest)::text
  ||',"reviewId":'||to_json(c.review_id::text)::text||',"revision":'||c.revision::text||'}','UTF8')),'hex')
$$;
CREATE OR REPLACE FUNCTION page_studio_continuation_grant_consent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r page_studio_transfer_recovery_reviews%ROWTYPE; owner_consent page_studio_transfer_recovery_consents%ROWTYPE;
  operator_consent page_studio_transfer_recovery_consents%ROWTYPE; site UUID; deadline TIMESTAMPTZ;
BEGIN
  SELECT site_id INTO site FROM page_studio_managed_transfer_intents WHERE operation_id=NEW.operation_id;
  PERFORM id FROM page_studio_sites WHERE id=site FOR NO KEY UPDATE NOWAIT;
  SELECT * INTO r FROM page_studio_transfer_recovery_reviews
    WHERE operation_id=NEW.operation_id AND review_digest=NEW.body->>'reviewDigest'
    ORDER BY revision DESC LIMIT 1;
  deadline:=(NEW.body->>'deadline')::timestamptz;
  IF r.review_id IS NULL OR r.review->>'formatVersion' IS DISTINCT FROM '2'
    OR r.review->>'kind' IS DISTINCT FROM 'managed-transfer-continuation-review-v2'
    OR r.revision IS DISTINCT FROM (SELECT max(revision) FROM page_studio_transfer_recovery_reviews
      WHERE operation_id=NEW.operation_id AND recovery_id=r.recovery_id)
    OR r.review->>'continuationId' IS DISTINCT FROM NEW.body->>'continuationId'
    OR r.review->'predecessor' IS DISTINCT FROM NEW.body->'predecessor'
    OR r.review->>'authorityDigest' IS DISTINCT FROM NEW.body->>'authorityDigest'
    OR r.review->>'descriptorDigest' IS DISTINCT FROM NEW.body->>'descriptorDigest'
    OR r.review->>'progressDigest' IS DISTINCT FROM NEW.body->>'progressDigest'
    OR deadline>(r.review->>'maximumDeadline')::timestamptz THEN
    RAISE EXCEPTION 'Continuation grant review changed'; END IF;
  SELECT * INTO owner_consent FROM page_studio_transfer_recovery_consents WHERE review_id=r.review_id AND party='owner';
  SELECT * INTO operator_consent FROM page_studio_transfer_recovery_consents WHERE review_id=r.review_id AND party='operator';
  IF owner_consent.consent_id IS NULL OR operator_consent.consent_id IS NULL
    OR owner_consent.expires_at<deadline OR operator_consent.expires_at<deadline
    OR owner_consent.expires_at<=clock_timestamp() OR operator_consent.expires_at<=clock_timestamp()
    OR owner_consent.issued_at>(NEW.body->>'issuedAt')::timestamptz
    OR operator_consent.issued_at>(NEW.body->>'issuedAt')::timestamptz
    OR date_trunc('milliseconds',owner_consent.issued_at)<>owner_consent.issued_at
    OR date_trunc('milliseconds',operator_consent.issued_at)<>operator_consent.issued_at
    OR page_studio_continuation_consent_digest(owner_consent) IS DISTINCT FROM NEW.body->>'ownerConsentDigest'
    OR page_studio_continuation_consent_digest(operator_consent) IS DISTINCT FROM NEW.body->>'operatorConsentDigest' THEN
    RAISE EXCEPTION 'Continuation grant requires exact fresh consents'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS transfer_continuation_grant_consent_guard ON page_studio_transfer_recovery_continuations;
CREATE TRIGGER transfer_continuation_grant_consent_guard BEFORE INSERT ON page_studio_transfer_recovery_continuations
  FOR EACH ROW WHEN (NEW.kind='grant') EXECUTE FUNCTION page_studio_continuation_grant_consent_guard();
COMMIT;

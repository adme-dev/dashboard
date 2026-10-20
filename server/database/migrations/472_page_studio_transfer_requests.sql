-- Retained consent only. Existing immutable transfer intents and source selections
-- are untouched. Expired pre-reservation rows are explicitly retired under locks.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_transfer_requests (
  request_id UUID PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES page_studio_sites(id),
  entitlement_id UUID NOT NULL REFERENCES page_studio_entitlements(id),
  owner_account_id UUID NOT NULL REFERENCES page_studio_customer_accounts(id),
  owner_identity_id UUID NOT NULL REFERENCES page_studio_customer_identities(id),
  workspace_id UUID NOT NULL REFERENCES page_studio_customer_workspaces(id),
  owner_login_session_hash TEXT NOT NULL CHECK(owner_login_session_hash ~ '^[a-f0-9]{64}$'),
  owner_proof JSONB NOT NULL CHECK(jsonb_typeof(owner_proof)='object' AND octet_length(owner_proof::text)<=8192),
  operation_id UUID NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  state TEXT NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','reviewed','approved','reserving','reserved','revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  operator_id UUID,
  operator_login_session_hash TEXT CHECK(operator_login_session_hash ~ '^[a-f0-9]{64}$'),
  operator_proof JSONB,
  transfer_authority JSONB,
  source_digest TEXT CHECK(source_digest ~ '^[a-f0-9]{64}$'),
  review JSONB,
  review_revision INTEGER,
  approved_revision INTEGER,
  approved_at TIMESTAMPTZ,
  intent_digest TEXT CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state NOT IN ('reviewed','approved','reserving','reserved') OR
    (operator_id IS NOT NULL AND operator_login_session_hash IS NOT NULL AND operator_proof IS NOT NULL
      AND transfer_authority IS NOT NULL AND source_digest IS NOT NULL AND review IS NOT NULL AND review_revision IS NOT NULL)) IS TRUE),
  CHECK ((state NOT IN ('approved','reserving','reserved') OR (approved_at IS NOT NULL AND approved_revision IS NOT NULL)) IS TRUE),
  CHECK (state<>'reserved' OR intent_digest IS NOT NULL),
  CHECK (state<>'revoked' OR revoked_at IS NOT NULL),
  CHECK (review IS NULL OR (jsonb_typeof(review)='object' AND octet_length(review::text)<=2048)),
  CHECK (transfer_authority IS NULL OR (jsonb_typeof(transfer_authority)='object' AND octet_length(transfer_authority::text)<=8192)),
  CHECK (operator_proof IS NULL OR (jsonb_typeof(operator_proof)='object' AND octet_length(operator_proof::text)<=2048))
);
CREATE UNIQUE INDEX IF NOT EXISTS page_studio_transfer_requests_active_site
  ON page_studio_transfer_requests(site_id) WHERE state<>'revoked';
CREATE INDEX IF NOT EXISTS page_studio_transfer_requests_site_history
  ON page_studio_transfer_requests(site_id,created_at DESC,request_id);
-- Preserve original consent credentials even if a later caller accidentally tries
-- to repurpose a row. Replacement requests get a fresh row, never fresh authority
-- in an old operation. Terminal/reserving history cannot be discarded.
CREATE OR REPLACE FUNCTION page_studio_transfer_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Transfer request history is retained'; END IF;
  IF ROW(NEW.request_id,NEW.site_id,NEW.entitlement_id,NEW.owner_account_id,NEW.owner_identity_id,
      NEW.workspace_id,NEW.owner_login_session_hash,NEW.owner_proof,NEW.operation_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.request_id,OLD.site_id,OLD.entitlement_id,OLD.owner_account_id,OLD.owner_identity_id,
      OLD.workspace_id,OLD.owner_login_session_hash,OLD.owner_proof,OLD.operation_id,OLD.created_at)
    THEN RAISE EXCEPTION 'Original transfer request identity is immutable'; END IF;
  IF NEW.expires_at>OLD.expires_at THEN RAISE EXCEPTION 'Original transfer request expiry cannot be extended'; END IF;
  IF NEW.revision<>OLD.revision+1 OR NOT (
       (OLD.state='requested' AND NEW.state IN ('reviewed','revoked'))
    OR (OLD.state='reviewed' AND NEW.state IN ('reviewed','approved','revoked'))
    OR (OLD.state='approved' AND NEW.state IN ('reserving','revoked'))
    OR (OLD.state='reserving' AND NEW.state='reserved'))
    THEN RAISE EXCEPTION 'Transfer request transition must preserve retained history'; END IF;
  IF OLD.operator_id IS NOT NULL AND ROW(NEW.operator_id,NEW.operator_login_session_hash,NEW.operator_proof,NEW.transfer_authority)
    IS DISTINCT FROM ROW(OLD.operator_id,OLD.operator_login_session_hash,OLD.operator_proof,OLD.transfer_authority)
    THEN RAISE EXCEPTION 'Original reviewed transfer authority is immutable'; END IF;
  IF NEW.state<>'reviewed' AND ROW(NEW.source_digest,NEW.review,NEW.review_revision)
    IS DISTINCT FROM ROW(OLD.source_digest,OLD.review,OLD.review_revision)
    THEN RAISE EXCEPTION 'Reviewed source must remain retained'; END IF;
  IF OLD.state IN ('approved','reserving') AND ROW(NEW.approved_revision,NEW.approved_at)
    IS DISTINCT FROM ROW(OLD.approved_revision,OLD.approved_at)
    THEN RAISE EXCEPTION 'Original transfer approval is immutable'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_transfer_request_guard ON page_studio_transfer_requests;
CREATE TRIGGER page_studio_transfer_request_guard BEFORE UPDATE OR DELETE ON page_studio_transfer_requests
  FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_request_guard();
COMMIT;

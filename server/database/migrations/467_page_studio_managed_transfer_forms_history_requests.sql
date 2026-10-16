-- Immutable private typed history admission; no copy, selection or publication.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_forms_history_requests (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_destination_execution_verifications(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  source_request_digest TEXT NOT NULL CHECK(source_request_digest ~ '^[a-f0-9]{64}$'),
  destination_proof_digest TEXT NOT NULL CHECK(destination_proof_digest ~ '^[a-f0-9]{64}$'),
  request JSONB NOT NULL,
  request_json TEXT NOT NULL CHECK(octet_length(request_json)<=131072),
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  expected_receipt JSONB NOT NULL,
  expected_receipt_json TEXT NOT NULL CHECK(octet_length(expected_receipt_json)<=16384),
  expected_receipt_digest TEXT NOT NULL CHECK(expected_receipt_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK(request_json::jsonb=request AND expected_receipt_json::jsonb=expected_receipt),
  CHECK((jsonb_typeof(request)='object' AND request->>'formatVersion'='1'
    AND request->>'operationId'=operation_id::text AND request->>'intentDigest'=intent_digest
    AND request->'sourceRequest'->>'operationId'=operation_id::text
    AND request->'destinationProof'->>'digest'=destination_proof_digest
    AND request->'importRequest'->'intent'->>'transferId'=operation_id::text
    AND request->'importRequest'->'intent'->>'nativeIntentDigest'=intent_digest
    AND expected_receipt->>'digest'=expected_receipt_digest
    AND expected_receipt->>'transferId'=operation_id::text
    AND expected_receipt->>'nativeIntentDigest'=intent_digest
    AND expected_receipt->>'planDigest'=request->'importRequest'->>'planDigest'
    AND expected_receipt->'source'->>'historyDigest'=request->'importRequest'->>'historyDigest') IS TRUE)
);
CREATE OR REPLACE FUNCTION managed_transfer_forms_history_admission() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM page_studio_managed_transfer_source_drafts s
    JOIN page_studio_managed_transfer_destination_execution_verifications d ON d.operation_id=s.operation_id
    WHERE s.operation_id=NEW.operation_id AND s.intent_digest=NEW.intent_digest
      AND s.request_digest=NEW.source_request_digest AND s.request=NEW.request->'sourceRequest'
      AND d.intent_digest=NEW.intent_digest AND d.proof_digest=NEW.destination_proof_digest AND d.proof=NEW.request->'destinationProof') THEN
    RAISE EXCEPTION 'Forms history admission does not match retained original prerequisites';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS managed_transfer_forms_history_admission ON page_studio_managed_transfer_forms_history_requests;
CREATE TRIGGER managed_transfer_forms_history_admission BEFORE INSERT ON page_studio_managed_transfer_forms_history_requests
  FOR EACH ROW EXECUTE FUNCTION managed_transfer_forms_history_admission();
DROP TRIGGER IF EXISTS managed_transfer_forms_history_immutable ON page_studio_managed_transfer_forms_history_requests;
CREATE TRIGGER managed_transfer_forms_history_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_forms_history_requests
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;

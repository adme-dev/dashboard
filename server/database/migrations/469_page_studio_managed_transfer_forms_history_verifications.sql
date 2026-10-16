-- Historical independent history inspection. Final selection must re-inspect.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_forms_history_verifications (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_forms_history_requests(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  receipt JSONB NOT NULL,
  receipt_json TEXT NOT NULL CHECK(octet_length(receipt_json)<=16384),
  receipt_digest TEXT NOT NULL CHECK(receipt_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK(receipt_json::jsonb=receipt),
  CHECK((jsonb_typeof(receipt)='object' AND receipt->>'formatVersion'='1'
    AND receipt->>'transferId'=operation_id::text AND receipt->>'nativeIntentDigest'=intent_digest
    AND receipt->>'digest'=receipt_digest AND receipt->'destination'->'scope'->>'environment'='production') IS TRUE)
);
CREATE OR REPLACE FUNCTION managed_transfer_forms_history_verification_admission() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM page_studio_managed_transfer_forms_history_requests r
    WHERE r.operation_id=NEW.operation_id AND r.intent_digest=NEW.intent_digest
      AND r.request_digest=NEW.request_digest AND r.expected_receipt_digest=NEW.receipt_digest
      AND r.expected_receipt=NEW.receipt AND r.expected_receipt_json=NEW.receipt_json) THEN
    RAISE EXCEPTION 'Forms history verification does not match retained typed admission';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS managed_transfer_forms_history_verify_admission ON page_studio_managed_transfer_forms_history_verifications;
CREATE TRIGGER managed_transfer_forms_history_verify_admission BEFORE INSERT ON page_studio_managed_transfer_forms_history_verifications
  FOR EACH ROW EXECUTE FUNCTION managed_transfer_forms_history_verification_admission();
DROP TRIGGER IF EXISTS managed_transfer_forms_history_verify_immutable ON page_studio_managed_transfer_forms_history_verifications;
CREATE TRIGGER managed_transfer_forms_history_verify_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_forms_history_verifications
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;

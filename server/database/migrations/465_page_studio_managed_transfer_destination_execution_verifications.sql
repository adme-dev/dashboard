-- Historical private execution inspection only; never final destination selection.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_destination_execution_verifications (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_destination_executions(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  execution_identity TEXT NOT NULL CHECK(execution_identity ~ '^[a-f0-9]{64}$'),
  proof JSONB NOT NULL,
  proof_json TEXT NOT NULL CHECK(octet_length(proof_json)<=65536),
  proof_digest TEXT NOT NULL CHECK(proof_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK(proof_json::jsonb=proof),
  CHECK((jsonb_typeof(proof)='object'
    AND proof->>'formatVersion'='1'
    AND proof->>'operationId'=operation_id::text
    AND proof->>'intentDigest'=intent_digest
    AND proof->>'requestDigest'=request_digest
    AND proof->>'digest'=proof_digest
    AND proof->'envelope'->>'kind'='managed-execution'
    AND proof->'envelope'->'execution'->>'identity'=execution_identity
    AND proof->'envelope'->'route'->'scope'->>'environment'='production') IS TRUE)
);
CREATE OR REPLACE FUNCTION page_studio_managed_transfer_destination_verification_admission() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM page_studio_managed_transfer_destination_executions r
    WHERE r.operation_id=NEW.operation_id AND r.intent_digest=NEW.intent_digest AND r.request_digest=NEW.request_digest) THEN
    RAISE EXCEPTION 'Prepared destination verification does not match retained request';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS managed_transfer_destination_verification_admission ON page_studio_managed_transfer_destination_execution_verifications;
CREATE TRIGGER managed_transfer_destination_verification_admission BEFORE INSERT ON page_studio_managed_transfer_destination_execution_verifications
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_destination_verification_admission();
DROP TRIGGER IF EXISTS managed_transfer_destination_verification_immutable ON page_studio_managed_transfer_destination_execution_verifications;
CREATE TRIGGER managed_transfer_destination_verification_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_destination_execution_verifications
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;

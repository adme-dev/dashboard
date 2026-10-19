-- Private copy/graph admission only. No accepted objects or authoring selection.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_copy_graph_requests (
 operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_destination_execution_verifications(operation_id),
 intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
 destination_proof_digest TEXT NOT NULL CHECK(destination_proof_digest ~ '^[a-f0-9]{64}$'),
 request JSONB NOT NULL,
 request_json TEXT NOT NULL CHECK(octet_length(request_json)<=12000000),
 request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(request_json::jsonb=request),
 CHECK((jsonb_typeof(request)='object' AND request->>'formatVersion'='1'
   AND request->>'operationId'=operation_id::text AND request->>'intentDigest'=intent_digest
   AND request->>'destinationExecutionProofDigest'=destination_proof_digest
   AND request->'copy'->>'transferId'=operation_id::text
   AND request->'copy'->'destination'->'scope'->>'environment'='production'
   AND request->'copy'->'destination'->'freezeReceipt'->'request'->>'adoptionId'='transfer_' || operation_id::text || '_destination') IS TRUE)
);
CREATE OR REPLACE FUNCTION page_studio_managed_transfer_copy_admission() RETURNS trigger AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM page_studio_managed_transfer_destination_execution_verifications v
   WHERE v.operation_id=NEW.operation_id AND v.intent_digest=NEW.intent_digest AND v.proof_digest=NEW.destination_proof_digest) THEN
   RAISE EXCEPTION 'Copy admission does not match verified destination';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS managed_transfer_copy_admission ON page_studio_managed_transfer_copy_graph_requests;
CREATE TRIGGER managed_transfer_copy_admission BEFORE INSERT ON page_studio_managed_transfer_copy_graph_requests
 FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_copy_admission();
DROP TRIGGER IF EXISTS managed_transfer_copy_immutable ON page_studio_managed_transfer_copy_graph_requests;
CREATE TRIGGER managed_transfer_copy_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_copy_graph_requests
 FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;

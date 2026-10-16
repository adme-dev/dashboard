-- Private destination execution request only; no freeze, installation or selection.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_destination_executions (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_catalogue_verifications(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  request JSONB NOT NULL,
  request_json TEXT NOT NULL CHECK(octet_length(request_json)<=65536),
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  account_id TEXT NOT NULL CHECK(account_id ~ '^[a-f0-9]{32}$'),
  namespace TEXT NOT NULL CHECK(namespace='xeroflow-page-studio-dispatch-production'),
  script_name TEXT NOT NULL CHECK(script_name ~ '^ps-content-[a-f0-9]{32}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(account_id,namespace,script_name),
  CHECK(request_json::jsonb=request),
  CHECK((jsonb_typeof(request)='object'
    AND request->>'formatVersion'='1'
    AND request->>'operationId'=operation_id::text
    AND request->>'intentDigest'=intent_digest
    AND request->'catalogueRequest'->>'operationId'=operation_id::text
    AND request->'catalogueRequest'->>'intentDigest'=intent_digest
    AND request->'catalogueReceipt'->>'operationId'=operation_id::text
    AND request->'catalogueReceipt'->>'intentDigest'=intent_digest
    AND request->'freezeRequest'->'scope'->>'environment'='production'
    AND request->'freezeRequest'->>'adoptionId'='transfer_' || operation_id::text || '_destination'
    AND request->'successor'->>'accountId'=account_id
    AND request->'successor'->>'namespace'=namespace
    AND request->'successor'->>'scriptName'=script_name
    AND request->'successor'->'scope'->>'environment'='production') IS TRUE)
);
DROP TRIGGER IF EXISTS page_studio_managed_transfer_destination_executions_immutable ON page_studio_managed_transfer_destination_executions;
CREATE TRIGGER page_studio_managed_transfer_destination_executions_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_destination_executions
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;
